"""Recorded engine checks; all sample rulings are frozen from before instrumentation."""
import copy
import json
from pathlib import Path

import pytest

from app.agents import judge_agent
from app.agents.judge_narration import _user_prompt
from app.main import create_app
from app.models.resolution import PartyResolution, Resolution, Ruling
from app.services import precedents as store
from app.services.evidence import compute_facts
from app.services.orchestrator import resolve_dispute
from app.services.policy_service import load_policy
from app.services.sample_service import load_samples

SAMPLES = {case.dispute_id: case for case in load_samples()}
BEFORE = json.loads((Path(__file__).parent / 'fixtures/rulings_before_conditions.json').read_text())


@pytest.fixture(autouse=True)
def fresh_feedback():
    store.clear_feedback()
    yield
    store.clear_feedback()


@pytest.mark.parametrize('dispute_id', sorted(SAMPLES))
def test_all_nine_rulings_unchanged_byte_for_byte(dispute_id):
    # Every original Ruling field, not merely decision and amount. Texts are compared
    # verbatim, and list order (including policy_refs) is significant.
    result = resolve_dispute(SAMPLES[dispute_id]).model_dump(mode='json')
    original_fields = set(Ruling.model_fields) - {'conditions', 'min_confidence'}
    assert len(SAMPLES) == len(BEFORE) == 9
    actual = {key: result[key] for key in original_fields}
    assert json.dumps(actual, sort_keys=True) == json.dumps(BEFORE[dispute_id], sort_keys=True)


def checks(result):
    return {check.rule: check for check in result.conditions}


def test_d001_refund_records_unmet_stop_and_existing_fact_ids():
    result = resolve_dispute(SAMPLES['D001'])
    by_rule = checks(result)
    assert result.decision == 'partial_refund'
    assert by_rule['RD-3'].met is True
    assert by_rule['RD-3'].value == '+44% vs planned distance; +59% vs planned duration'
    assert by_rule['RD-1'].met is False
    assert by_rule['RD-3'].fact_ids == ['TRIP-1', 'TRIP-2']
    assert by_rule['RD-5'].met is False
    assert by_rule['RD-5'].value == '6 min'
    assert by_rule['RD-5'].fact_ids == ['GPS-4']
    assert [c.rule for c in result.conditions][-4:] == ['SAFE-1', 'FRAUD-1', 'PREC-1', 'ESC-1']
    assert all(not by_rule[rule].met for rule in ('SAFE-1', 'FRAUD-1', 'PREC-1', 'ESC-1'))
    assert result.min_confidence == load_policy()['escalation']['thresholds']['min_confidence']
    for condition in result.conditions:
        assert set(condition.fact_ids) <= set(result.judge_evidence_ids)


def test_d006_no_show_records_pickup_wait_and_contact():
    result = resolve_dispute(SAMPLES['D006'])
    by_rule = checks(result)
    assert result.decision == 'no_action'
    assert all(by_rule[rule].met for rule in ('NS-1', 'NS-2', 'NS-3', 'NS-4'))
    assert by_rule['NS-2'].value == '7 min'
    assert by_rule['NS-3'].fact_ids == ['CHAT-1']
    assert not by_rule['SAFE-1'].met


def test_d007_safety_escalation_keeps_base_checks_and_skips_confidence_comparison():
    result = resolve_dispute(SAMPLES['D007'])
    by_rule = checks(result)
    assert result.decision == 'needs_review'
    assert by_rule['SAFE-1'].met
    assert by_rule['SAFE-1'].fact_ids
    index = dict(zip(result.judge_evidence_ids, result.judge_evidence))
    assert all(index[id].startswith('Threatening message: ') for id in by_rule['SAFE-1'].fact_ids)
    assert 'RD-3' in by_rule
    assert not by_rule['ESC-1'].met
    assert 'skipped' in by_rule['ESC-1'].value


def test_early_returns_and_missing_data_do_not_claim_later_checks_ran():
    case = SAMPLES['D001']
    facts = compute_facts(case).model_copy(update={'distance_excess_ratio': None})
    result = judge_agent.base_ruling(case, facts)
    assert [c.rule for c in result.conditions] == ['RD-4']
    assert not result.conditions[0].met
    assert result.conditions[0].fact_ids == []
    no_show = SAMPLES['D006']
    facts = compute_facts(no_show).model_copy(update={'driver_distance_from_pickup_m': 250})
    result = judge_agent.base_ruling(no_show, facts)
    assert [c.rule for c in result.conditions] == ['NS-1']
    assert result.conditions[0].met is False
    assert result.decision == 'full_refund'
    facts = facts.model_copy(update={'driver_distance_from_pickup_m': None})
    result = judge_agent.base_ruling(no_show, facts)
    assert [c.rule for c in result.conditions] == ['NS-1', 'NS-4']
    assert result.decision == 'needs_review'
    assert not any(c.met for c in result.conditions)


def test_route_branches_record_only_the_rules_reached():
    case = SAMPLES['D001']
    facts = compute_facts(case).model_copy(update={'distance_excess_ratio': 0.1})
    result = judge_agent.base_ruling(case, facts)
    assert result.decision == 'no_action'
    assert checks(result)['RD-1'].met
    assert 'RD-2' not in checks(result) and 'RD-5' not in checks(result)
    facts = facts.model_copy(update={'distance_excess_ratio': 0.4, 'duration_excess_ratio': -0.1})
    result = judge_agent.base_ruling(case, facts)
    assert result.decision == 'no_action' and checks(result)['RD-2'].met
    assert 'RD-3' not in checks(result) and 'RD-5' not in checks(result)
    facts = facts.model_copy(update={'duration_excess_ratio': None})
    result = judge_agent.base_ruling(case, facts)
    assert result.decision == 'partial_refund' and result.confidence == 0.65
    assert checks(result)['RD-3'].met
    assert 'duration unavailable' in checks(result)['RD-3'].value


def test_threshold_labels_and_response_follow_policy(monkeypatch):
    policy = copy.deepcopy(load_policy())
    policy['route_deviation']['thresholds'].update(max_distance_excess_ratio=0.2,
                                                   min_compensation_stop_min=8, compensation_credit=3)
    policy['escalation']['thresholds']['min_confidence'] = 0.77
    monkeypatch.setattr(judge_agent, 'load_policy', lambda: policy)
    result = resolve_dispute(SAMPLES['D001'])
    assert '20%' in checks(result)['RD-3'].label
    assert '8 min' in checks(result)['RD-5'].label
    assert '$3.00' in checks(result)['RD-5'].label
    assert '77%' in checks(result)['ESC-1'].label
    assert result.min_confidence == 0.77
    policy['no_show_charge']['thresholds'].update(max_pickup_distance_m=80, min_wait_min=6)
    result = judge_agent.base_ruling(SAMPLES['D006'], compute_facts(SAMPLES['D006']))
    assert '80 m' in checks(result)['NS-1'].label
    assert '6 min' in checks(result)['NS-2'].label


def test_metadata_is_optional_in_models_and_openapi_and_stays_internal():
    old = Ruling.model_validate(BEFORE['D001'])
    assert old.conditions is None and old.min_confidence is None
    schema = create_app().openapi()['components']['schemas']
    assert 'RulingCondition' in schema
    assert {'conditions', 'min_confidence'} <= schema['Resolution']['properties'].keys()
    assert not {'conditions', 'min_confidence'} & set(schema['Resolution']['required'])
    result = resolve_dispute(SAMPLES['D001'])
    assert Resolution.model_validate(result.model_dump()).conditions == result.conditions
    for party in ('rider', 'driver'):
        assert not {'conditions', 'min_confidence'} & PartyResolution.of(result, 'D001', party).model_dump().keys()
    prompt = json.loads(_user_prompt(SAMPLES['D001'], result, result.rider_case, result.driver_case))
    assert not {'conditions', 'min_confidence'} & prompt['ruling'].keys()


def test_positive_overlays_and_low_confidence_record_before_escalating():
    from app.models.resolution import RiskAssessment
    ruling = Ruling.model_validate(BEFORE['D001'])
    result = judge_agent._apply_fraud(ruling, RiskAssessment(driver_risk='high'), load_policy()['fraud'])
    assert checks(result)['FRAUD-1'].met and result.decision == 'needs_review'
    result = judge_agent._apply_precedent(ruling, ['R-001', 'R-002'], load_policy()['precedent'])
    assert checks(result)['PREC-1'].met and result.decision == 'needs_review'
    assert checks(result)['PREC-1'].fact_ids == []  # Precedent IDs aren't evidence IDs.
    assert checks(result)['PREC-1'].value == 'R-001, R-002'
    ruling = ruling.model_copy(update={'confidence': 0.5})
    result = judge_agent._apply_escalation(ruling, load_policy()['escalation'])
    assert checks(result)['ESC-1'].met and result.decision == 'needs_review'
