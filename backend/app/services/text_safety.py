"""Text hygiene shared by the agents: cleaning input and checking LLM output.

``sanitise`` cleans untrusted text before it enters a prompt or the UI (H8).
``normalise`` folds look-alike characters so output checks can't be dodged with
odd hyphens, invisible characters or Cyrillic letters (H3). The ``find_*``
helpers detect content no party message should contain (H2).
"""

import re
import unicodedata

# Zero-width, soft hyphen and bidirectional control characters.
_INVISIBLE_RE = re.compile("[­​-‏‪-‮⁠-⁤⁦-⁩﻿]")
# C0/C1 control characters except tab, newline and carriage return (handled as whitespace).
_CONTROL_RE = re.compile("[\x00-\x08\x0b\x0c\x0e-\x1f\x7f-\x9f]")
_DASHES = dict.fromkeys(map(ord, "‐‑‒–—―−﹘﹣－"), "-")
_QUOTES = {ord("‘"): "'", ord("’"): "'", ord("“"): '"', ord("”"): '"'}
# Cyrillic and Greek letters that look like Latin ones (enough to spell rule IDs and keywords).
_CONFUSABLES = str.maketrans(
    "АВЕКМНОРСТХЅІЈ"
    "аеорсхуѕіј"
    "ΑΒΕΖΗΙΚΜΝΟΡΤΥΧο",
    "ABEKMHOPCTXSIJ"
    "aeopcxysij"
    "ABEZHIKMNOPTYXo",
)

_LINK_RE = re.compile(
    r"https?://|www\.|[\w.+-]+@[\w-]+\.[\w.-]+"
    r"|\b[\w-]+(?:\.[\w-]+)*\.(?:com|net|org|io|sg|co|me|ly|app|dev|info|biz|xyz|link|site|online|example)\b",
    re.IGNORECASE,
)
_MARKUP_RE = re.compile(r"<|\]\(|`|!\[")
_PHONE_RE = re.compile(r"(?<![\w$.,])\+?\d(?:[\s-]?\d){6,}")
_WORD_RE = re.compile(r"[a-z0-9'-]+")
_ECHO_WORDS = 8


def sanitise(text: str) -> str:
    """Remove control and invisible characters and collapse whitespace."""
    text = _CONTROL_RE.sub("", _INVISIBLE_RE.sub("", text))
    return " ".join(text.split())


def normalise(text: str) -> str:
    """Fold text for checking: NFKC, no invisible characters, plain dashes, quotes and letters."""
    text = unicodedata.normalize("NFKC", text)
    text = _INVISIBLE_RE.sub("", text)
    return text.translate(_DASHES).translate(_QUOTES).translate(_CONFUSABLES)


def find_link_or_markup(text: str) -> str | None:
    """Return what kind of unsafe content ``text`` (already normalised) contains, if any."""
    if _LINK_RE.search(text):
        return "link"
    if _MARKUP_RE.search(text):
        return "markup"
    if _PHONE_RE.search(text):
        return "phone number"
    return None


def is_latin_script(text: str) -> bool:
    """True if every letter in ``text`` (already normalised) is a Latin letter."""
    return all(unicodedata.name(c, "").startswith("LATIN") for c in text if c.isalpha())


def _shingles(text: str) -> set[tuple[str, ...]]:
    words = _WORD_RE.findall(normalise(text).lower())
    return {tuple(words[i:i + _ECHO_WORDS]) for i in range(len(words) - _ECHO_WORDS + 1)}


def echoes(text: str, prompt: str) -> bool:
    """True if ``text`` repeats any run of 8 words from ``prompt`` (system prompt leak)."""
    return bool(_shingles(text) & _shingles(prompt))
