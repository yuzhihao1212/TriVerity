# How prompts drive the agents

TriVerity makes three LLM calls per dispute. (The fourth agent, the Fraud detector, is deterministic and
makes no LLM call.) Each has a narrow job, receives only verified inputs, and
must answer in JSON that the code checks before use (see [architecture.md](architecture.md)).

| Agent | Job | Prompt source |
|---|---|---|
| Rider advocate | Argue for the rider | `advocate_system_prompt()` in `backend/app/agents/_advocate.py` |
| Driver advocate | Argue for the driver | same function, with `party="driver"` |
| Judge (explanation) | Explain a ruling already made by the policy rules | `SYSTEM` in `backend/app/agents/judge_narration.py` |

The prompts below are copied from the code; the code is the source of truth.

## Advocates

**Input (user message):** JSON with the dispute type, the party's own account (the rider's claim or the
driver's statement), the computed facts as sentences, and the policy rules for that dispute type.
Example facts: `"Route was +44% vs expected distance"`, `"Driver arrived 378 m from pickup point"`.

**System prompt** (rider version; the driver version swaps the party):

```text
You are the Rider Advocate in a ride-hailing dispute resolution system. You represent the rider and ONLY
the rider. An impartial Judge will hear the other side separately and decide the outcome.
Rules:
1. Argue for the outcome most favourable to the rider. Never conclude against your client, never say the
   other party should win, and never issue a ruling.
2. Use ONLY the provided case facts and the rider's claim. Never invent or contradict trip data
   (distances, durations, fares, locations, wait times, chat).
3. If a fact hurts your client, do not hide it: acknowledge it briefly, then offer the most reasonable
   context or mitigation the facts allow.
4. In policy_refs, cite ONLY rules whose conditions, applied to these facts, support your client. Do not
   cite rules that favour the other party. If no rule supports your client, return an empty policy_refs
   list and argue from the facts.
5. evidence: list the specific facts that support your client, worded as in the case facts.
Respond with a JSON object only: {"summary": str, "evidence": [str], "policy_refs": [str]}. Each
policy_ref is the rule ID, then ": ", then the rule text.
```

**Output checks:** the reply must parse as JSON with a `summary`; `policy_refs` are kept only if the rule
ID exists in the policy, and each is rewritten with the exact rule text.

**Example output** (D001, route 44% longer and 59% slower; Hy3):

> **Rider advocate**, cites `RD-3`: "The driver took a route 44% longer than expected and the trip took 59%
> longer than expected… The rider questioned the route in chat, showing they did not consent to the detour."
>
> **Driver advocate**, cites nothing: "The driver diverted from the normal route due to congestion on the
> usual road and informed the rider via in-app chat at the time…"

The driver advocate cites no rule because none supports the driver on these facts. That is rule 4 working
as intended.

## Judge

The decision, refund amount, confidence and rules applied are **not** generated. They come from
deterministic policy checks in `backend/app/agents/judge_agent.py`. The LLM only explains them.

**Input (user message):** JSON with the dispute type, both parties' accounts, the facts, the ruling
(decision, recommended action, refund amount, confidence, the rule-based reasoning, the rules applied),
and each advocate's argument and citations.

**System prompt:**

```text
You are the impartial Judge in a ride-hailing dispute resolution system. The ruling you are given is
FINAL: it was decided by company policy rules from verified trip data. Do not change the decision, the
amount, or the policy applied. Your job is to explain it.
Write a JSON object with three strings:
- "explanation": 3-5 sentences for the case record, neutral in tone. State the decision and the policy
rule(s) applied by rule ID, the decisive facts, and respond to each advocate's main argument: say which
argument the facts support and why the other was not decisive.
- "rider_explanation": 2-3 plain, respectful sentences addressed to the rider as "you": the outcome, the
main reason, and what happens next.
- "driver_explanation": the same, addressed to the driver. The rider filed this dispute, so call it "the
rider's dispute", never "your dispute".
Rules: use only the facts given. Describe decisions in plain words (e.g. "the fare stands", "a partial
refund"), never internal codes such as no_action or needs_review. Write money exactly as given, with $ and
two decimals. Only mention rule IDs listed in the ruling, or rules an advocate cited when explaining why
they did not decide the case. Do not state consequences the ruling does not give, such as who pays,
penalties or account actions. If the decision is needs_review, say a human reviewer will decide and do not
promise any refund or outcome.
Never mention bad-faith or fraud risk, or either party's account or dispute history, in the
rider_explanation or driver_explanation. These are internal signals only.
Respond with the JSON object only.
```

**Output checks:** all three texts present; every `$` amount must be one that appears in the case; only
rule IDs the ruling applied or an advocate cited may be named; for a refund, the rider's message must state the amount; for an
escalated case, no text may promise a refund; the rider and driver messages must not mention fraud, bad
faith or anyone's history. Otherwise the rule-based template wording is used.

**Example output** (D001):

> **Case record:** "The ruling is a partial refund of $6.30, the fare charged above the expected fare,
> under policy rule RD-3… The rider's advocate is supported because the data meets RD-3's threshold and
> the rider questioned the route, while the driver's advocate's congestion claim was not decisive since
> trip data shows no time saved and no policy exception applies."
>
> **To the rider:** "Your dispute resulted in a partial refund of $6.30, the amount your fare exceeded the
> expected fare…"

## What testing changed

Each rule in the prompts above exists because live Hy3 output broke it. We ran all seven sample disputes
after each change.

| Problem seen with Hy3 | Prompt change |
|---|---|
| With reasoning turned off for speed, advocates argued the other side ("the no-show charge should not apply", from the *driver* advocate) and ruled on the case themselves | Advocate rules 1 and 3: argue only for your client, never rule, acknowledge bad facts without conceding |
| Advocates cited rules that favour the other party: 9 wrong-side citations across the 14 advocate cases in the seven samples | Advocate rule 4: cite only rules whose conditions support your client, or none. Down to 2 |
| The Judge told the driver "$6.30 will be deducted from your earnings", which nothing in the case states | "Do not state consequences the ruling does not give" |
| The check rejected good explanations that named an advocate's cited rules to say why they lost (e.g. "the driver's advocate cited NS-2 and NS-3, but…"), so the Judge's badge flipped between AI and Fallback on re-runs | The check allows rules the ruling applied **or an advocate cited**, and the prompt allows naming advocate-cited rules only to explain why they didn't decide the case |
| Messages said "decided as no_action" | "Describe decisions in plain words… never internal codes" |
| The driver was told "your dispute" about the rider's dispute | Explicit instruction in the `driver_explanation` field |
| After the Fraud detector was added, the rider was told "your account's dispute history triggered a review" and the driver "the rider's history led to review" | "Never mention bad-faith or fraud risk, or either party's account or dispute history" in party messages, plus a check that rejects them |

Reasoning ("thinking") is turned off for all three calls. With it on, the two advocates alone took about
40 seconds per dispute and the Judge's explanation about 20 more; with it off, a whole dispute takes 6–8
seconds, and with the rules above the output was as good or better.
