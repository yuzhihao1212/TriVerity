"""Demo access codes (auth tier T2) sent in the X-Demo-Key header.

The codes live only in backend/.env (DEMO_ACCESS_CODES), never in the frontend
bundle: a judge types theirs in. Codes are compared in constant time, and only
a short hash of a code is ever used as an identifier, never the code itself.
"""

import hashlib
import secrets

from fastapi import HTTPException

from app.core import limits
from app.core.config import settings

DEMO_KEY_HEADER = "X-Demo-Key"


def _configured_codes() -> list[str]:
    codes = (c.strip() for c in settings.demo_access_codes.split(","))
    return [c for c in codes if len(c) >= limits.MIN_ACCESS_CODE_CHARS]


def verify_demo_code(presented: str | None) -> str | None:
    """Return a short ID for a valid code, None if no code was sent; 401 if wrong."""
    if not presented:
        return None
    match = None
    for code in _configured_codes():  # compare against every code: no early exit
        if secrets.compare_digest(presented.encode(), code.encode()):
            match = code
    if match is None:
        raise HTTPException(status_code=401, detail="Invalid access code.")
    return hashlib.sha256(match.encode()).hexdigest()[:12]
