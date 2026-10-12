"""Every size limit, rate limit and budget in one place.

Change a number here, not at the place that uses it. A real claim is a few
hundred characters, so the input limits are generous; the budget numbers are
sized for the hackathon key (see docs/security.md).
"""

# -- Request size -------------------------------------------------------------
# A legitimate maximum (50 x 500-char messages + two 2,000-char texts) is under 40 KB.
MAX_BODY_BYTES = 64 * 1024

# -- DisputeCase fields (models/dispute.py) -----------------------------------
DISPUTE_ID_PATTERN = r"^[A-Za-z0-9_-]{1,64}$"
PROMO_CODE_PATTERN = r"^[A-Z0-9_-]{1,32}$"
MAX_STATEMENT_CHARS = 2_000        # rider_claim, driver_statement
MAX_CHAT_MESSAGES = 50
MAX_CHAT_MESSAGE_CHARS = 500
MAX_TIMESTAMP_CHARS = 64
MAX_FARE_LINES = 20
MAX_FARE_LABEL_CHARS = 80

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
ADVOCATE_MAX_TOKENS = 600
JUDGE_MAX_TOKENS = 800
DEFAULT_MAX_TOKENS = 800
LLM_TIMEOUT_S = 25

# -- Concurrency (503 with Retry-After when full) -----------------------------
MAX_CONCURRENT_RESOLVES = 3
BUSY_RETRY_AFTER_S = 5
