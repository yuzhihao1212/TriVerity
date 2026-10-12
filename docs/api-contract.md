# API Contract

## POST `/api/disputes/resolve`

### Input: `DisputeCase`

See `backend/app/models/dispute.py` and the samples in `data/disputes/`.

```json
{
  "dispute_id": "D001",
  "type": "route_deviation | no_show_charge",
  "rider_claim": "string",
  "driver_statement": "string | null",
  "trip": {
    "expected_distance_km": 10.2, "actual_distance_km": 14.7,
    "expected_duration_min": 22, "actual_duration_min": 35,
    "pickup_lat": 1.3521, "pickup_lng": 103.8198,
    "driver_arrival_lat": 1.3526, "driver_arrival_lng": 103.8204,
    "driver_wait_min": 6
  },
  "fare": {
    "expected": 18.5, "actual": 24.8, "cancellation_fee": null,
    "surge_multiplier": 1.0, "promo_code": null, "promo_discount": null,
    "breakdown": [{"label": "Base fare", "amount": 3.10}]
  },
  "chat_logs": [{"sender": "rider | driver | system", "message": "string", "timestamp": "ISO 8601 | null"}],
  "gps_points": [],
  "rider_history": {"account_age_days": 820, "rating": 4.8, "completed_trips": 214, "disputes_last_90d": 0},
  "driver_history": {"account_age_days": 1460, "rating": 4.7, "completed_trips": 3890, "disputes_last_90d": 2}
}
```

All evidence fields are optional. `breakdown` lists charges before `promo_discount`.
Chat messages and history accept extra fields, so external datasets can pass through,
but unknown fields are dropped (not kept or returned).

### Limits and errors

All numbers live in `backend/app/core/limits.py`; the values below are the defaults.

| Status | When |
| --- | --- |
| 413 | Request body over 64 KB (checked on `Content-Length` and on the bytes received). |
| 422 | A field breaks a limit: `dispute_id` not `^[A-Za-z0-9_-]{1,64}$`; `rider_claim` or `driver_statement` over 2,000 characters; more than 50 chat messages or a message over 500 characters; more than 20 `breakdown` lines or a `label` over 80 characters; `promo_code` not `^[A-Z0-9_-]{1,32}$`; any number that is `NaN`/`Infinity` or out of range (distances 0-500 km, durations and waits 0-600 min, money 0-1,000, breakdown amounts -1,000 to 1,000, surge 1-10, rating 0-5, latitude ±90, longitude ±180, counts ≥ 0). |
| 422 | More than 500 `gps_points`. |
| 429 | Rate limit: 3 resolves per minute and 30 per day per client IP, 10 per minute across all callers. `Retry-After` gives the seconds to wait. |
| 503 | All 3 resolve slots are busy. `Retry-After: 5`. |

When the daily LLM budget (300,000 tokens or 75 resolves) is spent, `/resolve` still
returns 200 with the full rule-based ruling, but every `source` and `explanation_source`
is `"fallback"`. A refund never exceeds `fare.actual`.

### Public demo mode (`PUBLIC_DEMO=true`)

For a public link. The request shape is unchanged, but the server reads only
`dispute_id`: it resolves its own copy of that sample from `data/disputes/` and
ignores every other field the client sent. An unknown `dispute_id` gets 404. Each
sample's result is cached for 10 minutes. `/docs`, `/redoc` and `/openapi.json` are
switched off. The rate limits above still apply.

### Access codes (`X-Demo-Key` header)

Invited judges get a personal access code (configured in `backend/.env` as
`DEMO_ACCESS_CODES`, comma-separated, each at least 16 characters). Sending it as
`X-Demo-Key: <code>` in public demo mode resolves the caller's own `DisputeCase`
instead of a sample; all input limits still apply. A wrong code gets 401. Code
holders are limited per code (3 per minute, 20 per day) instead of per IP; the
global limit and the daily LLM budget still apply.

### Output: `Resolution`

See `backend/app/models/resolution.py`.

```json
{
  "decision": "partial_refund | full_refund | compensation | no_action | needs_review",
  "recommended_action": "string",
  "refund_amount": 6.3,
  "confidence": 0.8,
  "explanation": "string",
  "rider_explanation": "string",
  "driver_explanation": "string",
  "explanation_source": "llm | fallback",
  "judge_evidence": ["string"],
  "policy_refs": ["RD-3: A route more than 15% longer ..."],
  "rider_case": {"agent": "rider_advocate", "summary": "string", "evidence": [], "policy_refs": [], "source": "llm | fallback"},
  "driver_case": {"agent": "driver_advocate", "summary": "string", "evidence": [], "policy_refs": [], "source": "llm | fallback"},
  "risk": {
    "rider_risk": "low | medium | high",
    "driver_risk": "low | medium | high",
    "signals": ["Rider has 4 disputes in the last 90 days"],
    "summary": "Rider: medium risk (1 signal); Driver: low risk"
  },
  "agent_log": [{"step": 1, "agent": "evidence_loader", "status": "completed", "message": "string"}]
}
```

- `refund_amount` is `null` when no refund applies. On `needs_review` it is the amount
  proposed to the human reviewer.
- `explanation` is the neutral reasoning; `rider_explanation` and `driver_explanation`
  word the same ruling for each party. The decision, amount and `policy_refs` always
  come from the policy rules; the LLM only writes these three texts
  (`explanation_source: "llm"`), and any text that contradicts the ruling is replaced
  by the rule templates (`"fallback"`).
- `policy_refs` cite rule IDs from `data/policies/ryde_mock_policy.json`.
- An advocate's `source` is `llm` when the model wrote its case, `fallback` when the
  deterministic backup was used (no key, API error or unusable reply).
- `risk` is the Fraud & Bad-Faith Detection agent's assessment. `rider_risk` and
  `driver_risk` are `"low"`, `"medium"` or `"high"`; `signals` lists human-readable
  bad-faith indicators (e.g. 3+ disputes in 90 days, low rating, claims contradicted
  by trip data). The fraud agent never changes a refund or penalises anyone; a
  `high` risk for either party triggers `FRAUD-1` escalation to human review.
- `compensation` is reserved for payouts beyond a refund; no rule produces it yet.

Keep this contract stable so frontend and backend development can proceed independently.
