# Milestones

Measured against the Ryde challenge brief and the hackathon submission requirements.
Status as of 30 Oct 2026. Submitted 16 Oct 2026; finalist, with the rehearsal on 2 Nov and Demo Day on 3 Nov 2026.

## Required by the brief

| | Requirement | Status |
|---|---|---|
| ✅ | Rider Advocate, Driver Advocate and Judge agents | LLM-backed (Tencent Hy3), with checked output and fallbacks |
| ✅ | Evidence: GPS/telemetry, chat logs, fare and payment data, history profiles | Computed into facts by the evidence loader; the GPS path is compared point by point with the planned (optimal) route; chat analysis covers threats, agreements, disagreements and per-party sentiment (keyword-based) |
| ✅ | Advocates cite company policy | Rule IDs validated; evidence cited by ID from named sources; rebuttal round |
| ✅ | Ruling with recommended action, confidence and natural-language reasoning | Rule-based ruling, LLM explanation for the record and for each party |
| ✅ | Two dispute categories end to end | Route deviation and no-show charge |
| ✅ | Observable inter-agent communication | Agent log and demo UI with AI / Fallback badges |
| ✅ | Working prototype, architecture diagram, source on GitHub | Diagram in [architecture.md](architecture.md) |
| ✅ | Handle the organisers' sample dataset | Adapter in `backend/app/services/ryde_adapter.py`; DISP-002 resolves as expected |
| ✅ | Evaluation | `scripts/evaluate.py` ([evaluation.md](evaluation.md)): 9/9 rulings correct live, 42/45 outputs by the AI (45/45 before the evidence collector), 8/9 consistent with precedent |
| 🟡 | Demo Day walkthrough | A recorded demo in the presentation; rehearsal on 2 Nov 2026 |

## Stretch goals (bonus points)

| | Goal | Status |
|---|---|---|
| ✅ | Escalation protocol | `SAFE-1` threats, `FRAUD-1` high bad-faith risk and `ESC-1` confidence below 60% go to human review |
| ✅ | Fraud and bad-faith detection agent | Deterministic risk from history and contradicted claims; never penalises, only escalates |
| ✅ | Policy and precedent agent | Retrieves the closest past rulings (162 synthetic); the Judge cites them; consistency measured in the evaluation |
| ✅ | Learning feedback loop | Reviewer decisions become precedents; repeated reviewer disagreement escalates similar disputes (`PREC-1`) |
| ✅ | SLA and routing manager (triage) | Escalated disputes get a tier (safety first), a score and reasons; the queue and SLA clocks are documented as the production extension ([architecture.md](architecture.md)) |
| ✅ | Evidence collection agent | Hy3 plans tool calls over mock Ryde APIs (trip, telemetry, payments, messaging) in up to two rounds; tools are deterministic, default plan as fallback |
| ⬜ | Image analysis | Not planned |

## Security and responsible AI

| | Item | Status |
|---|---|---|
| ✅ | Threat model | [security.md](security.md) |
| ✅ | Prompt-injection red team | 23 attacks catalogued; 68 live runs, no ruling changed ([findings](redteam/findings.md)) |
| ✅ | API hardening | Input limits, rate limits, daily token budget, public demo mode, judge access codes, party-only views |
| ✅ | Secrets and dependencies | gitleaks and trufflehog clean; pre-commit hook and CI scans; pinned Python dependencies |
| ⬜ | Frontend build-tool advisories (Vite, esbuild) | 5 Dependabot alerts, all in dev and build tools; Vite upgrade after the deadline |

## Submission checklist (submitted 16 Oct 2026)

| | Item | Owner |
|---|---|---|
| ✅ | CodeBuddy / WorkBuddy usage proof prepared: 7 CodeBuddy and 3 WorkBuddy captures | [Evidence PDF](submission/ai-tool-evidence.pdf); upload to the submission form still needs confirmation |
| ✅ | Project title and blurb under 10 words ([submission.md](submission.md)) | Lead |
| ✅ | Project description: overview, pain points, solution design incl. how prompts drive generation ([prompts.md](prompts.md)), business value | Lead, from the docs |
| ✅ | 16:9 cover image (380×216) | Lead (Miora) |
| ✅ | Demo video, 5–8 minutes (optional) | [Video](https://www.youtube.com/watch?v=z3-8uuPBPAw) |
| ✅ | Live demo link (optional, bonus points) | [triverity-demo.onrender.com](https://triverity-demo.onrender.com); deployed by hand, so each deploy is a manual step ([demo-deployment.md](demo-deployment.md)) |
