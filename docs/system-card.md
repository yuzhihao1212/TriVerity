# System card: TriVerity

A one-page summary of what TriVerity is for, how it was evaluated, and where it should not be used.

## What it is

A multi-agent system that resolves rider–driver disputes for a ride-hailing platform (built for the Ryde
challenge). An Evidence Collection agent, Rider and Driver advocates and a Judge explanation use Tencent
Hy3 through Tencent Cloud TokenHub; the fraud detector, Policy & Precedent agent, policy rules, triage and
counterfactuals are deterministic code. Architecture: [architecture.md](architecture.md).

## Intended use

- **Users:** a ride-hailing support team's dispute reviewers (reviewer console), and riders and drivers,
  who receive the outcome and its explanation.
- **Tasks:** route-deviation and no-show-charge disputes: recommend an outcome from company policy,
  explain it, and send risky or unclear cases to a human with a priority.
- **Decision authority:** the policy rules decide; humans decide every escalated case and every appeal.

## Not intended for

- Penalising, suspending or rating riders or drivers. The fraud detector only escalates.
- Dispute types it wasn't built for: property damage (needs image analysis) and safety incidents beyond
  threats in chat, which go straight to a human.
- Deciding without a human where the facts are missing, a threat or high bad-faith risk is present, or
  the confidence is below 60%.
- Any production use without a reviewer login, server-side case lookup and an audit log (see the
  production roadmap in [security.md](security.md)).

## Data

- **Synthetic:** 8 sample disputes written by the team and the organisers' sample case (DISP-002), plus
  500 generated disputes for the scale test and 162 synthetic precedents. No real rider or driver data.
- **Sent to the AI provider:** the dispute type, both parties' accounts, computed facts and policy rules.
  Never GPS coordinates or party history; contact details are removed from chat quotes.

## Evaluation

| What | Result | Where |
|---|---|---|
| Rulings on the 9 samples | 9/9 correct, every run | [evaluation.md](evaluation.md) |
| AI outputs (advocates, rebuttals, Judge) | 42–45 of 45 per live run; the rest are caught by the checks and fall back | README results |
| Advocates citing a rule that favours the other side | 0–2 of 18 per run in recent live runs | [evaluation.md](evaluation.md) |
| Scale (500 generated disputes, offline) | 78% resolved without a human; same facts, same ruling 100/100 | [simulation.md](simulation.md) |
| Fairness | Party history never changed a policy decision (removed or swapped: 500/500) | [simulation.md](simulation.md) |
| Prompt injection | 23 attacks, 68 live runs, no ruling changed | [security.md](security.md) |
| Cost and speed | about 8,000 tokens (~$0.002) and 16 s per dispute | README |

## Known limits

- All measurements are on synthetic data; real disputes will be messier.
- Two dispute types; English-only party messages (the safety checks read English).
- Chat analysis (threats, sentiment) is keyword-based, so it can miss sarcasm or flag harmless phrases.
- The precedent set is generated from the rules plus a few synthetic reviewer decisions; its value grows
  only with real reviewer decisions. Feedback and appeals are kept in memory in this prototype.
- The client currently supplies the case facts; production would look cases up server-side.
- An occasional AI step falls back (a timeout or an over-long reply); the ruling is unaffected, and the
  badge shows it.

## Contacts and responsibility

Built by the TriVerity team for the AI CAN DO IT Tencent Cloud Hackathon Singapore 2026 (Digital Native
Track). Source: https://github.com/yuzhihao1212/TriVerity. Responsible-AI mapping:
[responsible-ai.md](responsible-ai.md).
