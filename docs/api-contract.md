# API Contract

## POST `/api/disputes/resolve`

Input: `DisputeCase` (see `backend/app/models/dispute.py` and the samples in `data/disputes/`).

Output: `Resolution` (see `backend/app/models/resolution.py`):

```json
{
  "decision": "partial_refund | full_refund | no_action | needs_review",
  "recommended_action": "string",
  "refund_amount": 6.3,
  "confidence": 0.8,
  "explanation": "string",
  "judge_evidence": ["string"],
  "policy_refs": ["RD-3: A route more than 15% longer ..."],
  "rider_case": {"agent": "rider_advocate", "summary": "string", "evidence": [], "policy_refs": []},
  "driver_case": {"agent": "driver_advocate", "summary": "string", "evidence": [], "policy_refs": []},
  "agent_log": [{"step": 1, "agent": "evidence_loader", "status": "completed", "message": "string"}]
}
```

`refund_amount` is `null` when no refund applies. `policy_refs` cite rule IDs from
`data/policies/ryde_mock_policy.json`.

Keep this contract stable so frontend and backend development can proceed independently.
