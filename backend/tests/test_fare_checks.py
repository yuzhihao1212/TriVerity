"""Payment checks are arithmetic evidence, never policy rules."""
import pytest

from app.models.dispute import DisputeCase
from app.services.evidence import compute_facts


def facts(**fare):
    return compute_facts(DisputeCase(dispute_id='X', type='route_deviation', rider_claim='', fare=fare))


def line(label, amount):
    return {'label': label, 'amount': amount}


@pytest.mark.parametrize('fare, expected', [
    ({}, None),
    ({'actual': 10, 'promo_discount': 2, 'breakdown': [line('Base', 12)]}, None),
    ({'promo_code': 'RYDE10'}, None),  # no recorded discount: unknown, not "not reflected"
    ({'promo_code': 'RYDE10', 'promo_discount': 2}, None),
    ({'promo_code': 'RYDE10', 'promo_discount': 2, 'actual': 8}, None),
    ({'promo_code': 'RYDE10', 'promo_discount': 2, 'breakdown': [line('Base', 10)]}, None),
    ({'promo_code': 'RYDE10', 'promo_discount': 2, 'actual': 8, 'breakdown': [line('Base', 10)]}, True),
    ({'promo_code': 'RYDE10', 'promo_discount': 2, 'actual': 10, 'breakdown': [line('Base', 10)]}, False),
    ({'promo_code': 'RYDE10', 'promo_discount': 0, 'actual': 10, 'breakdown': [line('Base', 10)]}, True),
    ({'promo_code': 'RYDE10', 'promo_discount': 2, 'actual': 8.01, 'breakdown': [line('Base', 10)]}, True),
    ({'promo_code': 'RYDE10', 'promo_discount': 2, 'actual': 8.02, 'breakdown': [line('Base', 10)]}, False),
    ({'promo_code': 'RYDE10', 'promo_discount': 2, 'actual': 7, 'breakdown': [line('Base', 10), line('Adjustment', -1)]}, True),
])
def test_promo(fare, expected):
    assert facts(**fare).promo_applied_correctly is expected


@pytest.mark.parametrize('multiplier, breakdown, expected', [
    (None, [], None), (1, [line('Base', 10)], None), (1.5, [], None),
    (1.5, [line('Base', 10)], None),  # surge may be inside the base line: can't check
    (1.5, [line('Base', 10), line('Surge x1.5', 5)], True),
    (1.5, [line('Base', 10), line('Surge', 7)], False),
    (1.5, [line('Base', 10), line('SURGE', 2), line('Surge adjustment', 3)], True),
    (1.5, [line('Base', 10), line('Surge', -5)], False),
    (1.5, [line('Surge', 5)], None),
    (1.5, [line('Base', 0), line('Surge', 0)], None),
    (1.2, [line('Base', 3), line('Distance', 11.2), line('Time', 5.4), line('Surge x1.2', 3.8)], True),
    (1.5, [line('Base', 10), line('Surge', 5.25)], True),
    (1.5, [line('Base', 10), line('Surge', 5.26)], False),
    (1.1, [line('Base', 1), line('Surge', .12)], True),
    (1.1, [line('Base', 1), line('Surge', .13)], False),
    (1.5, [line('Base', 10), line('NotSurge', 5)], None),  # no surge line to check
])
def test_surge(multiplier, breakdown, expected):
    assert facts(surge_multiplier=multiplier, breakdown=breakdown).surge_consistent is expected


def test_checks_stay_independent_and_grouped_once():
    result = facts(actual=12, promo_code='ryde10', promo_discount=3, surge_multiplier=1.5,
                   breakdown=[line('Base', 10), line('Surge', 5)])
    assert result.promo_applied_correctly is True
    assert result.surge_consistent is True
    assert result.fare_breakdown_gap == 0
    lines = result.describe_by_source()['fare']
    assert lines == ['Surge pricing applied: x1.5', 'Promo code RYDE10 applied (3.00 off)',
                     'Fare breakdown matches the charged fare',
                     'Promo RYDE10 discount reflected in the charge',
                     'Surge breakdown consistent with the multiplier']
    assert all(result.describe().count(line) == 1 for line in lines)
    failed = facts(actual=15, promo_code='RYDE10', promo_discount=3, surge_multiplier=2,
                   breakdown=[line('Base', 10), line('Surge', 5)])
    assert 'Promo RYDE10 discount not reflected in the charge' in failed.describe_by_source()['fare']
    assert 'Surge breakdown inconsistent with the multiplier' in failed.describe_by_source()['fare']
    assert failed.promo_applied_correctly is False
    assert failed.surge_consistent is False
    assert 'fare' not in facts().describe_by_source()
