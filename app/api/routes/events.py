from fastapi import APIRouter
from sse_starlette.sse import EventSourceResponse
import asyncio
import json
import structlog

router = APIRouter()
logger = structlog.get_logger()

# Simple in-memory event queue (use Redis in production)
event_queues: dict[str, asyncio.Queue] = {}


def get_event_queue(client_id: str) -> asyncio.Queue:
    if client_id not in event_queues:
        event_queues[client_id] = asyncio.Queue()
    return event_queues[client_id]


async def publish_event(event_type: str, data: dict, client_id: str = None):
    """Publish an event to connected clients."""
    event = {"type": event_type, "data": data}
    if client_id:
        # Send to specific client
        if client_id in event_queues:
            await event_queues[client_id].put(event)
    else:
        # Broadcast to all clients
        for queue in event_queues.values():
            await queue.put(event)


@router.get("/")
async def stream_events(client_id: str = "default"):
    """SSE endpoint for real-time updates."""

    async def event_generator():
        queue = get_event_queue(client_id)
        logger.info("Client connected to SSE", client_id=client_id)

        try:
            while True:
                try:
                    event = await asyncio.wait_for(queue.get(), timeout=30.0)
                    yield {
                        "event": event["type"],
                        "data": json.dumps(event["data"]),
                    }
                except asyncio.TimeoutError:
                    # Send keepalive
                    yield {"event": "keepalive", "data": "{}"}
        except asyncio.CancelledError:
            logger.info("Client disconnected from SSE", client_id=client_id)
            if client_id in event_queues:
                del event_queues[client_id]
            raise

    return EventSourceResponse(event_generator())
