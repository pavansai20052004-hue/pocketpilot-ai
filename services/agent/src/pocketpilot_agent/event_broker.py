"""In-process event fan-out for reconnect-safe WebSocket clients."""

import asyncio
from collections import defaultdict
from collections.abc import AsyncIterator
from contextlib import asynccontextmanager

from pocketpilot_agent.models import AgentEvent


class SessionEventBroker:
    """Broadcast persisted events; persistence remains the source of truth."""

    def __init__(self) -> None:
        self._subscribers: dict[str, set[asyncio.Queue[AgentEvent]]] = defaultdict(set)
        self._lock = asyncio.Lock()

    @asynccontextmanager
    async def subscribe(self, session_id: str) -> AsyncIterator[asyncio.Queue[AgentEvent]]:
        queue: asyncio.Queue[AgentEvent] = asyncio.Queue(maxsize=100)
        async with self._lock:
            self._subscribers[session_id].add(queue)
        try:
            yield queue
        finally:
            async with self._lock:
                subscribers = self._subscribers.get(session_id)
                if subscribers is not None:
                    subscribers.discard(queue)
                    if not subscribers:
                        self._subscribers.pop(session_id, None)

    async def publish(self, event: AgentEvent) -> None:
        async with self._lock:
            queues = tuple(self._subscribers.get(event.session_id, ()))
        for queue in queues:
            try:
                queue.put_nowait(event)
            except asyncio.QueueFull:
                # Clients recover any dropped event from SQLite using its sequence number.
                continue
