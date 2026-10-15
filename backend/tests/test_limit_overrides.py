"""Budget and rate limits can be raised from backend/.env, within safe bounds."""

import importlib
import logging

import pytest

from app.core import limits
from app.core.config import Settings, settings


@pytest.fixture
def reload_limits(monkeypatch):
    """Re-evaluate limits.py under patched settings, then restore the defaults."""
    def apply(**overrides):
        for name, value in overrides.items():
            monkeypatch.setattr(settings, name, value)
        return importlib.reload(limits)
    yield apply
    monkeypatch.undo()
    importlib.reload(limits)


def test_defaults_without_overrides(reload_limits):
    # Clear any overrides in the developer's own backend/.env first.
    reloaded = reload_limits(**{name.lower(): None for name in limits._OVERRIDABLE})
    assert reloaded.DAILY_TOKEN_BUDGET == 300_000
    assert reloaded.DAILY_RESOLVE_BUDGET == 75
    assert reloaded.PER_IP_PER_MINUTE == 3
    assert reloaded.GLOBAL_PER_MINUTE == 10


def test_env_overrides_raise_the_budget(reload_limits):
    # Start from no overrides, so the developer's own backend/.env can't change the result.
    cleared = {name.lower(): None for name in limits._OVERRIDABLE}
    reloaded = reload_limits(**{**cleared, "daily_token_budget": 2_000_000, "daily_resolve_budget": 500,
                                "per_ip_per_day": 200})
    assert reloaded.DAILY_TOKEN_BUDGET == 2_000_000
    assert reloaded.DAILY_RESOLVE_BUDGET == 500
    assert reloaded.PER_IP_PER_DAY == 200
    assert reloaded.PER_IP_PER_MINUTE == 3  # untouched values keep their default


def test_override_is_used_by_the_budget(reload_limits):
    from app.services.budget import budget
    reload_limits(daily_token_budget=10)
    budget.add_tokens(10)
    assert budget.exhausted()


def test_overrides_are_logged(reload_limits, caplog):
    with caplog.at_level(logging.WARNING, logger="app.core.limits"):
        reload_limits(daily_token_budget=2_000_000)
    assert "DAILY_TOKEN_BUDGET=2000000" in caplog.text


def test_settings_read_overrides_from_env(monkeypatch):
    monkeypatch.setenv("DAILY_TOKEN_BUDGET", "1000000")
    monkeypatch.setenv("PER_CODE_PER_DAY", "50")
    loaded = Settings(_env_file=None)
    assert loaded.daily_token_budget == 1_000_000
    assert loaded.per_code_per_day == 50


@pytest.mark.parametrize(("name", "value"), [
    ("daily_token_budget", -1),
    ("daily_resolve_budget", -1),
    ("per_ip_per_minute", 0),
    ("per_ip_per_day", 0),
    ("per_code_per_minute", 0),
    ("per_code_per_day", 0),
    ("global_per_minute", 11),   # never above 10 per minute (provider allows 60 requests)
    ("global_per_minute", 0),
])
def test_unsafe_overrides_rejected(reload_limits, name, value):
    # Checked when limits.py loads, so a bad .env value stops the backend at start-up.
    with pytest.raises(ValueError, match=name.upper()):
        reload_limits(**{name: value})
