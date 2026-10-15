"""GPS path against the planned (optimal) route: offsets, episodes, facts and limits."""

import pytest
from pydantic import ValidationError

from app.core import limits
from app.models.dispute import DisputeCase, TripData
from app.services.evidence import compute_facts
from app.services.gps_analysis import _offset_m, analyse_gps
from app.services.orchestrator import resolve_dispute
from app.services.sample_service import load_samples

SAMPLES = {c.dispute_id: c for c in load_samples()}
EAST_WEST = [(1.30, 103.80), (1.30, 103.90)]   # a straight planned route along a parallel


def track(*lats: float) -> list[dict]:
    """GPS points one minute apart, moving east, at the given latitudes."""
    return [{"lat": lat, "lng": 103.81 + i * 0.01, "timestamp": f"2026-09-20T08:{i:02d}:00+08:00", "speed_kmh": 30}
            for i, lat in enumerate(lats)]


def route(points=EAST_WEST) -> TripData:
    return TripData(planned_route=[{"lat": a, "lng": b} for a, b in points])


def test_offset_is_the_distance_to_the_nearest_segment():
    assert _offset_m(1.30, 103.85, EAST_WEST) == pytest.approx(0, abs=0.01)
    assert _offset_m(1.309, 103.85, EAST_WEST) == pytest.approx(995, rel=0.01)    # 0.009° north ≈ 995 m
    assert _offset_m(1.30, 103.95, EAST_WEST) == pytest.approx(5_565, rel=0.01)   # past the end: to the endpoint


def test_off_route_runs_become_episodes_with_their_distance():
    # on, off, off, on, off: two episodes; the 1.302 point is 221 m away, beyond the 150 m threshold.
    result = analyse_gps(track(1.300, 1.302, 1.303, 1.3001, 1.302), route()).route_comparison
    assert (result.points_checked, result.points_on_route) == (5, 2)
    assert [(e.start_time.minute, e.end_time.minute) for e in result.episodes] == [(1, 2), (4, 4)]
    assert result.off_route_km == pytest.approx(sum(e.distance_km for e in result.episodes), abs=0.01)
    assert result.max_offset_m == pytest.approx(332, rel=0.02)


def test_no_planned_route_or_a_single_point_means_no_comparison():
    assert analyse_gps(track(1.30, 1.31), TripData()).route_comparison is None
    assert analyse_gps(track(1.30, 1.31), route([(1.30, 103.80)])).route_comparison is None


def test_planned_route_is_validated_and_capped():
    with pytest.raises(ValidationError):
        TripData(planned_route=[{"lat": 91, "lng": 103.8}, {"lat": 1.3, "lng": 103.9}])
    with pytest.raises(ValidationError):
        TripData(planned_route=[{"lat": 1.3, "lng": 103.8}] * (limits.MAX_PLANNED_ROUTE_POINTS + 1))


def test_samples_report_the_detour_and_keep_their_rulings():
    gps = compute_facts(SAMPLES["D001"]).describe_by_source()["gps"]
    assert "GPS within 150 m of the planned route for 8 of 36 points" in gps
    assert "Off the planned route 08:05-08:32: 11.3 km driven, up to 2,704 m away" in gps
    assert resolve_dispute(SAMPLES["D001"]).decision == "partial_refund"
    # D004 left the planned route for the expressway but arrived sooner: RD-2, no refund.
    d004 = resolve_dispute(SAMPLES["D004"])
    assert (d004.decision, [r.split(":")[0] for r in d004.policy_refs]) == ("no_action", ["RD-2"])


def test_only_summaries_reach_the_facts_never_coordinates():
    facts = " ".join(compute_facts(SAMPLES["D001"]).describe())
    assert "103.8" not in facts and "1.30" not in facts


def test_many_episodes_are_summarised():
    lats = [1.300 if i % 2 == 0 else 1.303 for i in range(2 * limits.GPS_MAX_OFF_ROUTE_EPISODES + 3)]
    case = DisputeCase(dispute_id="X-1", type="route_deviation", rider_claim="x",
                       trip={"planned_route": [{"lat": a, "lng": b} for a, b in EAST_WEST]}, gps_points=track(*lats))
    gps = compute_facts(case).describe_by_source()["gps"]
    assert sum(line.startswith("Off the planned route 08:") for line in gps) == limits.GPS_MAX_OFF_ROUTE_EPISODES
    assert any(line.startswith(f"Off the planned route {limits.GPS_MAX_OFF_ROUTE_EPISODES + 1} times") for line in gps)
