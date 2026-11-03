# TriVerity model benchmark (2026-11-02 14:40 UTC)

Method as in the Hy4 preview vs Hy3 report: scripts/evaluate.py logic, 1 run(s) per sample, same prompts, token limits and output checks; only the model changes. An output counts as AI-written only when its source is the LLM.

| Metric | deepseek-local |
|---|---|
| Model ID | `deepseek-v2:16b` |
| Rulings correct | 9/9 |
| AI-written outputs (total) | 37/45 (82%) |
| Rider advocate | 9/9 |
| Driver advocate | 9/9 |
| Rider rebuttal | 9/9 |
| Driver rebuttal | 9/9 |
| Judge explanation | 1/9 |
| Wrong-side rule citations | 8 of 18 |
| Other off-target citations | 22 |
| Consistent with closest precedents | 8/9 |
| Errored runs | 0 |
| Wall-clock time (all samples) | 390.9 s |
| Time per dispute | 43.4 s |
| Tokens per dispute | 10,259 |
| Cost per dispute | $0.0000 |

## Why outputs fell back

**deepseek-local**: 
- Judge narration fell back to templates: tone: driver_explanation uses a verdict word such as 'unjustified'
- evidence_collector fell back: complete() raised HTTPStatusError (HTTP 500)
- Judge narration fell back to templates: promise: promises a refund the ruling does not give (rider_explanation)
- Judge narration fell back to templates: promise: promises a refund the ruling does not give (rider_explanation)
- Judge narration fell back to templates: wording: says the charge stands against the decision (rider_explanation)
- Judge narration fell back to templates: promise: promises a refund the ruling does not give (rider_explanation)
- Judge narration fell back to templates: ids: driver_explanation mentions a rule or evidence ID
- Judge narration fell back to templates: promise: promises a refund the ruling does not give (rider_explanation)
- Judge narration fell back to templates: promise: promises a refund the ruling does not give (rider_explanation)

## Per-sample detail

### deepseek-local (`deepseek-v2:16b`)

| Sample | Ruling correct | Rider AI | Driver AI | Rider rebuttal AI | Driver rebuttal AI | Judge AI | Wrong-side citations | Other off-target citations | Precedents |
|---|---|---|---|---|---|---|---|---|---|
| D001 | 1/1 | 1/1 | 1/1 | 1/1 | 1/1 | 0/1 | driver cited RD-3 | driver cited RD-2, rider cited RD-1 | consistent |
| D002 | 1/1 | 1/1 | 1/1 | 1/1 | 1/1 | 0/1 | driver cited NS-3, rider cited NS-1 | driver cited NS-2 | no_precedent |
| D003 | 1/1 | 1/1 | 1/1 | 1/1 | 1/1 | 1/1 | rider cited RD-1 | driver cited RD-2, driver cited RD-3, rider cited RD-2, rider cited RD-3 | consistent |
| D004 | 1/1 | 1/1 | 1/1 | 1/1 | 1/1 | 0/1 | 0 | driver cited RD-1, rider cited RD-3, rider cited RD-5 | consistent |
| D005 | 1/1 | 1/1 | 1/1 | 1/1 | 1/1 | 0/1 | rider cited NS-2 | 0 | consistent |
| D006 | 1/1 | 1/1 | 1/1 | 1/1 | 1/1 | 0/1 | rider cited NS-3 | 0 | consistent |
| D007 | 1/1 | 1/1 | 1/1 | 1/1 | 1/1 | 0/1 | 0 | driver cited RD-1, driver cited RD-2, driver cited RD-4, rider cited RD-1, rider cited RD-2, rider cited RD-4, rider cited RD-5 | consistent |
| D008 | 1/1 | 1/1 | 1/1 | 1/1 | 1/1 | 0/1 | 0 | driver cited RD-2, driver cited RD-4, rider cited RD-1, rider cited RD-2, rider cited RD-5 | consistent |
| DISP-002 | 1/1 | 1/1 | 1/1 | 1/1 | 1/1 | 0/1 | rider cited NS-1, rider cited NS-2 | 0 | consistent |

- Rulings correct: 9/9
- AI rate: rider 100%, driver 100%, rider rebuttal 100%, driver rebuttal 100%, judge 11%
- Wrong-side citations: 8 across 18 advocate cases
- Other off-target citations (rule supports neither side): 22
- Consistent with the closest precedents: 8/9
