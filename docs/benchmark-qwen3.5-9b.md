# TriVerity model benchmark (2026-11-02 06:32 UTC)

Method as in the Hy4 preview vs Hy3 report: scripts/evaluate.py logic, 1 run(s) per sample, same prompts, token limits and output checks; only the model changes. An output counts as AI-written only when its source is the LLM.

| Metric | qwen3-local |
|---|---|
| Model ID | `qwen3.5:9b` |
| Rulings correct | 9/9 |
| AI-written outputs (total) | 41/45 (91%) |
| Rider advocate | 9/9 |
| Driver advocate | 9/9 |
| Rider rebuttal | 9/9 |
| Driver rebuttal | 9/9 |
| Judge explanation | 5/9 |
| Wrong-side rule citations | 3 of 18 |
| Other off-target citations | 4 |
| Consistent with closest precedents | 8/9 |
| Errored runs | 0 |
| Wall-clock time (all samples) | 1059.8 s |
| Time per dispute | 117.8 s |
| Tokens per dispute | 11,357 |
| Cost per dispute | $0.0000 |

## Why outputs fell back

**qwen3-local**: 
- Judge narration fell back to templates: promise: promises a refund the ruling does not give (rider_explanation)
- Judge narration fell back to templates: promise: promises a refund the ruling does not give (rider_explanation)
- Judge narration fell back to templates: promise: promises a refund the ruling does not give (rider_explanation)
- Judge narration fell back to templates: amount: mentions an amount not in the case

## Per-sample detail

### qwen3-local (`qwen3.5:9b`)

| Sample | Ruling correct | Rider AI | Driver AI | Rider rebuttal AI | Driver rebuttal AI | Judge AI | Wrong-side citations | Other off-target citations | Precedents |
|---|---|---|---|---|---|---|---|---|---|
| D001 | 1/1 | 1/1 | 1/1 | 1/1 | 1/1 | 1/1 | 0 | 0 | consistent |
| D002 | 1/1 | 1/1 | 1/1 | 1/1 | 1/1 | 1/1 | 0 | rider cited NS-2 | no_precedent |
| D003 | 1/1 | 1/1 | 1/1 | 1/1 | 1/1 | 1/1 | 0 | rider cited RD-3 | consistent |
| D004 | 1/1 | 1/1 | 1/1 | 1/1 | 1/1 | 0/1 | 0 | rider cited RD-4 | consistent |
| D005 | 1/1 | 1/1 | 1/1 | 1/1 | 1/1 | 1/1 | 0 | 0 | consistent |
| D006 | 1/1 | 1/1 | 1/1 | 1/1 | 1/1 | 1/1 | 0 | 0 | consistent |
| D007 | 1/1 | 1/1 | 1/1 | 1/1 | 1/1 | 0/1 | 0 | 0 | consistent |
| D008 | 1/1 | 1/1 | 1/1 | 1/1 | 1/1 | 0/1 | 0 | driver cited RD-2 | consistent |
| DISP-002 | 1/1 | 1/1 | 1/1 | 1/1 | 1/1 | 0/1 | rider cited NS-1, rider cited NS-2, rider cited NS-3 | 0 | consistent |

- Rulings correct: 9/9
- AI rate: rider 100%, driver 100%, rider rebuttal 100%, driver rebuttal 100%, judge 56%
- Wrong-side citations: 3 across 18 advocate cases
- Other off-target citations (rule supports neither side): 4
- Consistent with the closest precedents: 8/9
