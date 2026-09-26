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
Chat messages and history accept extra fields, so external datasets can pass through.

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
- `compensation` is reserved for payouts beyond a refund; no rule produces it yet.

Keep this contract stable so frontend and backend development can proceed independently.
