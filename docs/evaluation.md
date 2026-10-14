# Evaluation

`scripts/evaluate.py` scores every sample dispute against its expected ruling in
`data/expected_rulings.json`, so prompt and model changes can be measured instead of eyeballed.

## What it measures

| Metric | Meaning |
|---|---|
| Ruling correct | Decision, refund amount and applied policy rules all match the label |
| AI rate per agent | How often the rider advocate, driver advocate and Judge explanation came from the LLM rather than the deterministic fallback. Across repeated runs this also shows badges flipping between AI and Fallback |
| Wrong-side citations | An advocate cited a rule whose condition, applied to the facts, favours the other party |
| Other off-target citations | An advocate cited a rule that supports neither side here (e.g. an escalation rule) |

Rulings come from policy rules, never from the LLM, so "ruling correct" tests the rules and
should always be 100%; the script exits non-zero if it isn't. The LLM's contribution is
measured by the other three metrics: whether it produced the arguments and explanations,
and whether the advocates cited the right rules.

## Labels

Each sample's label gives the expected decision, refund and rules, and which rules support
each side given that sample's facts. D001–D008 are the team's samples; DISP-002's expected
ruling ("cancellation charge upheld") is the organisers' own.

## Running it

```bash
# backend/.env: an LLM key, plus preset 1 from .env.example (eval needs the higher budget)
python scripts/evaluate.py                         # every sample once
python scripts/evaluate.py --runs 5 --ids D007,D008
```

It resolves in-process, so the API rate limits don't apply, but each resolve spends about
4,000 tokens of `DAILY_TOKEN_BUDGET`. If the budget runs out mid-run, the report says so,
because later results would silently be Fallback. With no key everything is Fallback and
only the ruling column is meaningful.
