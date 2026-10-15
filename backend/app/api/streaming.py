"""SSE framing and preflight errors for the internal resolve stream only."""
import json

from fastapi import HTTPException, Request
from fastapi.exceptions import RequestValidationError
from fastapi.responses import StreamingResponse
from fastapi.routing import APIRoute

SSE_HEADERS = {"Cache-Control": "no-cache", "X-Accel-Buffering": "no"}


def event(name: str, data: dict) -> str:
    return f"event: {name}\ndata: {json.dumps(data, ensure_ascii=False, separators=(',', ':'))}\n\n"


def error_response(status: int, detail: str, headers: dict | None = None) -> StreamingResponse:
    return StreamingResponse(
        iter([event("error", {"status": status, "detail": detail})]),
        status_code=status,
        media_type="text/event-stream",
        headers={**SSE_HEADERS, **(headers or {})},
    )


class StreamRoute(APIRoute):
    """Keep dependency/validation status codes while providing an SSE error body.

    No raw validation input or exception text is exposed (it can contain PII).
    Ordinary JSON endpoints retain FastAPI's usual error responses.
    """
    def get_route_handler(self):
        handler = super().get_route_handler()

        async def stream_handler(request: Request):
            try:
                return await handler(request)
            except RequestValidationError:
                return error_response(422, "Invalid dispute or view; the stream supports internal view only.")
            except HTTPException as exc:
                detail = exc.detail if isinstance(exc.detail, str) else "Resolve request rejected."
                return error_response(exc.status_code, detail, exc.headers)

        return stream_handler
