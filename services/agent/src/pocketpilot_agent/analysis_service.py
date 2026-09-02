"""Orchestrate read-only local root-cause analysis through the session state machine."""

from __future__ import annotations

import asyncio
import time
from datetime import UTC, datetime

from pocketpilot_agent.analysis_prompts import AnalysisPromptBuilder
from pocketpilot_agent.analysis_provider import (
    AnalysisProviderError,
    LLMProvider,
    complete_with_timeout,
)
from pocketpilot_agent.analysis_store import AnalysisStore
from pocketpilot_agent.analysis_validation import (
    AnalysisResultValidator,
    InvalidAnalysisResponseError,
)
from pocketpilot_agent.error_parser import ErrorParser
from pocketpilot_agent.event_broker import SessionEventBroker
from pocketpilot_agent.models import (
    AgentEventName,
    AnalysisExecutionResponse,
    AnalysisRecord,
    AnalysisRepositorySummary,
    AnalysisRequest,
    AnalysisStatus,
    AnalysisTimings,
    AnalyzeSessionRequest,
    DebugState,
    ErrorInputType,
    ProviderHealth,
)
from pocketpilot_agent.repository_context import RepositoryContextService
from pocketpilot_agent.session_service import DebugSessionService


class AnalysisInProgressError(RuntimeError):
    pass


class UnsupportedAnalysisInputError(ValueError):
    pass


class AnalysisService:
    def __init__(
        self,
        *,
        sessions: DebugSessionService,
        events: SessionEventBroker,
        context: RepositoryContextService,
        provider: LLMProvider,
        store: AnalysisStore,
        timeout_seconds: float,
    ) -> None:
        self.sessions = sessions
        self.events = events
        self.context = context
        self.provider = provider
        self.store = store
        self.timeout_seconds = timeout_seconds
        self.parser = ErrorParser()
        self.prompts = AnalysisPromptBuilder()
        self.validator = AnalysisResultValidator()
        self._in_flight: set[str] = set()
        self._lock = asyncio.Lock()

    async def analyze(
        self, session_id: str, request: AnalyzeSessionRequest
    ) -> AnalysisExecutionResponse:
        if request.input_type is not ErrorInputType.TEXT:
            raise UnsupportedAnalysisInputError("Milestone 3 accepts TEXT input only.")
        await self._claim(session_id)
        started = time.perf_counter()
        analyzing_revision: int | None = None
        try:
            current = self.sessions.get(session_id)
            if current.revision != request.expected_revision:
                from pocketpilot_agent.session_store import SessionRevisionConflictError

                raise SessionRevisionConflictError(
                    "Session changed since the analysis request; refresh and retry."
                )
            await self._progress(
                session_id,
                AgentEventName.ANALYSIS_REQUESTED,
                "Local root-cause analysis requested.",
            )
            transitioned = self.sessions.transition(
                session_id,
                DebugState.ANALYZING,
                request.expected_revision,
                "Read-only local analysis started.",
            )
            analyzing_revision = transitioned.session.revision
            await self.events.publish(transitioned.event)

            parse_started = time.perf_counter()
            parsed = self.parser.parse(
                request.raw_text, request.language_hint, request.framework_hint
            )
            parse_ms = self._elapsed(parse_started)
            await self._progress(
                session_id,
                AgentEventName.ERROR_PARSED,
                f"Parsed {parsed.language} error metadata with {len(parsed.frames)} frame(s).",
            )

            await self._progress(
                session_id,
                AgentEventName.CONTEXT_COLLECTION_STARTED,
                "Bounded repository context collection started.",
            )
            context_started = time.perf_counter()
            context_selection = self.context.collect(parsed, request.file_hint)
            context_files = context_selection.files
            context_ms = self._elapsed(context_started)
            for item in context_files:
                await self._progress(
                    session_id,
                    AgentEventName.CONTEXT_FILE_SELECTED,
                    (
                        f"Selected {item.summary.relative_path} lines "
                        f"{item.summary.line_start}-{item.summary.line_end}."
                    ),
                )
            await self._progress(
                session_id,
                AgentEventName.CONTEXT_COLLECTION_COMPLETED,
                f"Collected {len(context_files)} bounded file window(s).",
            )

            workspace = self.context.workspace_service.current()
            provider_request = AnalysisRequest(
                session_id=session_id,
                parsed_error=parsed,
                repository_summary=AnalysisRepositorySummary(
                    project_types=[item.project_type for item in workspace.project_types],
                    frameworks=[item.name for item in workspace.frameworks],
                    build_systems=workspace.build_systems,
                ),
                context_files=[item.summary for item in context_files],
                language=parsed.language,
                framework=parsed.framework,
                retry_number=transitioned.session.retry_count,
            )
            prompt = self.prompts.build(
                parsed, request.raw_text, context_files, provider_request
            )
            await self._progress(
                session_id,
                AgentEventName.ANALYSIS_PROVIDER_STARTED,
                f"Started local {self.provider.name} provider.",
            )
            provider_started = time.perf_counter()
            raw = await complete_with_timeout(self.provider, prompt, self.timeout_seconds)
            provider_ms = self._elapsed(provider_started)
            await self._progress(
                session_id,
                AgentEventName.ANALYSIS_PROVIDER_COMPLETED,
                "Local provider response received.",
            )

            validation_started = time.perf_counter()
            try:
                result = self.validator.validate(raw, context_files)
            except InvalidAnalysisResponseError:
                repair = self.prompts.repair(raw)
                repair_started = time.perf_counter()
                repaired = await complete_with_timeout(
                    self.provider, repair, self.timeout_seconds
                )
                provider_ms += self._elapsed(repair_started)
                try:
                    result = self.validator.validate(repaired, context_files)
                except InvalidAnalysisResponseError as exc:
                    raise AnalysisProviderError(
                        AnalysisStatus.INVALID_RESPONSE,
                        "The local model response remained invalid after one JSON repair attempt.",
                    ) from exc
            validation_ms = self._elapsed(validation_started)
            await self._progress(
                session_id,
                AgentEventName.ANALYSIS_VALIDATION_COMPLETED,
                "Structured analysis and repository references validated.",
            )
            timings = AnalysisTimings(
                parse_ms=parse_ms,
                context_ms=context_ms,
                provider_ms=provider_ms,
                validation_ms=validation_ms,
                total_ms=self._elapsed(started),
            )
            record = AnalysisRecord(
                session_id=session_id,
                status=AnalysisStatus.COMPLETED,
                provider=self.provider.name,
                model=self.provider.model,
                parsed_error=parsed,
                context_files=[item.summary for item in context_files],
                context_truncated=context_selection.truncated,
                result=result,
                timings=timings,
                created_at=datetime.now(UTC),
            )
            self.store.save(record)
            completed = self.sessions.transition(
                session_id,
                DebugState.ROOT_CAUSE_FOUND,
                analyzing_revision,
                "Validated local root cause is ready for review.",
            )
            await self.events.publish(completed.event)
            return AnalysisExecutionResponse(session=completed.session, analysis=record)
        except AnalysisProviderError:
            if analyzing_revision is not None:
                await self._fail(session_id, analyzing_revision)
            raise
        except Exception:
            if analyzing_revision is not None:
                await self._fail(session_id, analyzing_revision)
            raise
        finally:
            async with self._lock:
                self._in_flight.discard(session_id)

    async def health(self) -> ProviderHealth:
        return await self.provider.health()

    async def _claim(self, session_id: str) -> None:
        async with self._lock:
            if session_id in self._in_flight:
                raise AnalysisInProgressError("Analysis is already running for this session.")
            self._in_flight.add(session_id)

    async def _progress(
        self, session_id: str, name: AgentEventName, summary: str
    ) -> None:
        result = self.sessions.append_event(session_id, name, summary)
        await self.events.publish(result.event)

    async def _fail(self, session_id: str, revision: int) -> None:
        current = self.sessions.get(session_id)
        if current.state is not DebugState.ANALYZING or current.revision != revision:
            return
        failed = self.sessions.transition(
            session_id,
            DebugState.FAILED,
            revision,
            "Local root-cause analysis failed safely; no files or commands were changed.",
        )
        await self.events.publish(failed.event)

    @staticmethod
    def _elapsed(started: float) -> int:
        return max(0, round((time.perf_counter() - started) * 1000))
