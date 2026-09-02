"""Controlled PocketPilot debug-session transition rules."""

from dataclasses import dataclass
from typing import ClassVar

from pocketpilot_agent.models import AgentEventName, DebugState


class InvalidTransitionError(ValueError):
    """Raised when a requested workflow transition is not legal."""


class RetryLimitExceededError(ValueError):
    """Raised when a failed session exceeds the controlled retry budget."""


@dataclass(frozen=True, slots=True)
class TransitionDecision:
    event_name: AgentEventName
    retry_count: int


class DebugStateMachine:
    """Single source of truth for session states, events, and retry bounds."""

    max_retries = 2
    transitions: ClassVar[dict[DebugState, frozenset[DebugState]]] = {
        DebugState.IDLE: frozenset({DebugState.CAPTURED}),
        DebugState.CAPTURED: frozenset({DebugState.ANALYZING, DebugState.FAILED}),
        DebugState.ANALYZING: frozenset(
            {DebugState.ROOT_CAUSE_FOUND, DebugState.FAILED}
        ),
        DebugState.ROOT_CAUSE_FOUND: frozenset(
            {DebugState.PATCH_GENERATED, DebugState.FAILED}
        ),
        DebugState.PATCH_GENERATED: frozenset(
            {DebugState.AWAITING_APPROVAL, DebugState.FAILED}
        ),
        DebugState.AWAITING_APPROVAL: frozenset(
            {DebugState.PATCH_APPLYING, DebugState.FAILED}
        ),
        DebugState.PATCH_APPLYING: frozenset(
            {DebugState.TESTING, DebugState.FAILED}
        ),
        DebugState.TESTING: frozenset({DebugState.SUCCESS, DebugState.FAILED}),
        DebugState.SUCCESS: frozenset({DebugState.ROLLED_BACK}),
        DebugState.FAILED: frozenset({DebugState.ANALYZING, DebugState.ROLLED_BACK}),
        DebugState.ROLLED_BACK: frozenset(),
    }

    def decide(
        self,
        source: DebugState,
        target: DebugState,
        retry_count: int,
    ) -> TransitionDecision:
        if target not in self.transitions[source]:
            raise InvalidTransitionError(f"Cannot transition from {source} to {target}.")
        next_retry_count = retry_count
        if source is DebugState.FAILED and target is DebugState.ANALYZING:
            if retry_count >= self.max_retries:
                raise RetryLimitExceededError("Session retry limit has been reached.")
            next_retry_count += 1
            return TransitionDecision(AgentEventName.RETRY_STARTED, next_retry_count)
        return TransitionDecision(self._event_for(source, target), next_retry_count)

    @staticmethod
    def _event_for(source: DebugState, target: DebugState) -> AgentEventName:
        if target is DebugState.FAILED:
            if source is DebugState.ANALYZING:
                return AgentEventName.ANALYSIS_FAILED
            return (
                AgentEventName.TESTS_FAILED
                if source is DebugState.TESTING
                else AgentEventName.SESSION_FAILED
            )
        events = {
            DebugState.CAPTURED: AgentEventName.ERROR_CAPTURED,
            DebugState.ANALYZING: AgentEventName.ANALYSIS_STARTED,
            DebugState.ROOT_CAUSE_FOUND: AgentEventName.ROOT_CAUSE_FOUND,
            DebugState.PATCH_GENERATED: AgentEventName.PATCH_GENERATED,
            DebugState.AWAITING_APPROVAL: AgentEventName.APPROVAL_REQUESTED,
            DebugState.PATCH_APPLYING: AgentEventName.PATCH_APPROVED,
            DebugState.TESTING: AgentEventName.TESTS_STARTED,
            DebugState.SUCCESS: AgentEventName.TESTS_PASSED,
            DebugState.ROLLED_BACK: AgentEventName.ROLLBACK_COMPLETED,
        }
        try:
            return events[target]
        except KeyError as exc:
            raise InvalidTransitionError("Transition has no structured event mapping.") from exc
