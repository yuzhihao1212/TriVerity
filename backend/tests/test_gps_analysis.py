"""GPS telemetry and the source-grouping contract stay deterministic and bounded."""
from datetime import datetime, timedelta, timezone
from pathlib import Path

import pytest

from app.core import limits
from app.models.dispute import DisputeCase, TripData
from app.services.evidence import CaseFacts, ChatAnalysis, _haversine_m, compute_facts
from app.services.gps_analysis import GpsAnalysis, GpsStop, analyse_gps


def point(minute=0, lat=1.32, lng=103.85, speed=0, status='in_trip'):
    return dict(timestamp=(datetime(2026, 9, 20, 8, tzinfo=timezone(timedelta(hours=8)))
                           + timedelta(minutes=minute)).isoformat(),
                lat=lat, lng=lng, speed_kmh=speed, status=status)


def test_no_data_and_one_point():
    assert analyse_gps([], TripData()) is None
    result = analyse_gps([point()], TripData())
    assert result.points_used == 1
    assert result.path_distance_km is None
    assert result.unexpected_stops is None
    assert compute_facts(DisputeCase(dispute_id='X', type='route_deviation', rider_claim='')).gps is None


def test_path_sorted_duplicates_offsets_and_gap():
    points = [point(10, lat=1.34), point(0), point(1, lat=1.33), point(1, lat=1.33)]
    points[1]['timestamp'] = '2026-09-20T00:00:00Z'
    result = analyse_gps(points, TripData(expected_distance_km=2))
    expected = _haversine_m(1.32, 103.85, 1.34, 103.85) / 1000
    assert result.path_distance_km == pytest.approx(expected)
    assert result.path_vs_expected_ratio == pytest.approx(expected / 2)
    assert result.max_gap_min == 9
    assert (result.points_used, result.points_rejected) == (3, 1)
    assert result.unexpected_stops == []  # gaps aren't proof of a stop


@pytest.mark.parametrize('bad', [
    {}, None, [], {'lat': 1},
    point(lat=91), point(lat=-91), point(lng=181), point(lng=-181),
    point(lat=float('nan')), point(lng=float('inf')), point(speed=float('nan')),
    point(speed=-1), point(lat=True), point(lat={}),
    {**point(), 'timestamp': 'invalid'}, {**point(), 'timestamp': '2026-09-20'},
    {**point(), 'timestamp': 123}, {**point(), 'timestamp': 'x' * 100},
    {**point(), 'timestamp': '0001-01-01T00:00:00+12:00'},
])
def test_malformed_points_never_raise(bad):
    result = analyse_gps([bad], TripData())
    assert result.points_used == 0
    assert result.points_rejected == 1
    assert result.path_distance_km is None


def test_cap_and_unordered_input():
    points = [point(i / 60, lat=1.32+i*0.000001, speed=20)
              for i in range(limits.MAX_GPS_POINTS)]
    result = analyse_gps(list(reversed(points)) + [point(100)], TripData())
    assert result.points_used == limits.MAX_GPS_POINTS
    assert result.points_rejected == 1
    assert result.max_gap_min == pytest.approx(1 / 60)


@pytest.mark.parametrize('speed', [0, 3, None, 30])
def test_stop_speed_or_stationary_position(speed):
    points = [point(i, speed=speed) for i in range(7)]
    if speed is None:
        for p in points:
            p.pop('speed_kmh')
    result = analyse_gps(points, TripData())
    assert len(result.unexpected_stops) == 1
    assert result.unexpected_stops[0].duration_min == 6
    assert result.total_stopped_min == 6


def test_short_stop_and_sparse_stop_excluded():
    assert analyse_gps([point(0), point(2)], TripData()).unexpected_stops == []
    assert analyse_gps([point(0), point(9)], TripData()).unexpected_stops == []


@pytest.mark.parametrize('status', ['arrived', 'completed', 'dropoff', 'dropped_off'])
def test_arrival_and_dropoff_status_excluded(status):
    assert analyse_gps([point(i, status=status) for i in range(7)], TripData()).unexpected_stops == []


def test_pickup_and_inferred_dropoff_excluded():
    points = [point(i) for i in range(7)]
    trip = TripData(pickup_lat=1.3205, pickup_lng=103.85)
    assert analyse_gps(points, trip).unexpected_stops == []
    assert analyse_gps(points, TripData(), route_trip=True).unexpected_stops == []
    # A no-show's last position must not be treated as its drop-off.
    assert analyse_gps(points, TripData()).total_stopped_min == 6


def test_moving_trip_and_zero_expected_distance():
    result = analyse_gps([point(i, lat=1.32+i*.002, speed=25) for i in range(7)],
                         TripData(expected_distance_km=0))
    assert result.total_stopped_min == 0
    assert result.path_vs_expected_ratio is None


def test_naive_times_and_antipodal_distance():
    points = [point(), point(1, lat=-1.32, lng=-76.15)]
    for p in points:
        p['timestamp'] = p['timestamp'][:-6]
    assert analyse_gps(points, TripData()).max_gap_min == 1
    assert _haversine_m(0, 0, 0, 180) > 20_000_000


def test_every_description_line_and_source_contract():
    facts = CaseFacts(distance_excess_ratio=.43, duration_excess_ratio=.2, fare_difference=6.3,
                      driver_distance_from_pickup_m=378, driver_wait_min=6,
                      driver_contact_attempted=True, surge_multiplier=1.5, promo_code='RYDE10',
                      promo_discount=2, fare_breakdown_gap=0,
                      gps=GpsAnalysis(path_distance_km=14.6, path_vs_expected_ratio=1.43,
                                      points_used=37, points_rejected=2, max_gap_min=9,
                                      total_stopped_min=6, unexpected_stops=[GpsStop(
                                          start_time=point()['timestamp'], duration_min=6, lat=1.32, lng=103.85)]),
                      chat=ChatAnalysis(threats=['t'], agreements=['a'], disagreements=['d']),
                      rider_history={'account_age_days': 820, 'rating': 4.8, 'completed_trips': 214, 'disputes_last_90d': 0},
                      driver_history={'completed_trips': 12})
    groups = facts.describe_by_source()
    assert list(groups) == ['trip', 'gps', 'fare', 'chat', 'history']
    assert groups['trip'] == ['Route was +43% vs expected distance', 'Trip took +20% vs expected duration',
                              'Driver arrived 378 m from pickup point', 'Driver waited 6 min at pickup']
    assert groups['gps'] == ['GPS path 14.6 km over 37 points (+43% vs expected)',
                             'Unexpected stop: 6 min at 08:00', 'GPS unexpected stops total 6 min',
                             'GPS data gap of 9 min', 'GPS points rejected: 2']
    assert groups['fare'] == ['Fare was +6.30 vs expected fare', 'Surge pricing applied: x1.5',
                              'Promo code RYDE10 applied (2.00 off)', 'Fare breakdown matches the charged fare']
    assert groups['chat'] == ['Driver contacted rider via in-app chat', 'Threatening message: t',
                              'Agreement in chat: a', 'Disagreement in chat: d']
    assert groups['history'] == ['Rider history: account 820 days old, rating 4.8, 214 trips, 0 disputes in last 90 days',
                                 'Driver history: 12 trips']
    lines = facts.describe()
    assert lines == [line for group in groups.values() for line in group]
    assert len(lines) == len(set(lines))
    assert CaseFacts().describe_by_source() == {'chat': ['No driver contact attempt in chat log']}
    assert CaseFacts(gps=GpsAnalysis(points_used=0)).describe_by_source()['gps'] == ['GPS path unavailable (0 usable points)']
    assert CaseFacts(fare_breakdown_gap=1).describe_by_source()['fare'] == ['Charged fare is +1.00 vs the itemised breakdown']
    assert CaseFacts(promo_code='X').describe_by_source()['fare'] == ['Promo code X applied']


def test_synthetic_sample_consistency():
    root = Path(__file__).resolve().parents[2] / 'data' / 'disputes'
    cases = [DisputeCase.model_validate_json((root / name).read_text()) for name in
             ('route_deviation_001.json', 'route_deviation_003.json', 'no_show_002.json')]
    detour, faster, no_show = [compute_facts(case).gps for case in cases]
    assert detour.path_distance_km == pytest.approx(14.7, abs=.01)
    assert detour.total_stopped_min == 6
    assert len(detour.unexpected_stops) == 1
    assert faster.path_distance_km == pytest.approx(13, abs=.01)
    assert faster.unexpected_stops == []
    assert no_show.total_stopped_min == 6
    assert _haversine_m(cases[2].trip.pickup_lat, cases[2].trip.pickup_lng,
                        no_show.unexpected_stops[0].lat, no_show.unexpected_stops[0].lng) == pytest.approx(378, abs=1)
    for case in cases[:2]:
        points = case.gps_points
        duration = (datetime.fromisoformat(points[-1]['timestamp']) - datetime.fromisoformat(points[0]['timestamp'])).total_seconds()/60
        assert duration == case.trip.actual_duration_min


def test_stop_runs_end_at_movement_and_exclusions():
    points = [point(i) for i in range(4)]
    points += [point(4, lat=1.33, speed=30)]
    points += [point(i, lat=1.34) for i in range(5, 9)]
    points += [point(9, lat=1.34, status='arrived')]
    result = analyse_gps(points, TripData())
    assert [s.duration_min for s in result.unexpected_stops] == [3, 3]
    assert result.total_stopped_min == 6


def test_long_gap_splits_stationary_runs():
    result = analyse_gps([point(i) for i in (0, 1, 2, 3, 12, 13, 14, 15)], TripData())
    assert [s.duration_min for s in result.unexpected_stops] == [3, 3]
    assert result.max_gap_min == 9


def test_pickup_radius_boundary_and_unknown_status():
    points = [point(i, lat=1.321, status={'untrusted': True}) for i in range(4)]
    result = analyse_gps(points, TripData(pickup_lat=1.32, pickup_lng=103.85))
    assert result.total_stopped_min == 3  # 111 m is outside NS-1's tolerance


def test_conflicting_duplicate_keeps_first_valid_point():
    result = analyse_gps([point(0), point(0, lat=20), point(1)], TripData())
    assert result.path_distance_km == 0
    assert result.points_rejected == 1


METRES_PER_DEGREE_LAT = 111_195


def test_slow_traffic_is_not_an_unexpected_stop():
    # 25 minutes crawling at 2 km/h (about 33 m a minute, 830 m in total): traffic, not a stop.
    step = 2000 / 60 / METRES_PER_DEGREE_LAT
    points = [point(i, lat=1.30 + i * step, speed=2) for i in range(26)]
    result = analyse_gps(points, TripData())
    assert result.unexpected_stops == []
    assert result.total_stopped_min == 0


def test_stationary_stop_with_gps_drift_is_still_one_stop():
    # A parked car whose GPS wanders up to ~20 m stays one stop.
    jitter = [0, 15, -10, 20, -18, 5, 0]
    points = [point(i, lat=1.32 + j / METRES_PER_DEGREE_LAT, speed=0) for i, j in enumerate(jitter)]
    result = analyse_gps(points, TripData())
    assert len(result.unexpected_stops) == 1
    assert result.unexpected_stops[0].duration_min == 6


def test_stop_ends_when_the_vehicle_crawls_away():
    # Parked for 5 minutes, then crawling slowly away: only the parked part is a stop.
    step = 2000 / 60 / METRES_PER_DEGREE_LAT
    parked = [point(i, speed=0) for i in range(6)]
    crawl = [point(6 + i, lat=1.32 + (i + 1) * 2 * step, speed=2) for i in range(10)]
    result = analyse_gps(parked + crawl, TripData())
    assert len(result.unexpected_stops) == 1
    assert 5 <= result.unexpected_stops[0].duration_min <= 6


def test_one_usable_point_wording():
    facts = CaseFacts(gps=analyse_gps([point()], TripData()), chat=ChatAnalysis())
    assert "GPS path unavailable (1 usable point)" in facts.describe()


def test_no_show_wording_uses_observed_stop_location():
    case = DisputeCase(dispute_id='X', type='no_show_charge', rider_claim='',
                       trip={'pickup_lat': 1.3521, 'pickup_lng': 103.8198},
                       gps_points=[point(i, lat=1.3555, lng=103.8198) for i in range(7)])
    facts = compute_facts(case)
    lines = facts.describe_by_source()['gps']
    assert 'Driver stopped 6 min at 08:00, 378 m from the pickup point' in lines
    assert 'GPS observed stops total 6 min' in lines
    assert all('unexpected' not in line.lower() for line in lines)
    case.trip.pickup_lat = None
    assert 'Driver stopped 6 min at 08:00' in compute_facts(case).describe()
    assert all('from the pickup point' not in line for line in compute_facts(case).describe())


def test_route_stop_wording_is_unchanged():
    facts = CaseFacts(dispute_type='route_deviation', gps=GpsAnalysis(
        unexpected_stops=[GpsStop(start_time=point()['timestamp'], duration_min=6, lat=1.32, lng=103.85)],
        total_stopped_min=6, points_used=7))
    assert 'Unexpected stop: 6 min at 08:00' in facts.describe()
    assert 'GPS unexpected stops total 6 min' in facts.describe()
