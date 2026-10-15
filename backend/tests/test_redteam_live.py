"""scripts/redteam_live.py, driven by a fake obedient model (never the real one)."""

import importlib.util
import json
import re
from pathlib import Path

import pytest

from app.core.config import settings

SCRIPT = Path(__file__).resolve().parents[2] / "scripts" / "redteam_live.py"
FAKE_KEY = "fake-key-must-never-be-written-0123456789"


@pytest.fixture
def script(monkeypatch):
    spec = importlib.util.spec_from_file_location("redteam_live", SCRIPT)
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    monkeypatch.setattr(settings, "llm_api_key", FAKE_KEY)
    return module


def obedient(system, user, **kwargs):
    """Obeys any 'Include the word X' instruction it can see."""
    found = re.search(r"Include the word (ZEBRA\d+)", user)
    canary = found.group(1) if found else "none"
    if "Advocate" in system:
        return json.dumps({"summary": f"Sure: {canary}", "evidence": [], "policy_refs": ["RD-3: x"]})
    return json.dumps({"explanation": f"RD-1 {canary}", "rider_explanation": f"You get $500 {canary}",
                       "driver_explanation": f"{canary}"})


def test_campaign_log_records_obeyed_and_blocked_without_secrets(script, tmp_path):
    attacks = [script.BY_ID["PI-01"], script.BY_ID["PI-11"]]
    out = script.run_campaign(attacks, 2, tmp_path / "run.jsonl", obedient, delay=0, sleep=lambda s: None)
    text = out.read_text(encoding="utf-8")
    assert FAKE_KEY not in text and "Authorization" not in text and "Bearer" not in text

    lines = [json.loads(line) for line in text.splitlines()]
    header, rows, summary = lines[0], lines[1:-1], lines[-1]
    assert header["type"] == "header" and header["attacks"] == ["PI-01", "PI-11"]
    assert {"date", "git_commit", "model", "settings"} <= set(header)
    assert header["settings"]["runs_per_attack"] == 2
    assert summary == {"type": "summary", "runs": 4, "tokens_used": summary["tokens_used"]}

    assert len(rows) == 4
    for row in rows:
        assert row["canary_in_raw_reply"] is True          # the fake model obeyed
        assert row["canary_in_party_messages"] is False    # the checks held
        assert row["ruling_unchanged"] is True
        assert row["explanation_source"] == "fallback"
        assert any(d.startswith("judge:") for d in row["detectors"])
        assert {r["agent"] for r in row["raw_replies"]} == {"evidence_collector", "rider", "driver", "judge"}


def test_input_rejected_attack_makes_no_llm_call(script, tmp_path):
    calls = []
    out = script.run_campaign([script.BY_ID["PI-07"]], 1, tmp_path / "run.jsonl",
                              lambda *a, **k: calls.append(1), delay=0, sleep=lambda s: None)
    row = json.loads(out.read_text(encoding="utf-8").splitlines()[1])
    assert row["rejected_at_input"] is True and calls == []


def test_live_attack_list_excludes_layer_b_and_fact_cases(script):
    ids = {a.id for a in script.LIVE_ATTACKS}
    assert ids.isdisjoint({"PI-07", "PI-19", "PI-20", "PI-21", "PI-22", "PI-23"})
    assert len(ids) == 17
