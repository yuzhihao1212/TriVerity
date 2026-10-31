# Submission text

Answers for the hackathon form (AI CAN DO IT Tencent Cloud Hackathon Singapore 2026, Digital Native Track,
Ryde challenge), polished with WorkBuddy (Hy4 preview) and checked against the repository. Numbers come from
[evaluation.md](evaluation.md), [simulation.md](simulation.md) and the README.

**For the form:** paste the fields below. Drop the relative doc links (they won't work in a form) and give
the repository URL https://github.com/yuzhihao1212/TriVerity instead. Updated on 30 Oct 2026 for the finalist materials; the first version was submitted on 16 Oct 2026.

## Project title

TriVerity: Multi-Agent Autonomous Dispute Resolution System

## Short blurb (under 10 words)

**Ride disputes resolved fairly in seconds, not days.** (8 words; use this one in the form)

The same line leads the landing page and README, followed by "AI agents argue both sides; policy rules decide fairly."

## Project description

### Project overview: scenarios, users and value

TriVerity resolves rider–driver disputes for a ride-hailing platform. It starts with two of the dispute
categories in Ryde's challenge brief: route deviation ("the driver took a longer route and I was
overcharged") and no-show charges ("the driver never came but I was charged a fee").

Two groups benefit. Dispute reviewers, who today read GPS logs, chats and fare records by hand. Riders and
drivers, who get a fast, explained outcome instead of a 24–72 hour wait.

Specialised agents work like a small courtroom. Code first turns the case data into verified facts; then an
Evidence Collection agent (Tencent Hy3) decides which extra trip, GPS, fare and chat records each side needs. A Rider Advocate and a Driver Advocate (Hy3) build their
side's case from verified evidence and answer each other once. A Fraud & Bad-Faith detector and a Policy &
Precedent agent then check the case. The platform's policy rules (a mock Ryde policy) decide the outcome, and
Hy3 explains the ruling to the reviewer and separately to each party. Standard cases resolve in about 16–18 seconds, and routine ones
close by themselves within strict limits. Risky or unclear ones go to a human reviewer, ordered by priority.

TriVerity is a hackathon prototype by OeroAI, built for Ryde's challenge and not affiliated with or endorsed
by Ryde. All dispute data is synthetic, so the results below are measurements on samples, not production
results.

### Real-world insights: pain points, audience and the problems solved

The brief describes thousands of daily disputes, each needing a person to review GPS telemetry, chat logs,
payment records and policy. That drives up support costs, stretches resolution to 24–72 hours, produces
inconsistent rulings on similar cases, and loses customers who feel unfairly treated.

TriVerity targets each of these:

- **Speed**: about 16–18 seconds per dispute, end to end.
- **Consistency**: facts are computed in code, and the policy rules make the decision, so the same facts
  always give the same ruling (100 of 100 re-runs). The Policy & Precedent agent also checks each ruling
  against the closest past rulings.
- **Fairness people can see**: both sides get an advocate, every argument cites evidence IDs and policy
  rules, and each party gets a plain explanation of the outcome. Party history never changed a policy
  decision (500 of 500 simulated disputes with histories removed or swapped); it is only used to check for
  bad-faith patterns.
- **Humans where they matter**: a case goes to a human when there are threats in chat, high bad-faith risk,
  missing data, low confidence, or reviewer precedents that contradict the rules. A priority tier puts
  safety cases first. A reviewer can accept or override a ruling, reopen a closed case, and parties can appeal.
- **Automation with limits**: a routine case closes by itself only when the rules are at least 80% confident,
  the refund is at most $10 and nothing needs a person. Both parties are told it was decided automatically
  and how to appeal, a repeatable ~10% sample still goes to a reviewer, and automatic decisions never become
  precedents.

### Solution design: business and technical architecture, and how prompts drive generation

**Pipeline** (diagram: [architecture.svg](architecture.svg)):

1. The **evidence loader** turns the raw case (trip data, GPS points, fare breakdown, chat, both parties'
   history) into facts, one ID per fact (`TRIP-1`, `GPS-2`, …): route detour and delay, comparison with the
   planned route, stops, distance from pickup, waiting time, surge and promo checks, threats and agreements
   in chat. No LLM is involved, so facts are never generated.
2. The **Evidence Collection agent** (Hy3) plans calls to deterministic data-source tools over mock Ryde
   APIs (trip record, GPS windows and stops, fare lines, chat windows, app events) for each side, in up to
   two rounds. Contact details are removed from chat quotes before they reach the AI.
3. The **Rider and Driver advocates** (Hy3) argue for their own party only, citing evidence by ID and the
   policy rules that support them, then **rebut** each other once.
4. The **Fraud & Bad-Faith detector** scores both parties' risk from history and contradicted claims.
5. The **Policy & Precedent agent** retrieves the three most similar past rulings from a precedent
   knowledge base and checks the rules' decision against them. Human reviewers' decisions and appeal
   outcomes feed back into it (learning feedback loop), and repeated reviewer disagreement escalates
   similar disputes.
6. The **Judge**: the policy rules decide the outcome, refund and confidence; Hy3 writes the explanation,
   answering both advocates and citing the precedents (retrieval-augmented generation). Every ruling also
   states what would change it (counterfactuals) and how each cited rule held up against the facts.
7. **Triage** gives escalated disputes a review tier (safety, high, standard, low) and a score.

**Reviewer console** (React):

- A **reviewer home** with the queue: cases needing a decision come first, with a status and summary tile
  per case.
- Each case walks through **Intake → Evidence → Hearing → Ruling → Notify parties**, with live progress
  while the agents run and a log showing whether each step came from the AI, a fallback, or code.
- **Evidence** explains itself: a route sketch drawn from the GPS data against the planned route, a trip
  timeline with stops, a fare verdict with checks (lines add up, surge, promo), neutral party-history cards (highlighted only when the fraud check flags a party),
  and an audit trail of what the evidence collector looked up for each side.
- **Hearing** shows each side's key facts first, then evidence grouped by source, and which facts only one
  side relies on.
- **Ruling** leads with the outcome, the confidence and a checklist of the conditions the rules checked. The
  reviewer accepts or overrides it, and every human decision becomes a precedent. An investigation, or a
  refund above the reviewer's limit, puts the case on hold for a second reviewer (simulated), and nobody is
  notified. A case that closed by itself shows why.
- **Notify parties**: the reviewer approves the messages each party receives, can add a short personal note
  (internal IDs and assessments such as fraud signals block sending; everyday words such as "history" only
  warn), and sends. Parties can appeal
  only after receiving the outcome.
- **Closed cases**: a sent case reopens read-only with a "Case closed" banner; a deliberate Reopen allows a
  correction, and the history keeps every message that was sent.
- An **AI Live / Off** switch lets the whole flow run without AI cost; rulings are identical, and only
  the wording falls back to templates.

**How prompts drive the generation** (full prompts: [prompts.md](prompts.md)):

- Each agent has one narrow job in its system prompt: the advocates "argue only for your client, never
  rule"; the Judge "the ruling is FINAL; explain it, don't change it".
- Prompts get verified inputs only: computed facts with IDs and the relevant policy rules. Party text is
  labelled as untrusted data, never instructions.
- Every reply must be JSON, and code checks it before use: rule IDs must exist, evidence IDs must be real,
  amounts must match the case, and party messages may not mention fraud signals or history. Anything that
  fails is replaced by a deterministic fallback, and the UI shows which one was used.
- Each prompt rule came from a real failure we saw in testing, for example advocates citing rules that
  favour the other side (9 wrong-side citations in 14 cases, down to 2 after the prompt change).

**Technology:** Tencent Hy3 through Tencent Cloud TokenHub; Python FastAPI backend; React + TypeScript
frontend; 975 backend and 467 frontend tests (verified on 31 Oct 2026); a Docker image and Render Blueprint for the live
demo (https://triverity-demo.onrender.com). **Built with:** Tencent Cloud **CodeBuddy**
(the LLM client, advocate agents, hardening, UI badges and the Fraud & Bad-Faith detector); **WorkBuddy**
(Hy4 preview) to polish this submission text, review the docs for consistency, prepare judge Q&A and
summarise the build history; **Miora** for the cover image; and the AI coding assistants **Claude Code**,
**OpenAI Codex** and **Kiro** for features, refactors and code review. Every change went through a pull
request, automated tests and CI before merging.

**Security and responsible AI:** a threat model; we catalogued 23 prompt-injection attacks and ran 17 of
them in 68 live Hy3 runs, and none changed a ruling; input and rate limits; a daily token budget; a
public demo mode; and separate rider and driver views that never show internal signals
([security.md](security.md), [responsible-ai.md](responsible-ai.md), [system-card.md](system-card.md)).

### Business value: metrics and impact

Measured on the 9 sample disputes, including the organisers' case, and on 500 generated disputes:

| Metric | Today (brief) | TriVerity |
|---|---|---|
| Time to a ruling | 24–72 hours | about 16–18 seconds |
| Rulings matching the expected outcome | inconsistent between agents | 9 / 9 samples |
| Disputes decided by the rules without escalation | 0% | 78% of 500 generated disputes ([scale test](simulation.md)), the rest escalated with a priority tier; 6 of 9 samples, 5 of which close by themselves (the samples deliberately include escalation cases, so the simulation is the better estimate) |
| Consistency | varies by agent | same facts, same ruling: 100 of 100 re-runs |
| Fairness | not measured | party history never changed a policy decision: 500 of 500 |
| At 5,000 disputes a day (illustrative) | thousands of review hours | about 1,100 to human review, about $10 a day in AI cost; an estimated 325–975 reviewer hours freed a day ([business case](business-case.md); reviewer time and cost are assumptions) |
| AI cost per dispute | — | about 11,000 tokens, roughly $0.002 with Hy3 |
| Explanation | varies by agent | always: a case record, a message to each party, and what would change the ruling |

For the platform, that means reviewers spend their time on the cases that need judgement, with safety first.
Riders and drivers get an explained answer in seconds. Rulings stay consistent and auditable, with every
step logged, every rule cited, and a human able to override or hear an appeal.

**Next:** image evidence for damage and mess disputes (the brief's third category). We deliberately didn't
ship it in the hackathon: photos need authenticity, privacy and prompt-injection safeguards first. In the
design, a vision model only extracts facts and the policy rules still decide.
