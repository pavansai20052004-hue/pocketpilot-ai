"""Non-interactive command-line entry point for registered demo maintenance."""

from __future__ import annotations

import argparse
import asyncio
import json

import httpx

from pocketpilot_agent.analysis_provider import build_provider
from pocketpilot_agent.config import Settings
from pocketpilot_agent.demo_service import DemoService
from pocketpilot_agent.workspace import WorkspaceService


def main() -> int:
    parser = argparse.ArgumentParser(description="Check or reset PocketPilot demos safely.")
    parser.add_argument("action", choices=("check", "reset"))
    parser.add_argument(
        "--prerequisites-only",
        action="store_true",
        help="Check startup prerequisites without requiring the agent to be running.",
    )
    arguments = parser.parse_args()
    settings = Settings()
    provider = build_provider(
        settings.llm_provider,
        settings.ollama_base_url,
        settings.ollama_model,
        settings.ollama_timeout_seconds,
        settings.ollama_context_tokens,
        settings.ollama_max_output_tokens,
        settings.ollama_keep_alive,
    )
    service = DemoService(settings, WorkspaceService(settings), provider)
    if arguments.action == "reset":
        result = service.reset_all()
        print(json.dumps(result.model_dump(mode="json"), indent=2))
        return 0 if result.overall != "NOT_READY" else 1
    agent_reachable = False
    try:
        health = httpx.get(
            f"http://127.0.0.1:{settings.agent_port}/health", timeout=2.0
        )
        agent_reachable = health.status_code == 200 and health.json().get("status") == "ok"
    except (httpx.HTTPError, ValueError, TypeError):
        pass
    result = asyncio.run(
        service.preflight(
            agent_reachable=None if arguments.prerequisites_only else agent_reachable,
            check_workspace=False,
        )
    )
    print(json.dumps(result.model_dump(mode="json"), indent=2))
    return 0 if result.overall != "NOT_READY" else 1


if __name__ == "__main__":
    raise SystemExit(main())
