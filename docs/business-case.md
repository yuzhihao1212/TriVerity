# Business case and deployment plan

What TriVerity could be worth to a ride-hailing platform such as Ryde, and how it would be rolled out safely.
This is an illustrative model from a hackathon team, not a plan agreed with Ryde. The ROI below is a model:
**every input marked *assumption* is ours, not Ryde's**, and should be replaced with Ryde's own numbers.
The measured inputs come from [simulation.md](simulation.md) and the live evaluation in the README.

## Inputs

| Input | Value | Source |
|---|---|---|
| Disputes a day | 5,000 | *assumption* (illustrative volume) |
| Resolved without a human | 78% | measured: 500 generated disputes ([simulation.md](simulation.md)); depends on the case mix |
| Reviewer time per dispute today | 5–15 min | *assumption* (reading GPS, chat, fare and history by hand) |
| Loaded reviewer cost | $20–30 an hour | *assumption* |
| AI cost per dispute | about $0.002 (~10,000 tokens) | measured token use at Hy3's listed price ($0.132 / $0.528 per million input / output tokens) |
| Time to a ruling | about 16–18 s vs 24–72 h | measured; 24–72 h from the Ryde challenge brief |

## Reviewer time freed (per day, at 5,000 disputes)

Only automatically resolved disputes are counted; escalated ones still go to a reviewer, although they
arrive with the evidence, both arguments, a proposed action and a priority, which should also cut their
handling time (not counted here).

| Reviewer time per dispute | 60% automated | 78% automated (measured mix) |
|---|---|---|
| 5 min | 250 h ($5,000–7,500) | 325 h ($6,500–9,750) |
| 10 min | 500 h ($10,000–15,000) | 650 h ($13,000–19,500) |
| 15 min | 750 h ($15,000–22,500) | 975 h ($19,500–29,250) |

**AI cost: about $10 a day** for all 5,000 disputes. Even at the most conservative corner (5 minutes,
60% automated, $20 an hour), the reviewer time freed is worth about 500 times the AI cost.

Not in the numbers, but part of the value:
- **Speed:** seconds instead of days, which the brief links to churn.
- **Consistency:** same facts, same ruling (100/100 re-runs), and party history never changed a policy
  decision (500/500), which cuts inconsistent rulings between agents.
- **Auditability:** every ruling cites its rules and facts, says what would have changed it, and logs each
  agent step.

## Deployment plan

1. **Shadow mode (2–4 weeks).** Run TriVerity on live disputes alongside the current team, with no
   customer impact. Measure agreement with reviewers' decisions per dispute type, and tune the policy
   thresholds (they are placeholders) with Ryde's operations team.
2. **Pilot: route deviation, human over the loop.** Rulings go out automatically for complete, low-risk
   cases; a reviewer samples them daily. Escalations, appeals and every reviewer override feed the
   precedent store. Extend to no-show charges once agreement holds.
3. **Scale and integrate.**
   - Replace the mock data-source APIs (`backend/app/services/data_sources.py`) with Ryde's trip,
     telemetry, payments and messaging services.
   - Look cases up server-side instead of trusting client-supplied facts.
   - Persist disputes, appeals and precedents; add the review queue with SLA clocks per triage tier
     ([architecture.md](architecture.md)).
   - Add reviewer and party logins (auth tier T3) and an append-only audit log ([security.md](security.md)).
4. **Govern continuously.**
   - Version the policy; re-run the evaluation, the scale test and the prompt-injection red team before
     any rule or prompt change.
   - Track fairness (history-blind and history-swapped checks) and the precedent consistency rate.

### KPIs to track

| KPI | Why |
|---|---|
| Agreement with reviewers (shadow and pilot) | Is the policy encoded correctly? |
| Automatic resolution rate | Reviewer time freed |
| Appeal rate and overturn rate | Fairness as the parties see it; overturns become precedents |
| Time to resolution, per tier | Speed, and SLA for escalations |
| Cost per dispute | AI spend stays negligible |
| Rider and driver satisfaction after a ruling, churn | The business outcome the brief cares about |
