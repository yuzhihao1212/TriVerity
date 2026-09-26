# Milestones

Measured against the Ryde challenge brief and the hackathon submission requirements.

## Required by the brief

| | Requirement | Status |
|---|---|---|
| ✅ | Rider Advocate, Driver Advocate and Judge agents | LLM-backed (Hy3), with checked output and fallbacks |
| ✅ | Evidence: GPS/telemetry, chat logs, fare and payment data, history profiles | Computed into facts by the evidence loader |
| ✅ | Advocates cite company policy | Rule IDs validated against the policy |
| ✅ | Ruling with recommended action, confidence and natural-language reasoning | Rule-based ruling, LLM explanation for the record and for each party |
| ✅ | Two dispute categories end to end | Route deviation and no-show charge |
| ✅ | Observable inter-agent communication | Agent log and demo UI with AI / Fallback badges |
| ✅ | Working prototype, architecture diagram, source on GitHub | Diagram in [architecture.md](architecture.md) |
| ⬜ | Handle the organisers' sample dataset | Waiting for the dataset; add a converter into `DisputeCase` |
| ⬜ | Live demo walkthrough | Rehearse with D001 (refund), D005 (no-show refund), D007 (escalation) |

## Stretch goals (bonus points)

| | Goal | Status |
|---|---|---|
| ✅ | Escalation protocol | `SAFE-1` threats and `ESC-1` confidence below 60% go to human review |
| ⬜ | Fraud and bad-faith detection agent | Next: risk signal from rider/driver history for the Judge |
| ⬜ | Policy and precedent agent | Past rulings as precedent for consistency |
| ⬜ | Evidence collection agent, image analysis, feedback loop, SLA routing | Not planned |

## Submission checklist

| | Item | Owner |
|---|---|---|
| ⬜ | Built with CodeBuddy, with proof (at least 3 chat screenshots) | Three CodeBuddy rounds done (PR #2); confirm the screenshots are saved in one folder |
| ⬜ | Project title and blurb under 10 words | Team |
| ⬜ | Project description: overview, pain points, solution design incl. how prompts drive generation ([prompts.md](prompts.md)), business value | Team, from the docs |
| ⬜ | 16:9 cover image (380×216) | Team (Miora) |
| ⬜ | Demo video, 5–8 minutes (optional) | Team |
| ⬜ | Live demo link (optional, bonus points) | Needs hosting |
