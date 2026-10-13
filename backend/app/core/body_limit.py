"""Whole-request body cap as a pure ASGI middleware.

Field limits run only after the body is in memory, so the raw request is
capped first: 413 at once when ``Content-Length`` is over the cap, and the bytes
are also counted as they stream in, because ``Content-Length`` can be missing
(chunked) or false. At a proxy the same cap is nginx ``client_max_body_size``.
"""

import json

from starlette.types import ASGIApp, Message, Receive, Scope, Send

_BODY = json.dumps({"detail": "Request body too large."}).encode()


class BodySizeLimitMiddleware:
    def __init__(self, app: ASGIApp, max_bytes: int):
        self.app = app
        self.max_bytes = max_bytes

    async def _reject(self, send: Send) -> None:
        await send({
            "type": "http.response.start",
            "status": 413,
            "headers": [(b"content-type", b"application/json"),
                        (b"content-length", str(len(_BODY)).encode()),
                        (b"connection", b"close")],
        })
        await send({"type": "http.response.body", "body": _BODY})

    async def __call__(self, scope: Scope, receive: Receive, send: Send) -> None:
        if scope["type"] != "http":
            await self.app(scope, receive, send)
            return

        for name, value in scope.get("headers", []):
            if name.lower() == b"content-length":
                try:
                    declared = int(value)
                except ValueError:
                    declared = None  # let the byte count below decide
                if declared is not None and declared > self.max_bytes:
                    await self._reject(send)
                    return

        received = 0
        rejected = False
        started = False

        async def limited_receive() -> Message:
            nonlocal received, rejected
            if rejected:
                return {"type": "http.disconnect"}
            message = await receive()
            if message["type"] == "http.request":
                received += len(message.get("body", b""))
                if received > self.max_bytes:
                    rejected = True
                    if not started:
                        await self._reject(send)
                    # Tell the app the client went away so it stops reading.
                    return {"type": "http.disconnect"}
            return message

        async def guarded_send(message: Message) -> None:
            nonlocal started
            if rejected:
                return  # the 413 has been sent; drop the app's own response
            if message["type"] == "http.response.start":
                started = True
            await send(message)

        try:
            await self.app(scope, limited_receive, guarded_send)
        except Exception:
            if not rejected:
                raise
