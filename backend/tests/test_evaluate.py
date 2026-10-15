"""The eval harness (scripts/evaluate.py) scores offline runs correctly. No real LLM."""
import importlib.util
from pathlib import Path

from app.models.resolution import AgentCase, Resolution

SCRIPT = Path(__file__).resolve().parents[2] / "scripts" / "evaluate.py"
spec = importlib.util.spec_from_file_location("evaluate", SCRIPT)
evaluate = importlib.util.module_from_spec(spec)
spec.loader.exec_module(evaluate)

def test_every_sample_has_an_expected_ruling_and_matches_it():
    results = evaluate.evaluate(None, runs=1)
    assert results, "no samples loaded"
    for dispute_id, rows in results.items():
        assert rows[0].get("ruling_ok"), (dispute_id, rows[0])
        # Offline, every agent falls back and the fallback advocates cite no rules.
        assert rows[0]["source"] == {"rider": "fallback", "driver": "fallback", "judge": "fallback"}
        assert not rows[0]["wrong_side"] and not rows[0]["neither_side"]

def test_labels_only_name_rules_in_the_policy():
    from app.services.policy_service import load_policy
    known = {rule for section in load_policy().values() if isinstance(section, dict)
             for rule in section.get("rules", {})}
    for dispute_id, label in evaluate.load_expected().items():
        named = set(label["policy_refs"]) | set(label["supports"]["rider"]) | set(label["supports"]["driver"])
        assert named <= known, (dispute_id, named - known)

def test_citations_are_classified_by_side():
    expected = evaluate.load_expected()["D005"]  # rider: NS-1; driver: NS-2, NS-3
    result = Resolution(
        decision="full_refund", recommended_action="Refund the no-show fee of $4.00.",
        refund_amount=4.0, confidence=0.85, explanation="", explanation_source="llm",
        policy_refs=["NS-1: text"],
        rider_case=AgentCase(agent="rider", summary="", source="llm", policy_refs=["NS-1: t", "NS-3: t"]),
        driver_case=AgentCase(agent="driver", summary="", source="llm", policy_refs=["NS-2: t", "NS-4: t"]),
    )
    row = evaluate.score(result, expected)
    assert row["ruling_ok"]
    assert row["wrong_side"] == ["rider cited NS-3"]
    assert row["neither_side"] == ["driver cited NS-4"]
    assert row["source"]["judge"] == "llm"

def test_wrong_refund_fails_the_ruling():
    expected = evaluate.load_expected()["D001"]
    result = Resolution(
        decision="partial_refund", recommended_action="", refund_amount=5.0, confidence=0.8,
        explanation="", policy_refs=["RD-3: t"],
        rider_case=AgentCase(agent="rider", summary=""), driver_case=AgentCase(agent="driver", summary=""),
    )
    row = evaluate.score(result, expected)
    assert row["decision_ok"] and row["rules_ok"] and not row["refund_ok"] and not row["ruling_ok"]
