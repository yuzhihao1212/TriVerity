# API Contract

## POST `/api/disputes/resolve`

### Input: `DisputeCase`

See `backend/app/models/dispute.py` and the samples in `data/disputes/`. `raised_at` (`YYYY-MM-DD`, optional) sets the queue order and is never evidence for the agents. `GET /api/disputes/samples` also returns `safety_flag` on each case: true when its chat holds a message the SAFE-1 keyword check matches, so the queue can tag it before any run.

```json
{
  "dispute_id": "D001",
  "label": "6-min stop, long detour",
  "type": "route_deviation | no_show_charge",
  "rider_claim": "string",
  "driver_statement": "string | null",
  "trip": {
    "expected_distance_km": 10.2, "actual_distance_km": 14.7,
    "expected_duration_min": 22, "actual_duration_min": 35,
    "pickup_lat": 1.3521, "pickup_lng": 103.8198,
    "driver_arrival_lat": 1.3526, "driver_arrival_lng": 103.8204,
    "driver_wait_min": 6,
    "planned_route": [{"lat": 1.3006, "lng": 103.8352}, {"lat": 1.3247, "lng": 103.8426}]
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

`label` is optional display-only metadata (`string | null`, at most 60 characters).
Control/invisible characters are removed and whitespace is collapsed; an empty label becomes
`null`. Links, email addresses and markup are rejected. Labels are returned in the sample list
for the sidebar, but never enter facts, rulings or any LLM prompt (collector, advocates,
rebuttals or Judge). The sidebar shows the rider's claim on one truncated line when no label
is supplied, including disputes created with the form.

`trip.planned_route` (optional, up to 200 `{lat, lng}` points) is the platform's planned route; the
evidence loader compares the GPS path with it point by point. Coordinates never reach the LLM, only the
computed summary (time span, distance driven off the route, furthest offset).

### Views: `?view=internal | rider | driver`

The default, `internal`, returns the full `Resolution` below, for the reviewer console.
It contains internal data: the fraud `risk`, the review `triage`, both parties' history in `judge_evidence`,
the advocates' cases and the agent log. A client facing the rider or the driver must ask
for its own view instead:

```json
{"dispute_id": "D001", "decision": "partial_refund", "refund_amount": 6.3,
 "message": "Your dispute was upheld and you will be refunded $6.30. ...", "explanation_source": "llm | fallback"}
```

`message` is that party's explanation. `refund_amount` is set only when a refund is
actually given (`null` on `needs_review`, where it is only a proposal for the reviewer).
The view parameter shapes the response but is not access control: in production the
internal view must require a reviewer login.

### Limits and errors

All numbers live in `backend/app/core/limits.py`; the values below are the defaults.
The daily budget and the rate limits can be overridden in `backend/.env`
(`DAILY_TOKEN_BUDGET`, `DAILY_RESOLVE_BUDGET`, `PER_IP_PER_MINUTE`, `PER_IP_PER_DAY`,
`GLOBAL_PER_MINUTE` (at most 10), `PER_CODE_PER_MINUTE`, `PER_CODE_PER_DAY`). Overrides are
logged at start-up, and an out-of-range value stops the backend from starting.
`promo_code` may be in any case and is stored upper-cased.

| Status | When |
| --- | --- |
| 413 | Request body over 512 KB (checked on `Content-Length` and on the bytes received). |
| 422 | A field breaks a limit: `dispute_id` not `^[A-Za-z0-9_-]{1,64}$`; `rider_claim` or `driver_statement` over 2,000 characters; more than 50 chat messages or a message over 500 characters; more than 20 `breakdown` lines or a `label` over 80 characters; `promo_code` not `^[A-Za-z0-9_-]{1,32}$`; any number that is `NaN`/`Infinity` or out of range (distances 0-500 km, durations and waits 0-600 min, money 0-1,000, breakdown amounts -1,000 to 1,000, surge 1-10, rating 0-5, latitude ±90, longitude ±180, counts ≥ 0). |
| 422 | A case `label` over 60 characters, or containing links/email/markup. This is separate from a fare breakdown line's 80-character `label`. |
| 422 | More than 5,000 `gps_points` (a 35-minute trip logged once a second is about 2,100). |
| 429 | Rate limit: 3 resolves per minute and 30 per day per client IP, 10 per minute across all callers. `Retry-After` gives the seconds to wait. |
| 503 | All 3 resolve slots are busy. `Retry-After: 5`. |

When the daily LLM budget (300,000 tokens or 75 resolves) is spent, `/resolve` still
returns 200 with the full rule-based ruling, but every `source` and `explanation_source`
is `"fallback"`. A refund never exceeds `fare.actual` (policy rule REF-1, cited in `policy_refs` when it applies).

### Offline runs (`?ai=off`)

`ai=on` (default) or `ai=off`; anything else gets 422. With `ai=off` the run makes no LLM
call at all: the ruling is identical (rules decide), and every `source` and
`explanation_source` is `"fallback"`, so arguments and explanations use template text.
Offline runs cost nothing, so they don't count against the daily LLM budget and, in public demo
mode, bypass the result cache (they never read or fill it). Rate limits and resolve slots
still apply. The console's **AI Live / AI Off** switch sets this. `/resolve/stream` accepts it too.

### Public demo mode (`PUBLIC_DEMO=true`)

For a public link. The request shape is unchanged, but the server reads only
`dispute_id`: it resolves its own copy of that sample from `data/disputes/` and
ignores every other field the client sent. An unknown `dispute_id` gets 404. Each
sample's result is cached for **7 days** only when the evidence collector, both advocates,
both non-empty rebuttals and the Judge explanation all have source `"llm"`. If any step
uses fallback, or a rebuttal is skipped, the result is cached for **5 minutes** instead.
The cache is per sample and in memory; a restart or service sleep empties it.
`/docs`, `/redoc` and `/openapi.json` are switched off. The rate limits above still apply.

### Access codes (`X-Demo-Key` header)

Invited judges get a personal access code (configured in `backend/.env` as
`DEMO_ACCESS_CODES`, comma-separated, each at least 16 characters). Sending it as
`X-Demo-Key: <code>` in public demo mode resolves the caller's own `DisputeCase`
instead of a sample; all input limits still apply. A wrong code gets 401. Code
holders are limited per code (3 per minute, 20 per day) instead of per IP; the
global limit and the daily LLM budget still apply. Access-code resolves are never cached,
even when the submitted ID is also a bundled sample.

### Output: `Resolution`

See `backend/app/models/resolution.py`.

```json
{
  "decision": "partial_refund | full_refund | compensation | no_action | needs_review",
  "recommended_action": "string",
  "refund_amount": 6.3,
  "confidence": 0.8,
  "min_confidence": 0.6,
  "conditions": [{"rule": "RD-3", "label": "Route more than 15% longer with no recorded time saving",
                  "met": true, "value": "+44% vs planned distance; +59% vs planned duration", "fact_ids": ["TRIP-1", "TRIP-2"]}],
  "explanation": "string",
  "rider_explanation": "string",
  "driver_explanation": "string",
  "explanation_source": "llm | fallback",
  "judge_evidence": ["string"],
  "judge_evidence_ids": ["TRIP-1", "GPS-1"],
  "policy_refs": ["RD-3: A route more than 15% longer ..."],
  "rider_case": {"agent": "rider_advocate", "summary": "string", "evidence": [], "evidence_ids": ["TRIP-1", "GPS-2"],
                "sources": ["trip", "gps"], "policy_refs": [], "source": "llm | fallback",
                "rebuttal": {"text": "string", "evidence": [], "evidence_ids": [], "source": "llm | fallback"}},
  "driver_case": {"agent": "driver_advocate", "summary": "string", "evidence": [], "evidence_ids": ["TRIP-1", "GPS-2"],
                "sources": ["trip", "gps"], "policy_refs": [], "source": "llm | fallback",
                "rebuttal": {"text": "string", "evidence": [], "evidence_ids": [], "source": "llm | fallback"}},
  "risk": {
    "rider_risk": "low | medium | high",
    "driver_risk": "low | medium | high",
    "signals": ["Rider has 4 disputes in the last 90 days"],
    "summary": "Rider: medium risk (1 signal); Driver: low risk"
  },
  "triage": {"tier": "safety | high | standard | low | null", "score": 0, "reasons": ["Threatening message in chat (SAFE-1)"]},
  "precedents": {
    "matches": [{"id": "P-063", "similarity": 0.89, "decision": "partial_refund", "policy_refs": ["RD-3"],
                 "decided_by": "policy | human_review", "summary": "string"}],
    "recommended_decision": "partial_refund",
    "consistency": "consistent | mixed | overridden | no_precedent",
    "summary": "Consistent with 3 similar past rulings (P-063, P-056, P-070)."
  },
  "evidence_collection": {"source": "llm | fallback", "rounds": 2,
    "calls": [{"round": 1, "tool": "gps_window", "args": {"start": "08:10", "end": "08:18"},
               "reason": "string", "source": "gps", "results": ["GPS 08:10-08:18: 9 points, ..."],
               "party": "rider | driver"}]},
  "counterfactuals": [{"change": "the route had been at most 15% longer than expected (it was 44% longer)",
                      "outcome": "no change to the charge", "decision": "no_action", "rules": ["RD-1"]}],
  "agent_log": [{"step": 1, "agent": "evidence_loader", "status": "completed", "message": "string",
                 "started_at": "2026-10-16T08:00:00.123Z", "duration_ms": 4}]
}
```

- `refund_amount` is `null` when no refund applies. On `needs_review` it is the amount
  proposed to the human reviewer.
- `explanation` is the neutral reasoning; `rider_explanation` and `driver_explanation`
  word the same ruling for each party. The decision, amount and `policy_refs` always
  come from the policy rules; the LLM only writes these three texts
  (`explanation_source: "llm"`), and any text that contradicts the ruling is replaced
  by the rule templates (`"fallback"`).
- `rider_message` / `driver_message` (optional) are the same party messages in parts for the phone's
  More info screen: `{"greeting", "found", "next"}`. The greeting and `next` (what happens now) are fixed
  templates; `found` (what we found) is the LLM's wording when it passed the checks, else the template.
  `rider_explanation` is the three joined. Party messages never contain rule or evidence IDs, and promise
  nothing the team hasn't confirmed (refund timing, ratings, earnings changes, appeal deadlines). The party
  view (`?view=rider|driver`) carries the matching `message_parts`.
- `conditions` is the ordered checklist recorded by the deterministic ruling engine, including unmet
  checks and the safety, fraud, precedent and confidence overlays. Each check supplies a rule ID,
  fixed template label, boolean `met`, case-specific `value` and existing evidence `fact_ids`.
  Empty IDs mean there is no standalone evidence fact for that check (for example, a precedent
  result). Early-return branches do not report later checks; an already escalated ruling explicitly
  says the confidence comparison was skipped. These fields are reviewer-only, never party messages
  or narration inputs. Missing data is stated explicitly, never treated as a zero value.
- `min_confidence` is the policy's `escalation.thresholds.min_confidence`, a 0–1 fraction, for the
  auto-decide threshold. Both `conditions` and `min_confidence` are optional and nullable so older
  saved results still load. An absent checklist must not be inferred from advocate verdicts.
- `policy_refs` cite rule IDs from `data/policies/ryde_mock_policy.json`.
- An advocate's `source` is `llm` when the model wrote its case, `fallback` when the
  deterministic backup was used (no key, API error or unusable reply).
- `risk` is the Fraud & Bad-Faith Detection agent's assessment. `rider_risk` and
  `driver_risk` are `"low"`, `"medium"` or `"high"`; `signals` lists human-readable
  bad-faith indicators (e.g. 3+ disputes in 90 days, low rating, claims contradicted
  by trip data). The fraud agent never changes a refund or penalises anyone; a
  `high` risk for either party triggers `FRAUD-1` escalation to human review.
- `autonomy` says whether a routine ruling may skip the human reviewer (internal only, never in the rider or
  driver view): `{"eligible": bool, "audit": bool, "reasons": [...]}`. Eligible only when the ruling is not
  escalated, confidence is at least 80%, any refund is at most $10 and at most the fare, and it cites none of
  SAFE-1, FRAUD-1, PREC-1, ESC-1, RD-4 or NS-4. A stable ~10% sample of eligible cases (hashed from the dispute
  ID, so it is repeatable) has `audit: true` and still goes to a person. `reasons` explains either outcome
  with the case's own numbers. Limits are in the policy's `auto_resolve` section; `enabled: false` turns it off.
  Automatic decisions never become precedents: only human decisions do. The console closes an eligible,
  non-audit case by itself: the parties get the ruling's own messages plus a notice that it was decided
  automatically and how to appeal, and the case shows as Auto-resolved until a reviewer reopens it. A
  refund with no amount (no fare on record) never closes this way, and a case a reviewer reopened or put on
  hold stays with the reviewer in later runs.
- `triage` orders escalated disputes for human reviewers (internal only, never in the rider or driver
  view). `tier` is `null` when no review is needed; otherwise `safety` (SAFE-1, always first), `high`
  (FRAUD-1), `standard` (missing evidence or low confidence) or `low` (the same, with a proposed refund
  under $5). `score` (0-100) orders cases within a tier from the escalation rules, the amount at stake and
  how far confidence falls below 60%; weights are in the policy's `triage` section.
- An advocate's `evidence_ids` are the IDs of the computed facts it cited (prefixes `TRIP`, `GPS`, `FARE`,
  `CHAT`, `HIST`), `evidence` their exact text, and `sources` the evidence sources used. `rebuttal` is its
  reply to the other side; an empty `text` with `source: "fallback"` means no rebuttal was made.
  If the model leaves `evidence_ids` out or empty, IDs written in its text count as its citations;
  with none, the case cites no evidence (it never lists every fact as if cited).
- `judge_evidence_ids` gives each `judge_evidence` line its fact ID, in the same order, so every fact can
  show its ID, not only the ones an advocate cited. It is empty if the two can't be paired (and absent
  from results saved before it existed).
- `precedents` is the Policy & Precedent agent's report: the closest past rulings (`P-…` from the seed set,
  `R-…` from reviewer feedback), the majority decision among close ones, and whether the rules' decision
  agrees with them. `overridden` means reviewers decided close cases differently and `PREC-1` escalated
  the dispute. Internal only: never in the rider or driver view.
- `evidence_collection` is the Evidence Collection agent's record: each tool call with its round, arguments,
  reason and result lines. `source: "fallback"` means the default plan ran. The result lines also join the
  evidence the advocates cite by ID.
- `argument_review` is how the Judge weighed each side: for every rule an advocate cited, whether its
  condition on these facts `supports` that advocate, `favours_other_side` or `does_not_apply`, and whether it
  `decisive`ly decided the case; plus how many verified facts the advocate cited. Computed in code; internal only.
- `counterfactuals` says what would have changed the ruling: "if `change`, the outcome would be `outcome`".
  Computed from the policy thresholds in code, never by the LLM; each one is checked in the tests by changing
  the fact and re-running the rules. `decision` is `null` when the change would let the rules decide
  automatically instead of escalating (e.g. missing data recorded). Internal only.
- `agent_log` steps: `evidence_loader`, `evidence_collector`, `rider_advocate`, `driver_advocate`,
  `fraud_detector`, `rider_rebuttal`, `driver_rebuttal`, `precedent_agent`, `judge`.
- `compensation` (rule RD-5): an unjustified detour (RD-3) that also included an unexpected stop of 10 minutes or
  more. `refund_amount` is the total: the fare charged above the expected fare plus a $5.00 credit for the lost time.

## POST `/api/disputes/resolve/batch`

The queue's **AI Review** button (new cases, or a re-run of open ones): resolves several sample disputes in one request. Body:
`{"dispute_ids": ["D001", "D003"]}` (1 to 10 IDs; duplicates resolve once). Accepts `?ai=off`.

- **Samples only.** Every ID must be one of the server's samples, or the whole request gets 404. Each is
  resolved exactly like a single sample request: the server's own copy, the same cache and the same daily
  budget, so a batch can't spend more than the budget allows.
- **Rate limits:** the per-minute limits count the batch once (the per-minute limit is 3), so a reviewer can run
  the queue at once; the daily limits count every case, so a batch can't do more in a day than the same cases
  run one by one. A batch that doesn't fit is refused whole (429 with `Retry-After`) and counts nothing. Calls to the LLM are paced to stay under the provider's limit of 60 a minute, so nine live cases take about 80 s. At most two cases resolve at the same time, leaving a slot for single runs.
- **Response:** a list in request order, each `{"dispute_id", "result": Resolution | null, "status": int | null,
  "error": str | null}`. A case that fails (e.g. 503 busy, budget used up) carries its status and message;
  the others still return. Internal view only.

## POST `/api/disputes/resolve/stream`

Internal reviewer transport for the same `DisputeCase` body, `X-Demo-Key`, rate limits,
public-sample lookup, result cache, budget and resolve slots as `/resolve`. Only
`view=internal` (the default) is supported; rider/driver views get 422 and never start a run.
The existing JSON endpoint and party views are unchanged.

The response is `text/event-stream`, with `Cache-Control: no-cache` and
`X-Accel-Buffering: no`. Each event has an `event:` line, one JSON `data:` line and
an empty line. Connection/keepalive comments can be ignored:

```text
event: step
data: {"step":1,"agent":"evidence_loader","status":"completed","message":"Computed facts from case data.","started_at":"2026-10-16T00:00:00Z","duration_ms":1}

event: result
data: <full Resolution JSON>

```

Completed steps arrive in the orchestrator hook's order, followed by exactly one
`result` on success. Step fields match the final `agent_log`, including optional
`started_at` and `duration_ms`. This is delivery of finished steps, not a prediction
of which parallel step is running. A cached public sample replays its saved log and
result immediately, without a new resolve; a fresh successful run fills the same cache.

On failure the terminal event is `error`, with `{"status":503,"detail":"Busy; try again shortly."}`
(or another status), and no result. Validation/access/rate-limit failures before streaming
retain their HTTP status (422/401/429) and have an SSE error body; `Retry-After` is preserved.
After headers are sent, HTTP remains 200 and the event carries the error status.
Body-size middleware can still return its ordinary 413 response. Validation error text
is generic and never echoes submitted values; unexpected worker errors use a generic 500.

The worker continues if a client disconnects, releasing its normal slot and caching any
successful public sample. Clients must read with POST `fetch()` rather than `EventSource`.
The console retries the ordinary POST **once** if streaming fails or ends without a result,
then uses the existing error UI if that fails too. Both attempts follow normal quota rules;
for a custom dispute, a lost stream can mean a second run while the first finishes. There is
no request deduplication beyond the existing completed public-sample cache.

## POST `/api/precedents/feedback`

The learning feedback loop: a human reviewer's final decision on a case becomes a precedent.

```json
{"case": {"...": "a DisputeCase"}, "decision": "partial_refund | full_refund | compensation | no_action",
 "note": "plain text, up to 300 characters"}
```

Returns `201` with `{"id": "R-001", "summary": "string", "decision": "no_action"}`. Has its own
write rate limits. **Public demo:** needs a judge access code (`X-Demo-Key`; `403` without one, `401` if
wrong) and the precedent joins only that code's sandbox: it is used for that judge's own disputes, never
for the public samples or other judges, and each code can add up to 30 (`409` after that). `422` for `needs_review` (not a final decision), a note
with links or markup, or a note over 300 characters; `409` when the in-memory store is full (200
entries). Notes stay in the store: they are never returned by the API (not in `precedents.matches`) and
never sent to the LLM.

## Appeals: `/api/appeals`

The product loop: a party contests a ruling → a human reviewer decides → the decision becomes a precedent.
In the public demo all three need a judge access code (`X-Demo-Key`; `403` without one, `401` if wrong),
and each code has its own sandbox: it lists and decides only its own appeals (another code's appeal is
`404`), its decisions become precedents only for its own disputes, and it can file up to 30 appeals
(`409` after that). A real deployment puts them behind the party and reviewer logins. The reason is party text: cleaned, plain text only, never sent to the LLM.

- `POST /api/appeals`: `{"case": DisputeCase, "party": "rider | driver", "reason": "up to 500 characters",
  "original_decision": "partial_refund | full_refund | compensation | no_action"}` returns `201` with the
  appeal (`id` like `A-001`, `priority` `safety` when the chat holds a threat, else `standard`,
  `status: "queued"`). `422` for an escalated ruling (already with a human), an empty reason, or links or
  markup; `409` when the queue is full (200). Has its own write rate limits.
- `GET /api/appeals?dispute_id=D001`: the queue, safety first, then oldest first. Not rate-limited.
- `POST /api/appeals/{id}/decision`: `{"decision": "partial_refund | full_refund | compensation | no_action",
  "note": "optional, up to 300 characters"}` records the reviewer's final decision and adds it to the
  precedent knowledge base (`precedent_id` like `R-001`). `404` for an unknown appeal, `409` if already
  decided. Has its own write rate limits.

Keep this contract stable so frontend and backend development can proceed independently.
