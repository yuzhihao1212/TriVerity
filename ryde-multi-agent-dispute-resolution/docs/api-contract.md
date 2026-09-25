# API Contract

## POST `/api/disputes/resolve`

Input: `DisputeCase`

Output:

```json
{
  "decision": "partial_refund | full_refund | no_action | needs_review",
  "recommended_action": "string",
  "confidence": 0.0,
  "explanation": "string",
  "rider_case": {},
  "driver_case": {},
  "judge_evidence": [],
  "agent_log": []
}
```

Keep this contract stable so frontend and backend development can proceed independently.
