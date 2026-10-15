# Submission text

Draft answers for the hackathon form (AI CAN DO IT Tencent Cloud Hackathon Singapore 2026, Digital Native
Track, Ryde). Numbers come from [evaluation.md](evaluation.md) and the README; the sample disputes are
synthetic, so they are measurements on samples, not production results.

## Project title

TriVerity Multi-Agent Dispute Resolution for Ryde

## Short blurb (under 10 words)

AI agents argue both sides; policy rules decide fairly.

Alternatives: "Fair, explained ride-hailing dispute rulings in seconds" · "Two AI advocates, one rule-bound judge, every dispute explained"

## Project description

### Project overview: scenarios, users and value

TriVerity resolves rider–driver disputes for Ryde, starting with the two most common categories in the
challenge brief: route deviation ("the driver took a longer route and I was overcharged") and no-show
charges ("the driver never came but I was charged a fee"). Its users are Ryde's support reviewers, who
today read GPS logs, chats and fare records by hand, and Ryde's riders and drivers, who get a fast,
explained outcome instead of a 24–72 hour wait.

A Rider Advocate and a Driver Advocate (Tencent Hy3) each build their side's case from verified evidence
and answer each other in a rebuttal round. A Fraud & Bad-Faith detector, a Policy & Precedent agent and a
rule-based Judge then decide, and Hy3 explains the ruling to the case record and separately to each party.
Standard cases resolve in about 11 seconds; risky or unclear ones go to a human reviewer, ordered by
priority.

### Real-world insights: pain points, audience and the problems solved

The brief describes thousands of daily disputes, each needing a person to review GPS telemetry, chat logs,
payment records and policy. That causes high support costs, 24–72 hour resolution times, inconsistent
rulings between agents on similar cases, and churn when customers feel unfairly treated.

TriVerity targets each of these:

- **Speed**: about 11.5 seconds per dispute, end to end.
- **Consistency**: facts are computed in code and the decision comes from Ryde's policy rules, so the same
  facts always give the same ruling. The Policy & Precedent agent checks each ruling against the closest
  past rulings.
- **Fairness people can see**: both sides get an advocate, every argument cites evidence IDs and policy
  rules, and each party gets a plain explanation of the outcome.
- **Humans where they matter**: threats in chat, high bad-faith risk, missing data, low confidence, or
  reviewer precedents that contradict the rules all escalate to a human, with a priority tier so safety
  cases come first.

### Solution design: business and technical architecture, and how prompts drive generation

**Pipeline** (diagram: [architecture.svg](architecture.svg)):

1. The **evidence loader** turns the raw case (trip data, GPS points, fare breakdown, chat, both parties'
   history) into facts with an ID per fact (`TRIP-1`, `GPS-2`, …): route detour and delay, stops, distance
   from pickup, waiting time, surge and promo checks, threats and agreements in chat. No LLM, so facts are
   never generated.
2. The **Rider and Driver advocates** (Hy3) argue for their own party only, citing evidence by ID and the
   policy rules that support them, then **rebut** each other once.
3. The **Fraud & Bad-Faith detector** scores both parties' risk from history and contradicted claims.
4. The **Policy & Precedent agent** retrieves the three most similar past rulings from a precedent
   knowledge base and checks the rules' decision against them. Human reviewers' decisions feed back into it
   (learning feedback loop), and repeated reviewer disagreement escalates similar disputes.
5. The **Judge**: Ryde's policy rules decide the outcome, refund and confidence; Hy3 writes the explanation,
   answering both advocates and citing the precedents (retrieval-augmented generation).
6. **Triage** gives escalated disputes a review tier (safety, high, standard, low) and score.
7. The **demo UI** walks a reviewer through Intake → Evidence → Hearing → Ruling → Notify parties, showing
   every agent's step and whether the AI or a fallback produced it.

**How prompts drive the generation** (full prompts: [prompts.md](prompts.md)):

- Each agent has one narrow job in its system prompt: the advocates "argue only for your client, never
  rule"; the Judge "the ruling is FINAL; explain it, don't change it".
- Prompts get verified inputs only: computed facts with IDs and the relevant policy rules. Party text is
  labelled as untrusted data, never instructions.
- Every reply must be JSON, and code checks it before use: rule IDs must exist, evidence IDs must be real,
  amounts must match the case, party messages may not mention fraud signals or history. Anything that fails
  is replaced by a deterministic fallback, and the UI shows which one was used.
- Each prompt rule came from a real failure we saw in testing, for example advocates citing rules that
  favour the other side (9 wrong-side citations in 14 cases, down to 2 after the prompt change).

**Technology:** Tencent Hy3 through Tencent Cloud TokenHub; Python FastAPI backend; React frontend; 585
backend and 28 frontend tests; a Docker image and Render Blueprint for the live demo. Built with CodeBuddy <!-- add how the team used
CodeBuddy / WorkBuddy, matching the screenshots -->, plus Miora for the cover image.

**Security:** a threat model, 23 prompt-injection attacks in 68 live runs with no ruling changed, input and rate
limits, a daily token budget, a public demo mode, and separate rider and driver views that never show
internal signals ([security.md](security.md)).

### Business value: metrics and impact

Measured on the 9 sample disputes, including the organisers' case:

| Metric | Today (brief) | TriVerity |
|---|---|---|
| Time to a ruling | 24–72 hours | about 11.5 seconds |
| Rulings matching the expected outcome | inconsistent between agents | 9 / 9 (rule-based: same facts, same ruling) |
| Disputes resolved without a human | 0% | 6 of 9; the other 3 (missing data, threat, fraud risk) escalated with a priority tier |
| AI cost per dispute | — | about 5,400 tokens, roughly $0.001 with Hy3 |
| Explanation | varies by agent | always: a case record plus a message to each party |

For Ryde, that means reviewers spend their time on the cases that need judgement (safety first), riders and
drivers get an explained answer in seconds, and rulings stay consistent and auditable, with every step
logged and every rule cited.
