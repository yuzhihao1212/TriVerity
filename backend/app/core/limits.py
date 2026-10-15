"""Every size limit, rate limit and budget in one place.

Change a number here, not at the place that uses it. A real claim is a few
hundred characters, so the input limits are generous; the budget numbers are
sized for the hackathon key (see docs/security.md). The budget and rate limits
can also be overridden from backend/.env, within bounds (see the end of this file).
"""

import logging

from app.core.config import settings

logger = logging.getLogger(__name__)

# -- Request size -------------------------------------------------------------
# The text fields stay under 40 KB (50 x 500-char messages + two 2,000-char texts);
# the rest is room for MAX_GPS_POINTS of trip log (~75 bytes each with a timestamp,
# ~375 KB). GPS points never reach the LLM, so this adds no token cost.
MAX_BODY_BYTES = 512 * 1024

# -- DisputeCase fields (models/dispute.py) -----------------------------------
DISPUTE_ID_PATTERN = r"^[A-Za-z0-9_-]{1,64}$"
PROMO_CODE_PATTERN = r"^[A-Za-z0-9_-]{1,32}$"   # stored upper-cased
MAX_STATEMENT_CHARS = 2_000        # rider_claim, driver_statement
MAX_CHAT_MESSAGES = 50
MAX_CHAT_MESSAGE_CHARS = 500
MAX_TIMESTAMP_CHARS = 64
MAX_FARE_LINES = 20
MAX_FARE_LABEL_CHARS = 80
# A 35-minute trip logged once a second is ~2,100 points; nothing reads gps_points yet.
MAX_GPS_POINTS = 5_000

# -- Numeric ranges -----------------------------------------------------------
MAX_DISTANCE_KM = 500
MAX_DURATION_MIN = 600
MAX_FARE = 1_000                   # any single money amount, in dollars
MIN_SURGE = 1
MAX_SURGE = 10
MAX_RATING = 5
MAX_ACCOUNT_AGE_DAYS = 36_500
MAX_COMPLETED_TRIPS = 1_000_000
MAX_DISPUTES_90D = 10_000

# -- Rate limits on POST /api/disputes/resolve (429 with Retry-After) ---------
PER_IP_PER_MINUTE = 3
PER_IP_PER_DAY = 30
# One resolve is 3 LLM calls and the model allows 60 requests per minute per
# account, so keep everyone together well under 20 resolves per minute.
GLOBAL_PER_MINUTE = 10

# -- Daily LLM budget (degrades to the deterministic fallbacks, never fails) --
# One resolve is about 4,000 tokens, so 300,000 tokens is about 75 resolves.
DAILY_TOKEN_BUDGET = 300_000
DAILY_RESOLVE_BUDGET = 75

# -- Per LLM call -------------------------------------------------------------
# Sized for LLM_DISABLE_THINKING=true. With thinking on, reasoning tokens count
# against max_tokens, replies get cut off mid-JSON and every agent falls back.
ADVOCATE_MAX_TOKENS = 600
JUDGE_MAX_TOKENS = 800
DEFAULT_MAX_TOKENS = 800
REBUTTAL_MAX_TOKENS = 300      # one short reply per advocate in the rebuttal round
LLM_TIMEOUT_S = 25

# -- LLM output checks (judge_narration, _advocate) ---------------------------
# Longer output is rejected (not truncated) and the deterministic text is kept.
NARRATION_MAX_PARTY_CHARS = 600     # rider_explanation, driver_explanation
NARRATION_MAX_RECORD_CHARS = 1_200  # explanation (case record)
ADVOCATE_MAX_SUMMARY_CHARS = 1_200  # live Hy3 summaries ran 391-973 chars; 800 rejected 21 of 102
ADVOCATE_MAX_EVIDENCE_ITEMS = 8
ADVOCATE_MAX_EVIDENCE_CHARS = 300
REBUTTAL_MAX_CHARS = 600           # a rebuttal is 1-3 sentences

# -- Policy & Precedent agent ------------------------------------------------
PRECEDENT_TOP_K = 3                 # similar past rulings returned per dispute
PRECEDENT_SHOW_MIN_SIMILARITY = 0.4 # weaker matches are not shown at all
PRECEDENT_MAX_FEEDBACK = 200        # reviewer decisions kept in memory (feedback loop)
PRECEDENT_NOTE_MAX_CHARS = 300      # reviewer note on a feedback entry

# -- Concurrency (503 with Retry-After when full) -----------------------------
MAX_CONCURRENT_RESOLVES = 3
BUSY_RETRY_AFTER_S = 5

# -- Public demo mode (PUBLIC_DEMO=true) --------------------------------------
# Each sample's result is reused for this long, so LLM cost is bounded by
# (number of samples) per window. Long enough that one pre-warm
# (scripts/prewarm_demo.py) covers a whole judging session.
PUBLIC_DEMO_CACHE_S = 6 * 3600

# -- Demo access codes (X-Demo-Key) -------------------------------------------
# Code holders are limited per code instead of per IP, since judges may share
# one venue IP. The global limit and the daily budget still apply.
PER_CODE_PER_MINUTE = 3
PER_CODE_PER_DAY = 20
MIN_ACCESS_CODE_CHARS = 16

# -- Overrides from backend/.env ----------------------------------------------
# These can be set in backend/.env (e.g. DAILY_TOKEN_BUDGET=2000000 for a local
# evaluation run) without a code change. Each must stay within (min, max), or the
# backend refuses to start; every override is logged at start-up.
MAX_GLOBAL_PER_MINUTE = 10   # the model allows 60 requests/min and a resolve is 3 calls

_OVERRIDABLE = {
    "DAILY_TOKEN_BUDGET": (0, None),
    "DAILY_RESOLVE_BUDGET": (0, None),
    "PER_IP_PER_MINUTE": (1, None),
    "PER_IP_PER_DAY": (1, None),
    "GLOBAL_PER_MINUTE": (1, MAX_GLOBAL_PER_MINUTE),
    "PER_CODE_PER_MINUTE": (1, None),
    "PER_CODE_PER_DAY": (1, None),
}

def _apply_overrides() -> None:
    for name, (low, high) in _OVERRIDABLE.items():
        value = getattr(settings, name.lower())
        if value is None:
            continue
        if value < low or (high is not None and value > high):
            bound = f"at least {low}" if high is None else f"from {low} to {high}"
            raise ValueError(f"{name}={value} in backend/.env is out of range; it must be {bound}.")
        logger.warning("Limit override from backend/.env: %s=%s (default %s)", name, value, globals()[name])
        globals()[name] = value

_apply_overrides()

# -- GPS analysis -------------------------------------------------------------
# Geographic validity bounds, including endpoints and the antimeridian.
GPS_MAX_LATITUDE = 90
GPS_MAX_LONGITUDE = 180
# Allow idling/creep and GPS jitter, but require a sustained stop rather than a light.
GPS_STOP_SPEED_KMH = 3
GPS_STOP_RADIUS_M = 25
# How far a stopped vehicle's GPS position may drift and still count as the same stop.
# Crawling further than this (e.g. 2 km/h for 3 min = 100 m) is traffic, not a stop.
GPS_STOP_DRIFT_M = 50
GPS_STOP_MIN_DURATION_MIN = 3
# Match NS-1's 100 m pickup tolerance; use the same tolerance at drop-off.
GPS_ENDPOINT_RADIUS_M = 100
# Do not infer stationary time across sparse telemetry; report these gaps instead.
GPS_STOP_MAX_GAP_MIN = 3
GPS_REPORT_GAP_MIN = 3

# -- Fare validation (facts only; no policy decisions) --------------------------
FARE_PROMO_TOLERANCE = 0.01        # a cent of rounding in the final charge
FARE_SURGE_ABS_TOLERANCE = 0.02    # cent rounding across itemised components
FARE_SURGE_REL_TOLERANCE = 0.05    # coarse/rounded surge lines in synthetic data
