"""RateLimiter costs: a rule can count several hits at once (a batch's cases per day)."""

from app.core.rate_limit import RateLimiter


class Clock:
    def __init__(self):
        self.now = 1000.0

    def __call__(self):
        return self.now


def test_cost_counts_several_hits_and_refuses_without_recording():
    clock = Clock()
    limiter = RateLimiter(clock)
    assert limiter.hit([("ip:a", 5, 60, 3)]) is None          # 3 of 5
    assert limiter.hit([("ip:a", 5, 60, 3)]) is not None      # 6 > 5: refused, nothing recorded
    assert limiter.hit([("ip:a", 5, 60, 2)]) is None          # exactly 5
    assert limiter.hit([("ip:a", 5, 60)]) is not None


def test_wait_is_until_enough_slots_free():
    clock = Clock()
    limiter = RateLimiter(clock)
    limiter.hit([("k", 3, 60)])
    clock.now += 10
    limiter.hit([("k", 3, 60)])
    clock.now += 10
    limiter.hit([("k", 3, 60)])
    # Two more need the two oldest hits (at 1000 and 1010) gone: wait until 1070.
    assert limiter.hit([("k", 3, 60, 2)]) == 1070 - clock.now


def test_a_cost_above_the_limit_waits_a_whole_window_and_mixed_rules_are_all_or_nothing():
    limiter = RateLimiter(Clock())
    assert limiter.hit([("k", 3, 60, 4)]) == 60
    assert limiter.hit([("minute", 1, 60), ("day", 10, 86400, 4)]) is None
    # The minute rule is full, so the day rule records nothing either.
    assert limiter.hit([("minute", 1, 60), ("day", 10, 86400, 4)]) is not None
    assert limiter.hit([("day", 10, 86400, 6)]) is None
