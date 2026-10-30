"""Judge sandbox: in the public demo, appeals and reviewer decisions work with a judge code.

Each judge's appeals and precedents are tagged with their code's ID, so they affect only
that judge's own disputes. The public samples and other judges never see them (the
poisoning found in the review of #31 stays fixed). Without a code it stays off (403).
"""

import pytest
from fastapi.testclient import TestClient

from app.api.routes import disputes
from app.core import limits
from app.core.config import settings
from app.core.rate_limit import limiter
from app.main import create_app
from app.services import appeals, precedents
from app.services.sample_service import load_samples

D001 = {c.dispute_id: c for c in load_samples()}["D001"]
CODE_A = "judgeA-" + "a" * 24
CODE_B = "judgeB-" + "b" * 24
RESOLVE, FEEDBACK, APPEALS = "/api/disputes/resolve", "/api/precedents/feedback", "/api/appeals"


@pytest.fixture(autouse=True)
def demo(monkeypatch):
    monkeypatch.setattr(settings, "public_demo", True)
    monkeypatch.setattr(settings, "demo_access_codes", f"{CODE_A},{CODE_B}")
    for clear in (appeals.clear_appeals, precedents.clear_feedback, disputes._demo_cache.clear):
        clear()
    yield
    for clear in (appeals.clear_appeals, precedents.clear_feedback, disputes._demo_cache.clear):
        clear()


@pytest.fixture
def client():
    return TestClient(create_app())


def call(client, method, path, code=None, **kwargs):
    limiter.reset()   # rate limits are not under test here
    headers = {"X-Demo-Key": code} if code else {}
    return getattr(client, method)(path, headers=headers, **kwargs)


def own_copy(dispute_id="J-01"):
    """A judge's own dispute with D001's facts, so it matches D001's precedents."""
    return D001.model_copy(update={"dispute_id": dispute_id, "label": None}).model_dump()


def feedback(client, code, case, decision="no_action"):
    return call(client, "post", FEEDBACK, code, json={"case": case, "decision": decision, "note": "road works"})


def file_appeal(client, code, case=None, party="rider"):
    return call(client, "post", APPEALS, code, json={
        "case": case or own_copy(), "party": party, "reason": "The detour was for road works.",
        "original_decision": "partial_refund"})


# -- Still off without a code ------------------------------------------------------

def test_without_a_code_appeals_and_decisions_stay_off(client):
    for response in (file_appeal(client, None), call(client, "get", APPEALS),
                     call(client, "post", f"{APPEALS}/A-001/decision", json={"decision": "no_action"}),
                     feedback(client, None, own_copy())):
        assert response.status_code == 403
        assert "access code" in response.json()["detail"]


def test_a_wrong_code_is_rejected(client):
    assert file_appeal(client, "judgeX-" + "x" * 24).status_code == 401
    assert feedback(client, "judgeX-" + "x" * 24, own_copy()).status_code == 401


# -- Works with a code ------------------------------------------------------------

def test_a_judge_can_file_list_and_decide_an_appeal(client):
    filed = file_appeal(client, CODE_A)
    assert filed.status_code == 201
    appeal_id = filed.json()["id"]
    assert [a["id"] for a in call(client, "get", APPEALS, CODE_A).json()] == [appeal_id]
    decided = call(client, "post", f"{APPEALS}/{appeal_id}/decision", CODE_A,
                   json={"decision": "no_action", "note": "road works"})
    assert decided.status_code == 200
    assert decided.json()["status"] == "decided" and decided.json()["precedent_id"]


def test_a_judge_can_record_a_reviewer_decision(client):
    assert feedback(client, CODE_A, own_copy()).status_code == 201


# -- Isolation ---------------------------------------------------------------------

def test_judge_decisions_never_change_the_public_samples(client):
    for _ in range(2):
        assert feedback(client, CODE_A, own_copy()).status_code == 201
    disputes._demo_cache.clear()   # as after the cache window or a restart
    public = call(client, "post", RESOLVE, json=D001.model_dump()).json()
    assert public["decision"] == "partial_refund"
    assert not any(r.startswith("PREC-1") for r in public["policy_refs"])


def test_judge_decisions_affect_only_that_judges_own_disputes(client):
    for _ in range(2):
        feedback(client, CODE_A, own_copy())
    mine = call(client, "post", RESOLVE, CODE_A, json=own_copy("J-02")).json()
    theirs = call(client, "post", RESOLVE, CODE_B, json=own_copy("J-02")).json()
    assert mine["decision"] == "needs_review" and any(r.startswith("PREC-1") for r in mine["policy_refs"])
    assert theirs["decision"] == "partial_refund" and not any(r.startswith("PREC-1") for r in theirs["policy_refs"])


def test_judges_see_and_decide_only_their_own_appeals(client):
    appeal_id = file_appeal(client, CODE_A).json()["id"]
    assert call(client, "get", APPEALS, CODE_B).json() == []
    assert call(client, "post", f"{APPEALS}/{appeal_id}/decision", CODE_B,
                json={"decision": "no_action"}).status_code == 404
    # Two judges may both name a dispute J-01 and appeal it.
    assert file_appeal(client, CODE_B).status_code == 201


def test_each_code_has_its_own_cap(client, monkeypatch):
    monkeypatch.setattr(limits, "SANDBOX_MAX_PER_CODE", 1)
    assert feedback(client, CODE_A, own_copy()).status_code == 201
    assert feedback(client, CODE_A, own_copy()).status_code == 409
    assert feedback(client, CODE_B, own_copy()).status_code == 201   # another judge isn't blocked
    assert file_appeal(client, CODE_A).status_code == 201
    assert file_appeal(client, CODE_A, case=own_copy("J-09")).status_code == 409


def test_the_code_is_never_returned(client):
    filed = file_appeal(client, CODE_A)
    listed = call(client, "get", APPEALS, CODE_A)
    for response in (filed, listed, feedback(client, CODE_A, own_copy())):
        assert CODE_A not in response.text and "owner" not in response.text
