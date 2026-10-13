"""scripts/setup_demo_access.py, run against a temporary .env (never the real one)."""

import importlib.util
from pathlib import Path

import pytest

from app.core import limits

SCRIPT = Path(__file__).resolve().parents[2] / "scripts" / "setup_demo_access.py"


@pytest.fixture
def script(tmp_path, monkeypatch):
    spec = importlib.util.spec_from_file_location("setup_demo_access", SCRIPT)
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    env = tmp_path / ".env"
    env.write_text("LLM_API_KEY=keep-me-untouched\nLLM_MODEL=hy3\n")
    monkeypatch.setattr(module, "ENV_FILE", env)
    return module, env


def test_add_writes_strong_codes_and_keeps_other_lines(script, capsys):
    module, env = script
    module.cmd_add(["alice", "bob"])
    text = env.read_text()
    assert "LLM_API_KEY=keep-me-untouched" in text and "LLM_MODEL=hy3" in text
    codes = module.codes_of(module.read_env())
    assert [module.name_of(c) for c in codes] == ["alice", "bob"]
    assert all(len(c) >= limits.MIN_ACCESS_CODE_CHARS for c in codes)
    out = capsys.readouterr().out
    assert "keep-me-untouched" not in out  # never echoes other .env lines
    assert all(c in out for c in codes)


def test_list_shows_names_not_codes(script, capsys):
    module, _ = script
    module.cmd_add(["alice"])
    code = module.codes_of(module.read_env())[0]
    capsys.readouterr()
    module.cmd_list()
    out = capsys.readouterr().out
    assert "alice" in out and code not in out


def test_revoke_by_name(script):
    module, _ = script
    module.cmd_add(["alice", "bob"])
    module.cmd_revoke(["bob"], revoke_all=False)
    assert [module.name_of(c) for c in module.codes_of(module.read_env())] == ["alice"]
    module.cmd_revoke([], revoke_all=True)
    assert module.codes_of(module.read_env()) == []


def test_duplicate_name_refused(script):
    module, _ = script
    module.cmd_add(["alice"])
    with pytest.raises(SystemExit):
        module.cmd_add(["alice"])


def test_public_demo_toggle(script):
    module, _ = script
    module.cmd_public_demo("on")
    assert module.get_value(module.read_env(), "PUBLIC_DEMO") == "true"
    module.cmd_public_demo("off")
    assert module.get_value(module.read_env(), "PUBLIC_DEMO") == "false"


def test_codes_work_with_the_backend(script, monkeypatch):
    from app.core.access import verify_demo_code
    from app.core.config import settings

    module, _ = script
    module.cmd_add(["alice"])
    monkeypatch.setattr(settings, "demo_access_codes", module.get_value(module.read_env(), "DEMO_ACCESS_CODES"))
    assert verify_demo_code(module.codes_of(module.read_env())[0])
