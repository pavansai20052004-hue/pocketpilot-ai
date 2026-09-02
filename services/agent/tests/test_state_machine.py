"""Controlled debug-session state-machine tests."""

import pytest

from pocketpilot_agent.models import AgentEventName, DebugState
from pocketpilot_agent.state_machine import (
    DebugStateMachine,
    InvalidTransitionError,
    RetryLimitExceededError,
)


def test_happy_path_has_one_event_mapping_per_transition() -> None:
    machine = DebugStateMachine()
    path = [
        DebugState.CAPTURED,
        DebugState.ANALYZING,
        DebugState.ROOT_CAUSE_FOUND,
        DebugState.PATCH_GENERATED,
        DebugState.AWAITING_APPROVAL,
        DebugState.PATCH_APPLYING,
        DebugState.TESTING,
        DebugState.SUCCESS,
    ]
    current = DebugState.IDLE
    events: list[AgentEventName] = []

    for target in path:
        decision = machine.decide(current, target, retry_count=0)
        events.append(decision.event_name)
        current = target

    assert events == [
        AgentEventName.ERROR_CAPTURED,
        AgentEventName.ANALYSIS_STARTED,
        AgentEventName.ROOT_CAUSE_FOUND,
        AgentEventName.PATCH_GENERATED,
        AgentEventName.APPROVAL_REQUESTED,
        AgentEventName.PATCH_APPROVED,
        AgentEventName.TESTS_STARTED,
        AgentEventName.TESTS_PASSED,
    ]


@pytest.mark.parametrize(
    ("source", "target"),
    [
        (DebugState.IDLE, DebugState.SUCCESS),
        (DebugState.CAPTURED, DebugState.TESTING),
        (DebugState.SUCCESS, DebugState.ANALYZING),
        (DebugState.ROLLED_BACK, DebugState.IDLE),
    ],
)
def test_invalid_transition_is_rejected(source: DebugState, target: DebugState) -> None:
    with pytest.raises(InvalidTransitionError):
        DebugStateMachine().decide(source, target, retry_count=0)


def test_testing_failure_uses_tests_failed_event() -> None:
    decision = DebugStateMachine().decide(
        DebugState.TESTING, DebugState.FAILED, retry_count=0
    )

    assert decision.event_name is AgentEventName.TESTS_FAILED


def test_retry_increments_and_is_bounded() -> None:
    machine = DebugStateMachine()

    first = machine.decide(DebugState.FAILED, DebugState.ANALYZING, retry_count=0)
    second = machine.decide(
        DebugState.FAILED, DebugState.ANALYZING, retry_count=first.retry_count
    )

    assert first.retry_count == 1
    assert second.retry_count == 2
    assert second.event_name is AgentEventName.RETRY_STARTED
    with pytest.raises(RetryLimitExceededError):
        machine.decide(
            DebugState.FAILED, DebugState.ANALYZING, retry_count=second.retry_count
        )


def test_success_can_only_roll_back() -> None:
    decision = DebugStateMachine().decide(
        DebugState.SUCCESS, DebugState.ROLLED_BACK, retry_count=0
    )

    assert decision.event_name is AgentEventName.ROLLBACK_COMPLETED
