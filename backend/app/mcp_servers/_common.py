"""What every TriVerity MCP server shares: the read-only annotation and the loopback-only runner."""

from __future__ import annotations

import argparse
import ipaddress
import logging
from collections.abc import Callable

from mcp.server import MCPServer
from mcp.types import ToolAnnotations

READ_ONLY = ToolAnnotations(
    read_only_hint=True, destructive_hint=False, idempotent_hint=True, open_world_hint=False,
)


def loopback(host: str) -> bool:
    if host == "localhost":
        return True
    try:
        return ipaddress.ip_address(host).is_loopback
    except ValueError:
        return False


def serve(build: Callable[[], MCPServer], description: str, default_port: int, argv: list[str] | None = None) -> None:
    """Run a server over stdio, or over streamable HTTP on a loopback address only."""
    parser = argparse.ArgumentParser(description=description)
    parser.add_argument("--transport", choices=("stdio", "streamable-http"), default="stdio")
    parser.add_argument("--host", default="127.0.0.1")
    parser.add_argument("--port", type=int, default=default_port)
    opts = parser.parse_args(argv)
    logging.basicConfig(level=logging.INFO, format="%(levelname)s %(name)s: %(message)s")
    if opts.transport == "streamable-http" and not loopback(opts.host):
        parser.error("streamable-http binds to loopback only until the server has authentication")
    server = build()
    if opts.transport == "stdio":
        server.run("stdio")
    else:
        server.run("streamable-http", host=opts.host, port=opts.port)
