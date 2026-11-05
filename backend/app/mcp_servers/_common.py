"""What every TriVerity MCP server shares: the read-only annotation, bearer tokens and the runner.

Over HTTP a server binds to loopback unless bearer tokens are set (``MCP_TOKENS`` in
``backend/.env``: comma-separated, at least 32 characters each). With tokens set, every HTTP
request needs ``Authorization: Bearer <token>``, on loopback too. stdio needs no token: the
client starts the server as its own process.
"""

from __future__ import annotations

import argparse
import hmac
import ipaddress
import logging
from collections.abc import Callable

from mcp.server import MCPServer
from mcp.types import ToolAnnotations
from starlette.responses import JSONResponse
from starlette.types import ASGIApp, Receive, Scope, Send

from app.core.config import settings

logger = logging.getLogger(__name__)

READ_ONLY = ToolAnnotations(
    read_only_hint=True, destructive_hint=False, idempotent_hint=True, open_world_hint=False,
)
MIN_TOKEN_CHARS = 32
TOKEN_HELP = 'python -c "import secrets; print(secrets.token_urlsafe(32))"'


def loopback(host: str) -> bool:
    if host == "localhost":
        return True
    try:
        return ipaddress.ip_address(host).is_loopback
    except ValueError:
        return False


def load_tokens(raw: str) -> list[str]:
    """The bearer tokens from MCP_TOKENS. A short token is refused: it could be guessed."""
    tokens = [token.strip() for token in raw.split(",") if token.strip()]
    if any(len(token) < MIN_TOKEN_CHARS for token in tokens):
        raise ValueError(f"every MCP_TOKENS token needs at least {MIN_TOKEN_CHARS} characters; "
                         f"make one with: {TOKEN_HELP}")
    return tokens


class BearerAuth:
    """ASGI middleware: every HTTP request needs one of the tokens. Tokens are never logged."""

    def __init__(self, app: ASGIApp, tokens: list[str]):
        if not tokens:
            raise ValueError("BearerAuth needs at least one token")
        self.app = app
        self._tokens = [token.encode() for token in tokens]

    async def __call__(self, scope: Scope, receive: Receive, send: Send) -> None:
        if scope["type"] == "lifespan" or (scope["type"] == "http" and self._allowed(scope)):
            await self.app(scope, receive, send)
            return
        client = (scope.get("client") or ("unknown",))[0]
        logger.warning("MCP request refused: missing or invalid bearer token (client %s)", client)
        if scope["type"] != "http":   # e.g. a websocket: no MCP transport here uses one
            await send({"type": "websocket.close", "code": 1008})
            return
        response = JSONResponse(
            {"error": "invalid_token", "error_description": "A valid bearer token is required."},
            status_code=401, headers={"WWW-Authenticate": 'Bearer realm="triverity"'},
        )
        await response(scope, receive, send)

    def _allowed(self, scope: Scope) -> bool:
        values = [v for k, v in scope.get("headers", []) if k == b"authorization"]
        if len(values) != 1:
            return False
        scheme, _, presented = values[0].partition(b" ")
        presented = presented.strip()
        if scheme.lower() != b"bearer" or not presented:
            return False
        # Compare against every token, so the time taken doesn't say which one nearly matched.
        matched = False
        for token in self._tokens:
            matched |= hmac.compare_digest(presented, token)
        return matched


def http_app(server: MCPServer, host: str, tokens: list[str]) -> ASGIApp:
    """The server's streamable-HTTP app, behind bearer tokens when any are set."""
    app = server.streamable_http_app(host=host)
    return BearerAuth(app, tokens) if tokens else app


def serve(build: Callable[[], MCPServer], description: str, default_port: int, argv: list[str] | None = None) -> None:
    """Run a server over stdio, or over streamable HTTP (beyond loopback only with bearer tokens)."""
    parser = argparse.ArgumentParser(description=description)
    parser.add_argument("--transport", choices=("stdio", "streamable-http"), default="stdio")
    parser.add_argument("--host", default="127.0.0.1")
    parser.add_argument("--port", type=int, default=default_port)
    opts = parser.parse_args(argv)
    logging.basicConfig(level=logging.INFO, format="%(levelname)s %(name)s: %(message)s")
    if opts.transport == "stdio":
        build().run("stdio")
        return
    try:
        tokens = load_tokens(settings.mcp_tokens)
    except ValueError as exc:
        parser.error(str(exc))
    if not tokens and not loopback(opts.host):
        parser.error("streamable-http binds beyond loopback only with bearer tokens: set MCP_TOKENS "
                     f"in backend/.env (make one with: {TOKEN_HELP})")
    logger.info("streamable-http on %s:%d, %s", opts.host, opts.port,
                f"bearer tokens required ({len(tokens)} configured)" if tokens else "loopback only, no token")
    import uvicorn
    uvicorn.run(http_app(build(), opts.host, tokens), host=opts.host, port=opts.port, log_level="info")
