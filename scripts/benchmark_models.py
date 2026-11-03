"""Run scripts/evaluate.py once per model and print one comparison table.

Same method as the Hy4 preview vs Hy3 report (15 Oct 2026): same code, same nine
samples, same prompts, token limits and output checks; only the model changes.
Per model it records rulings, AI-written outputs per agent, wrong-side citations,
precedent consistency, wall-clock time, tokens and the logged fallback reasons.

Local models run through Ollama (http://localhost:11434) and need no key; pull them first:
    ollama pull qwen3:8b && ollama pull deepseek-v2:16b && ollama pull llama3.1:8b
Cloud keys come from the environment (never from this file):
    TOKENHUB_API_KEY    Hy3 baseline on Tencent Cloud TokenHub
    OPENROUTER_API_KEY  Qwen3, DeepSeek and Llama via OpenRouter (OpenAI-compatible)
Override a model ID with <LABEL>_MODEL (dashes as _), e.g. QWEN3_LOCAL_MODEL=qwen3.5:9b.
Models whose key is missing are skipped (an offline run would only measure the fallbacks).

Usage (from the repo root, with the backend venv active):
    python scripts/benchmark_models.py > docs/model-benchmark.md
    python scripts/benchmark_models.py --only qwen3,deepseek --runs 3
"""
import argparse
import logging
import os
import sys
import time
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
import evaluate  # noqa: E402  (also puts backend/ on sys.path)

import httpx  # noqa: E402
from app.core import limits  # noqa: E402

from app.core.config import settings  # noqa: E402
from app.services import llm_client  # noqa: E402
from app.services.budget import budget  # noqa: E402

TOKENHUB = "https://tokenhub-intl.tencentcloudmaas.com/v1"
OPENROUTER = "https://openrouter.ai/api/v1"
OLLAMA = "http://localhost:11434/v1"
NO_THINK = {"reasoning_effort": "none"}  # Ollama's switch for thinking off

# label, default model ID, base URL, key env var (None = local, no key), disable thinking,
# extra request fields, $ per 1M (input, output) or None.
# ponytail: prices are only filled where we know them; add OpenRouter's listed price to get cost.
MODELS = [
    ("hy3", "hy3", TOKENHUB, "TOKENHUB_API_KEY", True, {}, (0.132, 0.528)),
    # Local on this machine, thinking off to match Hy3 with LLM_DISABLE_THINKING=true. Free to run.
    ("qwen3-local", "qwen3:8b", OLLAMA, None, False, NO_THINK, (0, 0)),
    ("deepseek-local", "deepseek-v2:16b", OLLAMA, None, False, NO_THINK, (0, 0)),
    ("llama-local", "llama3.1:8b", OLLAMA, None, False, NO_THINK, (0, 0)),
    # Full-size versions via OpenRouter, non-thinking (instruct) variants.
    ("qwen3", "qwen/qwen3-235b-a22b-2507", OPENROUTER, "OPENROUTER_API_KEY", False, {}, None),
    ("deepseek", "deepseek/deepseek-chat-v3.1", OPENROUTER, "OPENROUTER_API_KEY", False, {}, None),
    ("llama", "meta-llama/llama-3.3-70b-instruct", OPENROUTER, "OPENROUTER_API_KEY", False, {}, None),
]
AGENT_NAMES = {"rider": "Rider advocate", "driver": "Driver advocate", "rider_rebuttal": "Rider rebuttal",
               "driver_rebuttal": "Driver rebuttal", "judge": "Judge explanation"}


class FallbackLog(logging.Handler):
    """Collects the agents' 'fell back' warnings, the reasons the report quotes."""

    def __init__(self):
        super().__init__(logging.WARNING)
        self.reasons: list[str] = []

    def emit(self, record):
        msg = record.getMessage()
        if "fell back" in msg:
            self.reasons.append(msg)


usage = {"in": 0, "out": 0}
_real_tokens_used = llm_client._tokens_used


def _count_usage(data, system, user, reply):
    u = data.get("usage") or {}
    usage["in"] += u.get("prompt_tokens") or 0
    usage["out"] += u.get("completion_tokens") or 0
    return _real_tokens_used(data, system, user, reply)


llm_client._tokens_used = _count_usage

# llm_client has no hook for provider-specific fields, so add them on the way out.
extra_fields: dict = {}
_real_post = httpx.Client.post


def _post(self, url, **kwargs):
    if "json" in kwargs:
        kwargs["json"] = {**kwargs["json"], **extra_fields}
    return _real_post(self, url, **kwargs)


httpx.Client.post = _post


def bench(label, model, base_url, key, no_thinking, extra, price, ids, runs) -> dict:
    settings.llm_model, settings.llm_base_url, settings.llm_api_key = model, base_url, key
    settings.llm_disable_thinking = no_thinking
    extra_fields.clear()
    extra_fields.update(extra)
    if base_url == OLLAMA:
        # ponytail: 25 s suits cloud APIs; a laptop GPU writes long replies slower. Load the model untimed.
        limits.LLM_TIMEOUT_S = 180
        llm_client.complete("Reply with JSON.", '{"ping": 1}', max_tokens=8)
    budget.reset()
    usage.update(dict.fromkeys(usage, 0))
    log = FallbackLog()
    logging.getLogger().addHandler(log)
    print(f"== {label} ({model})", file=sys.stderr)
    start = time.monotonic()
    try:
        results = evaluate.evaluate(ids, runs)
    finally:
        logging.getLogger().removeHandler(log)
    seconds = time.monotonic() - start
    rows = [r for rs in results.values() for r in rs]
    ok = [r for r in rows if "error" not in r]
    n = len(rows)
    cost = None
    if price and usage["in"] + usage["out"]:
        cost = (usage["in"] * price[0] + usage["out"] * price[1]) / 1e6 / n
    return {
        "label": label, "model": model, "n": n, "errors": n - len(ok),
        "rulings": sum(r["ruling_ok"] for r in ok),
        "ai": {a: sum(r["source"].get(a) == "llm" for r in ok) for a in AGENT_NAMES},
        "wrong_side": sum(len(r["wrong_side"]) for r in ok),
        "neither": sum(len(r["neither_side"]) for r in ok),
        "precedents": sum(r.get("precedents") == "consistent" for r in ok),
        "seconds": seconds, "tokens": budget.tokens_used, "cost": cost,
        "reasons": log.reasons, "detail": evaluate.report(results, runs),
    }


def table(res: list[dict]) -> str:
    def row(name, cell):
        return f"| {name} | " + " | ".join(cell(r) for r in res) + " |"

    def frac(k, d):
        return f"{k}/{d} ({k / d:.0%})" if d else "-"

    lines = [
        "| Metric | " + " | ".join(r["label"] for r in res) + " |",
        "|---|" + "---|" * len(res),
        row("Model ID", lambda r: f"`{r['model']}`"),
        row("Rulings correct", lambda r: f"{r['rulings']}/{r['n']}"),
        row("AI-written outputs (total)", lambda r: frac(sum(r["ai"].values()), 5 * r["n"])),
    ]
    lines += [row(name, lambda r, a=a: f"{r['ai'][a]}/{r['n']}") for a, name in AGENT_NAMES.items()]
    lines += [
        row("Wrong-side rule citations", lambda r: f"{r['wrong_side']} of {2 * r['n']}"),
        row("Other off-target citations", lambda r: str(r["neither"])),
        row("Consistent with closest precedents", lambda r: f"{r['precedents']}/{r['n']}"),
        row("Errored runs", lambda r: str(r["errors"])),
        row("Wall-clock time (all samples)", lambda r: f"{r['seconds']:.1f} s"),
        row("Time per dispute", lambda r: f"{r['seconds'] / r['n']:.1f} s"),
        row("Tokens per dispute", lambda r: f"{r['tokens'] / r['n']:,.0f}"),
        row("Cost per dispute", lambda r: f"${r['cost']:.4f}" if r["cost"] is not None else "not priced"),
    ]
    return "\n".join(lines)


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    parser.add_argument("--runs", type=int, default=1, help="runs per sample (default 1, as in the Hy4 report)")
    parser.add_argument("--ids", help="comma-separated dispute IDs (default: all samples)")
    parser.add_argument("--only", help="comma-separated labels: " + ",".join(m[0] for m in MODELS))
    args = parser.parse_args()
    only = set(args.only.split(",")) if args.only else None
    ids = args.ids.split(",") if args.ids else None
    logging.basicConfig(level=logging.ERROR)  # keep stderr to progress lines; the handler still sees warnings
    logging.getLogger().setLevel(logging.WARNING)

    results = []
    for label, model, base_url, key_env, no_thinking, extra, price in MODELS:
        if only and label not in only:
            continue
        key = os.environ.get(key_env, "") if key_env else "local"
        if not key:
            print(f"skip {label}: {key_env} not set", file=sys.stderr)
            continue
        model = os.environ.get(f"{label.upper().replace('-', '_')}_MODEL", model)
        results.append(bench(label, model, base_url, key, no_thinking, extra, price, ids, args.runs))
    if not results:
        raise SystemExit("No model ran: check --only.")

    out = [
        f"# TriVerity model benchmark ({time.strftime('%Y-%m-%d %H:%M UTC', time.gmtime())})",
        "",
        f"Method as in the Hy4 preview vs Hy3 report: scripts/evaluate.py logic, {args.runs} run(s) per sample, "
        "same prompts, token limits and output checks; only the model changes. "
        "An output counts as AI-written only when its source is the LLM.",
        "",
        table(results),
        "",
        "## Why outputs fell back",
    ]
    for r in results:
        out.append(f"\n**{r['label']}**: " + ("none" if not r["reasons"] else ""))
        out += [f"- {reason}" for reason in r["reasons"]]
    out.append("\n## Per-sample detail")
    for r in results:
        out += ["", f"### {r['label']} (`{r['model']}`)", "", r["detail"].split("\n", 2)[2]]
    print("\n".join(out))


if __name__ == "__main__":
    main()
