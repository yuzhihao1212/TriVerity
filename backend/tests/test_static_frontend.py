"""Serving the built frontend from the API (one service for the hosted demo).

With FRONTEND_DIST set, the API also serves the React build at "/", so the
frontend and API share one origin and need no CORS. The API routes still win.
"""

import pytest
from fastapi.testclient import TestClient

from app.core.config import settings
from app.main import create_app


@pytest.fixture
def dist(tmp_path):
    (tmp_path / "index.html").write_text("<!doctype html><title>TriVerity</title>", encoding="utf-8")
    (tmp_path / "assets").mkdir()
    (tmp_path / "assets" / "app.js").write_text("console.log('ok')", encoding="utf-8")
    return tmp_path


def test_frontend_served_when_configured(dist, monkeypatch):
    monkeypatch.setattr(settings, "frontend_dist", str(dist))
    client = TestClient(create_app())
    home = client.get("/")
    assert home.status_code == 200 and "TriVerity" in home.text
    assert client.get("/assets/app.js").status_code == 200


def test_api_routes_still_win(dist, monkeypatch):
    monkeypatch.setattr(settings, "frontend_dist", str(dist))
    client = TestClient(create_app())
    assert client.get("/health").status_code == 200
    samples = client.get("/api/disputes/samples")
    assert samples.status_code == 200 and isinstance(samples.json(), list)


def test_nothing_served_at_root_by_default():
    assert TestClient(create_app()).get("/").status_code == 404


def test_missing_dist_folder_is_ignored(tmp_path, monkeypatch):
    monkeypatch.setattr(settings, "frontend_dist", str(tmp_path / "does-not-exist"))
    assert TestClient(create_app()).get("/health").status_code == 200
