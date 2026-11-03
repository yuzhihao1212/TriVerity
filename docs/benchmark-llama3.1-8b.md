# TriVerity model benchmark (2026-11-02 14:33 UTC)

Method as in the Hy4 preview vs Hy3 report: scripts/evaluate.py logic, 1 run(s) per sample, same prompts, token limits and output checks; only the model changes. An output counts as AI-written only when its source is the LLM.

| Metric | llama-local |
|---|---|
| Model ID | `llama3.1:8b` |
| Rulings correct | 9/9 |
| AI-written outputs (total) | 38/45 (84%) |
| Rider advocate | 9/9 |
| Driver advocate | 9/9 |
| Rider rebuttal | 8/9 |
| Driver rebuttal | 9/9 |
| Judge explanation | 3/9 |
| Wrong-side rule citations | 9 of 18 |
| Other off-target citations | 7 |
| Consistent with closest precedents | 8/9 |
| Errored runs | 0 |
| Wall-clock time (all samples) | 898.1 s |
| Time per dispute | 99.8 s |
| Tokens per dispute | 11,386 |
| Cost per dispute | $0.0000 |

## Why outputs fell back

**llama-local**: 
- Judge narration fell back to templates: ids: driver_explanation mentions a rule or evidence ID
- Judge narration fell back to templates: amount: mentions an amount not in the case
- Judge narration fell back to templates: amount: mentions an amount not in the case
- Judge narration fell back to templates: amount: mentions an amount not in the case
- Judge narration fell back to templates: promise: promises a refund the ruling does not give (rider_explanation)
- rider_rebuttal fell back: type: empty rebuttal
- Judge narration fell back to templates: length: explanation over 1200 characters

## Per-sample detail

### llama-local (`llama3.1:8b`)

| Sample | Ruling correct | Rider AI | Driver AI | Rider rebuttal AI | Driver rebuttal AI | Judge AI | Wrong-side citations | Other off-target citations | Precedents |
|---|---|---|---|---|---|---|---|---|---|
| D001 | 1/1 | 1/1 | 1/1 | 1/1 | 1/1 | 0/1 | 0 | 0 | consistent |
| D002 | 1/1 | 1/1 | 1/1 | 1/1 | 1/1 | 1/1 | rider cited NS-1 | 0 | no_precedent |
| D003 | 1/1 | 1/1 | 1/1 | 1/1 | 1/1 | 1/1 | rider cited RD-1 | rider cited RD-2, rider cited RD-3, rider cited RD-4 | consistent |
| D004 | 1/1 | 1/1 | 1/1 | 1/1 | 1/1 | 0/1 | 0 | driver cited RD-1, rider cited RD-3 | consistent |
| D005 | 1/1 | 1/1 | 1/1 | 1/1 | 1/1 | 1/1 | driver cited NS-1, rider cited NS-2 | 0 | consistent |
| D006 | 1/1 | 1/1 | 1/1 | 1/1 | 1/1 | 0/1 | rider cited NS-1, rider cited NS-2 | 0 | consistent |
| D007 | 1/1 | 1/1 | 1/1 | 1/1 | 1/1 | 0/1 | 0 | driver cited RD-2 | consistent |
| D008 | 1/1 | 1/1 | 1/1 | 1/1 | 1/1 | 0/1 | 0 | driver cited RD-1 | consistent |
| DISP-002 | 1/1 | 1/1 | 1/1 | 0/1 | 1/1 | 0/1 | rider cited NS-1, rider cited NS-2, rider cited NS-3 | 0 | consistent |

- Rulings correct: 9/9
- AI rate: rider 100%, driver 100%, rider rebuttal 89%, driver rebuttal 100%, judge 33%
- Wrong-side citations: 9 across 18 advocate cases
- Other off-target citations (rule supports neither side): 7
- Consistent with the closest precedents: 8/9
