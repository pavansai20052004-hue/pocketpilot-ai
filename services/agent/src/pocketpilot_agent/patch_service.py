"""Revision-bound patch generation, approval, application, verification, and rollback."""

from __future__ import annotations

import asyncio
import hashlib
import time
import uuid
from datetime import UTC, datetime

from pydantic import ValidationError

from pocketpilot_agent.analysis_provider import AnalysisProviderError
from pocketpilot_agent.analysis_store import AnalysisStore
from pocketpilot_agent.event_broker import SessionEventBroker
from pocketpilot_agent.models import (
    ActionSource,
    AgentEventName,
    AnalysisStatus,
    CommandStatus,
    ContextFileSummary,
    DebugSession,
    DebugState,
    PatchActionResponse,
    PatchApplicationResult,
    PatchFileChange,
    PatchGenerationResponse,
    PatchProposal,
    PatchProviderOutput,
    PatchStatus,
    PatchWorkflowView,
    RollbackStatus,
    ValidationResult,
)
from pocketpilot_agent.patch_engine import PatchEngine, RollbackConflictError
from pocketpilot_agent.patch_prompts import PatchPromptBuilder, PatchSourceFile
from pocketpilot_agent.patch_provider import PatchProvider
from pocketpilot_agent.patch_store import PatchStore, PatchWorkflowRecord
from pocketpilot_agent.patch_validation import PatchValidator
from pocketpilot_agent.security import RepositorySecurityPolicy, WorkspaceSecurityError
from pocketpilot_agent.session_service import DebugSessionService
from pocketpilot_agent.session_store import SessionRevisionConflictError
from pocketpilot_agent.unified_diff import UnifiedDiffError, UnifiedDiffParser
from pocketpilot_agent.validation_selector import ValidationCommandSelector
from pocketpilot_agent.workspace import SelectedWorkspace, WorkspaceService


class PatchOperationConflictError(RuntimeError):
    pass


class InvalidPatchProposalError(ValueError):
    pass


class RepairablePatchProposalError(InvalidPatchProposalError):
    """A malformed provider response that may receive one constrained repair."""


class PatchDecisionError(ValueError):
    pass


def _action_source_suffix(source: ActionSource) -> str:
    return " through a confirmed voice action" if source is ActionSource.VOICE else ""


class PatchService:
    def __init__(
        self,
        *,
        sessions: DebugSessionService,
        events: SessionEventBroker,
        workspace: WorkspaceService,
        analyses: AnalysisStore,
        store: PatchStore,
        provider: PatchProvider,
        validator: PatchValidator,
        timeout_seconds: float,
    ) -> None:
        self.sessions = sessions
        self.events = events
        self.workspace = workspace
        self.analyses = analyses
        self.store = store
        self.provider = provider
        self.validator = validator
        self.engine = PatchEngine(validator)
        self.timeout_seconds = timeout_seconds
        self.prompts = PatchPromptBuilder()
        self.diff_parser = UnifiedDiffParser()
        self.command_selector = ValidationCommandSelector()
        self.security_policy = RepositorySecurityPolicy()
        self._active: set[str] = set()
        self._lock = asyncio.Lock()

    async def generate(
        self,
        session_id: str,
        expected_revision: int,
        action_source: ActionSource = ActionSource.MOBILE_UI,
    ) -> PatchGenerationResponse:
        await self._claim(session_id)
        transitioned = False
        try:
            session = self._require_revision(session_id, expected_revision)
            if session.state is not DebugState.ROOT_CAUSE_FOUND:
                raise PatchDecisionError("Patch generation requires ROOT_CAUSE_FOUND state.")
            analysis = self.analyses.get(session_id)
            selected = self.workspace.selected_for_analysis()
            sources = self._sources(analysis.context_files, selected)
            await self._progress(
                session_id,
                AgentEventName.PATCH_GENERATION_STARTED,
                f"Untrusted local patch generation started{_action_source_suffix(action_source)}.",
            )
            generation_started = time.perf_counter()
            prompt = self.prompts.build(session_id, analysis, sources, session.retry_count)
            try:
                raw = await asyncio.wait_for(
                    self.provider.generate(prompt, sources), self.timeout_seconds
                )
            except TimeoutError as exc:
                raise AnalysisProviderError(
                    AnalysisStatus.TIMEOUT, "Local patch generation timed out."
                ) from exc
            supplied = {item.relative_path: item for item in sources}
            await self._progress(
                session_id,
                AgentEventName.PATCH_VALIDATION_STARTED,
                "Deterministic patch validation started.",
            )
            repaired = False
            while True:
                try:
                    proposal = self._proposal_from_raw(
                        raw=raw,
                        session_id=session_id,
                        retry_number=session.retry_count,
                        sources=sources,
                        generation_duration_ms=self._elapsed(generation_started),
                    )
                    validation, _ = self.validator.validate(
                        proposal, selected, set(supplied)
                    )
                    if not validation.valid:
                        reasons = "; ".join(validation.errors[:5])
                        raise RepairablePatchProposalError(
                            "Deterministic patch validation failed: " + reasons
                        )
                    break
                except RepairablePatchProposalError as exc:
                    if repaired:
                        raise InvalidPatchProposalError(
                            "Patch provider output remained malformed after one repair attempt."
                        ) from exc
                    repair_prompt = self.prompts.repair(prompt, raw, str(exc))
                    try:
                        raw = await asyncio.wait_for(
                            self.provider.generate(repair_prompt, sources),
                            self.timeout_seconds,
                        )
                    except TimeoutError as timeout_exc:
                        raise AnalysisProviderError(
                            AnalysisStatus.TIMEOUT,
                            "Local patch repair timed out.",
                        ) from timeout_exc
                    repaired = True
            proposal = proposal.model_copy(
                update={"generation_duration_ms": self._elapsed(generation_started)}
            )
            await self._progress(
                session_id,
                AgentEventName.PATCH_VALIDATION_COMPLETED,
                f"Patch validation completed with {validation.risk} risk.",
            )
            record = PatchWorkflowRecord(
                status=PatchStatus.PROPOSED,
                proposal=proposal,
                validation=validation,
            )
            self.store.save(record)
            generated = self.sessions.transition(
                session_id,
                DebugState.PATCH_GENERATED,
                expected_revision,
                "Validated patch proposal generated; repository remains unchanged.",
            )
            transitioned = True
            await self.events.publish(generated.event)
            awaiting = self.sessions.transition(
                session_id,
                DebugState.AWAITING_APPROVAL,
                generated.session.revision,
                "Patch is awaiting explicit human approval.",
            )
            await self.events.publish(awaiting.event)
            record.status = PatchStatus.AWAITING_APPROVAL
            self.store.save(record)
            return PatchGenerationResponse(session=awaiting.session, workflow=record.view())
        except Exception:
            if not transitioned:
                await self._fail_generation(session_id, expected_revision)
            raise
        finally:
            await self._release(session_id)

    async def reject(
        self,
        session_id: str,
        patch_id: str,
        expected_revision: int,
        action_source: ActionSource = ActionSource.MOBILE_UI,
    ) -> PatchActionResponse:
        await self._claim(session_id)
        try:
            session = self._require_revision(session_id, expected_revision)
            record = self._current_patch(session_id, patch_id)
            if (
                session.state is not DebugState.AWAITING_APPROVAL
                or record.status is not PatchStatus.AWAITING_APPROVAL
            ):
                raise PatchDecisionError("Only the current awaiting patch can be rejected.")
            rejected = self.sessions.transition(
                session_id,
                DebugState.FAILED,
                expected_revision,
                (
                    f"Patch rejected by the user{_action_source_suffix(action_source)}; "
                    "no files were modified."
                ),
            )
            await self.events.publish(rejected.event)
            record.status = PatchStatus.REJECTED
            self.store.save(record)
            return PatchActionResponse(session=rejected.session, workflow=record.view())
        finally:
            await self._release(session_id)

    async def approve(
        self,
        session_id: str,
        patch_id: str,
        expected_revision: int,
        action_source: ActionSource = ActionSource.MOBILE_UI,
    ) -> PatchActionResponse:
        await self._claim(session_id)
        applying_revision: int | None = None
        try:
            session = self._require_revision(session_id, expected_revision)
            record = self._current_patch(session_id, patch_id)
            if (
                session.state is not DebugState.AWAITING_APPROVAL
                or record.status is not PatchStatus.AWAITING_APPROVAL
            ):
                raise PatchDecisionError("Only the current awaiting patch can be approved.")
            if not record.validation.valid or record.validation.risk.value in {"HIGH", "BLOCKED"}:
                raise PatchDecisionError("High-risk or blocked patches cannot be approved.")
            approved = self.sessions.transition(
                session_id,
                DebugState.PATCH_APPLYING,
                expected_revision,
                (
                    "Exact validated patch approved by the user"
                    f"{_action_source_suffix(action_source)}."
                ),
            )
            applying_revision = approved.session.revision
            await self.events.publish(approved.event)
            record.status = PatchStatus.APPROVED
            self.store.save(record)
            await self._progress(
                session_id,
                AgentEventName.PATCH_APPLY_STARTED,
                "Hash-guarded atomic patch application started.",
            )
            selected = self.workspace.selected_for_analysis()
            supplied = {item.relative_path for item in self.analyses.get(session_id).context_files}
            rendered, snapshot, _ = self.engine.prepare(
                record.proposal, selected, supplied, applying_revision
            )
            record.status = PatchStatus.APPLYING
            record.snapshot = snapshot
            record.rollback_status = RollbackStatus.AVAILABLE
            record.application = PatchApplicationResult(
                patch_id=patch_id,
                status=PatchStatus.APPLYING,
                files_changed=0,
                applied_at=None,
                duration_ms=0,
            )
            self.store.save(record)
            apply_ms = self.engine.apply(selected, rendered, snapshot)
            for item in record.proposal.files:
                await self._progress(
                    session_id,
                    AgentEventName.PATCH_FILE_APPLIED,
                    f"Applied validated change to {item.relative_path}.",
                )
            await self._progress(
                session_id,
                AgentEventName.PATCH_APPLIED,
                "Approved patch applied and content hashes verified.",
            )
            record.status = PatchStatus.APPLIED
            record.application = PatchApplicationResult(
                patch_id=patch_id,
                status=PatchStatus.APPLIED,
                files_changed=len(record.proposal.files),
                applied_at=datetime.now(UTC),
                duration_ms=apply_ms,
            )
            self.store.save(record)
            testing = self.sessions.transition(
                session_id,
                DebugState.TESTING,
                applying_revision,
                "Deterministically selected safe validation command started.",
            )
            await self.events.publish(testing.event)
            test_started = time.perf_counter()
            command = self.command_selector.select(self.workspace.commands().commands)
            command_result = self.workspace.run_command(command.id) if command else None
            passed = command_result is not None and command_result.status is CommandStatus.PASSED
            test_result = ValidationResult(
                patch_id=patch_id,
                command=command_result,
                passed=passed,
                duration_ms=self._elapsed(test_started),
                detail=(
                    "Allowlisted validation command passed."
                    if passed
                    else "No passing allowlisted validation command was available."
                ),
            )
            final_state = DebugState.SUCCESS if passed else DebugState.FAILED
            finished = self.sessions.transition(
                session_id,
                final_state,
                testing.session.revision,
                test_result.detail,
            )
            await self.events.publish(finished.event)
            record.test_result = test_result
            record.status = PatchStatus.VERIFIED if passed else PatchStatus.FAILED
            self.store.save(record)
            return PatchActionResponse(session=finished.session, workflow=record.view())
        except Exception as exc:
            if applying_revision is not None:
                await self._fail_apply(session_id, applying_revision, exc)
            raise
        finally:
            await self._release(session_id)

    async def rollback(
        self,
        session_id: str,
        patch_id: str,
        expected_revision: int,
        action_source: ActionSource = ActionSource.MOBILE_UI,
    ) -> PatchActionResponse:
        await self._claim(session_id)
        try:
            session = self._require_revision(session_id, expected_revision)
            record = self._current_patch(session_id, patch_id)
            if session.state not in {DebugState.SUCCESS, DebugState.FAILED}:
                raise PatchDecisionError("Rollback requires a completed patch attempt.")
            if record.snapshot is None or record.rollback_status is not RollbackStatus.AVAILABLE:
                raise PatchDecisionError("No rollback snapshot is available.")
            await self._progress(
                session_id,
                AgentEventName.ROLLBACK_STARTED,
                f"Conflict-safe rollback started{_action_source_suffix(action_source)}.",
            )
            try:
                rollback_ms = self.engine.rollback(
                    self.workspace.selected_for_analysis(), record.snapshot
                )
            except RollbackConflictError:
                record.rollback_status = RollbackStatus.CONFLICT
                self.store.save(record)
                await self._progress(
                    session_id,
                    AgentEventName.ROLLBACK_FAILED,
                    "Rollback blocked because a patched file has newer changes.",
                )
                raise
            rolled_back = self.sessions.transition(
                session_id,
                DebugState.ROLLED_BACK,
                expected_revision,
                "Original files restored from the PocketPilot snapshot.",
            )
            await self.events.publish(rolled_back.event)
            record.status = PatchStatus.ROLLED_BACK
            record.rollback_status = RollbackStatus.COMPLETED
            record.rollback_duration_ms = rollback_ms
            self.store.save(record)
            return PatchActionResponse(session=rolled_back.session, workflow=record.view())
        finally:
            await self._release(session_id)

    def get(self, session_id: str) -> PatchWorkflowView:
        self.sessions.get(session_id)
        return self.store.get(session_id).view()

    def _proposal_from_raw(
        self,
        *,
        raw: str,
        session_id: str,
        retry_number: int,
        sources: list[PatchSourceFile],
        generation_duration_ms: int,
    ) -> PatchProposal:
        try:
            output = PatchProviderOutput.model_validate_json(raw)
        except ValidationError as exc:
            raise RepairablePatchProposalError(
                "Patch provider returned invalid structured JSON."
            ) from exc
        supplied = {item.relative_path: item for item in sources}
        changes: list[PatchFileChange] = []
        for item in output.files:
            source = supplied.get(item.relative_path)
            if source is None:
                raise InvalidPatchProposalError(
                    f"Patch provider referenced an unsupplied file: {item.relative_path}."
                )
            try:
                parsed = self.diff_parser.parse(item.unified_diff)
            except UnifiedDiffError as exc:
                raise RepairablePatchProposalError(str(exc)) from exc
            if parsed.relative_path != item.relative_path:
                raise RepairablePatchProposalError(
                    "Unified diff header path does not match its declared relative_path."
                )
            changes.append(
                PatchFileChange(
                    relative_path=item.relative_path,
                    unified_diff=item.unified_diff,
                    explanation=item.explanation,
                    original_sha256=source.sha256,
                    additions=parsed.additions,
                    deletions=parsed.deletions,
                )
            )
        try:
            return PatchProposal(
                id=str(uuid.uuid4()),
                session_id=session_id,
                title=output.title,
                summary=output.summary,
                rationale=output.rationale,
                confidence=output.confidence,
                files=changes,
                expected_effect=output.expected_effect,
                risks=output.risks,
                validation_notes=output.validation_notes,
                created_at=datetime.now(UTC),
                provider=self.provider.name,
                model=self.provider.model,
                retry_number=retry_number,
                generation_duration_ms=generation_duration_ms,
            )
        except ValidationError as exc:
            raise RepairablePatchProposalError(
                "Patch provider fields violate proposal constraints."
            ) from exc

    def _sources(
        self,
        summaries: list[ContextFileSummary],
        selected: SelectedWorkspace,
    ) -> list[PatchSourceFile]:
        sources: list[PatchSourceFile] = []
        for summary in summaries:
            lexical = selected.resolver.root / summary.relative_path
            if self.security_policy.is_reparse_point(lexical):
                raise WorkspaceSecurityError(
                    "Patch context file became a link or reparse point."
                )
            path = selected.resolver.resolve_relative(summary.relative_path)
            raw = path.read_bytes()
            text = raw.decode("utf-8")
            lines = text.replace("\r\n", "\n").replace("\r", "\n").split("\n")
            sources.append(
                PatchSourceFile(
                    relative_path=summary.relative_path,
                    content="\n".join(
                        lines[summary.line_start - 1 : summary.line_end]
                    ),
                    sha256=hashlib.sha256(raw).hexdigest(),
                    line_start=summary.line_start,
                    line_end=summary.line_end,
                )
            )
        return sources

    def _require_revision(
        self, session_id: str, expected_revision: int
    ) -> DebugSession:
        session = self.sessions.get(session_id)
        if session.revision != expected_revision:
            raise SessionRevisionConflictError(
                "Session changed since the patch request; refresh and retry."
            )
        return session

    def _current_patch(self, session_id: str, patch_id: str) -> PatchWorkflowRecord:
        record = self.store.get(session_id)
        if record.proposal.id != patch_id:
            raise PatchDecisionError("Patch ID does not match the current proposal.")
        return record

    async def _progress(self, session_id: str, name: AgentEventName, summary: str) -> None:
        result = self.sessions.append_event(session_id, name, summary)
        await self.events.publish(result.event)

    async def _fail_generation(self, session_id: str, revision: int) -> None:
        session = self.sessions.get(session_id)
        if session.state is DebugState.ROOT_CAUSE_FOUND and session.revision == revision:
            failed = self.sessions.transition(
                session_id, DebugState.FAILED, revision, "Patch generation failed safely."
            )
            await self.events.publish(failed.event)

    async def _fail_apply(self, session_id: str, revision: int, exc: Exception) -> None:
        session = self.sessions.get(session_id)
        if session.state is DebugState.PATCH_APPLYING and session.revision == revision:
            failed = self.sessions.transition(
                session_id,
                DebugState.FAILED,
                revision,
                f"Patch application failed safely: {type(exc).__name__}.",
            )
            await self.events.publish(failed.event)
        elif session.state is DebugState.TESTING:
            failed = self.sessions.transition(
                session_id,
                DebugState.FAILED,
                session.revision,
                f"Patch verification failed safely: {type(exc).__name__}.",
            )
            await self.events.publish(failed.event)
        record = self.store.get(session_id)
        record.status = PatchStatus.FAILED
        record.application = PatchApplicationResult(
            patch_id=record.proposal.id,
            status=PatchStatus.FAILED,
            files_changed=(
                record.application.files_changed if record.application is not None else 0
            ),
            applied_at=(
                record.application.applied_at if record.application is not None else None
            ),
            duration_ms=(
                record.application.duration_ms if record.application is not None else 0
            ),
            error=type(exc).__name__,
        )
        if record.snapshot is None:
            record.rollback_status = RollbackStatus.UNAVAILABLE
        self.store.save(record)

    async def _claim(self, session_id: str) -> None:
        async with self._lock:
            if session_id in self._active:
                raise PatchOperationConflictError(
                    "Another patch operation is already active for this session."
                )
            self._active.add(session_id)

    async def _release(self, session_id: str) -> None:
        async with self._lock:
            self._active.discard(session_id)

    @staticmethod
    def _elapsed(started: float) -> int:
        return max(0, round((time.perf_counter() - started) * 1000))
