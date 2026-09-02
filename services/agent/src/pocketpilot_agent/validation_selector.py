"""Deterministically select one already-registered safe validation command."""

from typing import ClassVar

from pocketpilot_agent.models import CommandCategory, SafeCommand


class ValidationCommandSelector:
    priorities: ClassVar[dict[CommandCategory, int]] = {
        CommandCategory.TEST: 0,
        CommandCategory.TYPECHECK: 1,
        CommandCategory.BUILD: 2,
        CommandCategory.LINT: 3,
    }

    def select(self, commands: list[SafeCommand]) -> SafeCommand | None:
        if not commands:
            return None
        return min(
            commands,
            key=lambda item: (
                self.priorities.get(item.category, 99),
                item.working_directory,
                item.id,
            ),
        )
