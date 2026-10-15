"""Log-safe descriptions of errors (finding F9).

Exception messages can carry personal data: pydantic's ValidationError repeats
the model's reply (``input_value=...``), and httpx errors repeat the request URL.
Log sites use ``safe_reason`` instead of ``str(exc)``: the exception class, plus
the HTTP status for an HTTP error, and nothing else. Never log request bodies,
prompts or model replies at INFO or above.
"""

import httpx


def safe_reason(exc: BaseException) -> str:
    name = type(exc).__name__
    if isinstance(exc, httpx.HTTPStatusError):
        return f"{name} (HTTP {exc.response.status_code})"
    return name
