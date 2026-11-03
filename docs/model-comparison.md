# Model comparison: Hy3 vs Hy4 preview vs open-source models

Same nine sample disputes (D001-D008, DISP-002), same code, prompts, token limits and output
checks; one run per model; thinking off. Hy3 and Hy4 preview figures are from the
15 Oct 2026 report (TokenHub). The open-source models were run on 2 Nov 2026 with
`scripts/benchmark_models.py`, locally through Ollama on an Apple M4 laptop (24 GB); raw output in
`benchmark-qwen3.5-9b.md`, `benchmark-deepseek-v2-16b.md` and `benchmark-llama3.1-8b.md`.

| Metric | Hy3 | Hy4 preview | Qwen3.5 9B | DeepSeek-V2-Lite 16B | Llama 3.1 8B |
|---|---|---|---|---|---|
| Rulings correct | 9/9 | 9/9 | 9/9 | 9/9 | 9/9 |
| AI-written outputs (total) | 45/45 (100%) | 39/45 (87%) | 41/45 (91%) | 37/45 (82%) | 38/45 (84%) |
| Rider advocate | 9/9 | 9/9 | 9/9 | 9/9 | 9/9 |
| Driver advocate | 9/9 | 8/9 | 9/9 | 9/9 | 9/9 |
| Rider rebuttal | 9/9 | 7/9 | 9/9 | 9/9 | 8/9 |
| Driver rebuttal | 9/9 | 8/9 | 9/9 | 9/9 | 9/9 |
| Judge explanation | 9/9 | 7/9 | 5/9 | 1/9 | 3/9 |
| Wrong-side rule citations | 0 of 18 | 0 of 18 | 3 of 18 | 8 of 18 | 9 of 18 |
| Other off-target citations | 0 | 0 | 4 | 22 | 7 |
| Consistent with closest precedents | 8/9 | 8/9 | 8/9 | 8/9 | 8/9 |
| Time for 9 disputes | ~98 s | 230.6 s | 1,059.8 s | 390.9 s | 898.1 s |
| Time per dispute | ~11 s | ~26 s | ~118 s | ~43 s | ~100 s |
| Tokens per dispute | ~10,000 (published) | not measured | 11,357 | 10,259 | 11,386 |
| Cost per dispute | ~$0.002 | not measured (free quota) | $0 (own hardware) | $0 (own hardware) | $0 (own hardware) |

DeepSeek-R1 8B was tried first but its thinking cannot be switched off (it still reasons with
`think: false`), so its replies would run past the token limits; DeepSeek-V2-Lite, DeepSeek's
non-reasoning chat model, was used instead.

## Why the open-source models fell back

- **Qwen3.5 9B** (Judge, 4): three times "promises a refund the ruling does not give", once "mentions an amount not in the case".
- **DeepSeek-V2-Lite** (Judge, 8): five times "promises a refund the ruling does not give"; also a verdict word ("unjustified") in the driver message, "says the charge stands against the decision", and a rule ID shown to a party. One evidence-collector call also got an HTTP 500 from Ollama (not one of the five counted outputs).
- **Llama 3.1 8B** (Judge, 6; rider rebuttal, 1): three times "mentions an amount not in the case"; also a refund promise, a rule ID shown to a party, an explanation over 1,200 characters, and one empty rebuttal.

TriVerity's checks caught every one, so nothing wrong would reach a rider or driver; those steps
showed "Fallback" instead of "AI". Rulings stay 9/9 for every model because policy rules, not the
model, decide outcomes and amounts.

## Reading

- **Hy3 stays the best fit**: the only model at 100%, the fastest, and no wrong-side citations.
- **The open-source models argue well but explain badly**: all three wrote nearly every advocate and
  rebuttal, but most of their Judge messages to riders and drivers got a refund or amount wrong.
- **They also cite rules for the wrong side** (3 to 9 of 18) and off-target rules, which Hy3 and Hy4 preview did not.
- **Speed is not comparable like for like**: the open-source models ran on a laptop GPU, Hy3/Hy4 on cloud servers.
  Their value is privacy and zero per-call cost (fully offline, data never leaves the machine).

## Caveats

- One run per model; live LLM output varies run to run (see the Hy3 run-to-run table in the report).
- The open-source models are small (8-16B, 4-bit quantised) next to Hy3/Hy4; full-size versions
  (e.g. via OpenRouter, already set up in the script) would likely do better.
- No prompt tuning for any model; prompts and limits were written for Hy3.
