import base64, time
import pytest
from fastapi.testclient import TestClient
from app import extraction, main
from app.schemas import ImageFacts

client = TestClient(main.app)
PNG = base64.b64encode(b"\x89PNG\r\n\x1a\n" + b"0" * 20).decode()
IMG = {"kind": "image", "mime_type": "image/png", "image_b64": PNG}
def check(thread, biz="demo_bakery"): return client.post("/v1/check", json={"business_id": biz, "thread": thread})
def rules_of(d): return {e["rule_id"] for e in d["evidence"]}

@pytest.fixture(autouse=True)
def _reset(monkeypatch):
    monkeypatch.setenv("RATE_LIMIT_PER_MIN", "1000"); main._hits.clear()
    monkeypatch.delenv("GEMINI_MODEL", raising=False)

def test_ai_status_when_gemini_is_off():
    d = check([{"kind": "message", "text": "URGENT: pay the release fee within 2 hours or your order is cancelled."}]).json()
    assert d["ai_status"] == {"extraction": "skipped", "analyst": "off", "explanation": "off"}
    safe = check([{"kind": "message", "text": "Hi, can I order a birthday cake for Saturday please?"}]).json()
    assert safe["state"] == "SAFE" and safe["ai_status"]["explanation"] == "skipped"

def test_image_with_gemini_off_gets_its_own_rule_not_unreadable():
    d = check([IMG]).json()
    assert d["state"] == "VERIFY" and "IMAGE_NOT_CHECKED" in rules_of(d) and "IMAGE_UNREADABLE" not in rules_of(d)
    assert d["ai_status"]["extraction"] == "off"

def test_image_timeout_is_reported_as_timeout_and_unreadable(monkeypatch):
    monkeypatch.setattr(extraction, "MODEL", "m"); monkeypatch.setenv("GOOGLE_CLOUD_PROJECT", "p"); monkeypatch.setenv("EXTRACT_TIMEOUT_S", "0.2")
    monkeypatch.setattr(extraction, "_extract_image", lambda raw, mime: (time.sleep(1.5), None)[1])
    d = check([IMG]).json()
    assert d["ai_status"]["extraction"] == "timeout" and "IMAGE_UNREADABLE" in rules_of(d) and d["state"] == "VERIFY"

def test_image_ok_status(monkeypatch):
    monkeypatch.setattr(extraction, "MODEL", "m"); monkeypatch.setenv("GOOGLE_CLOUD_PROJECT", "p")
    monkeypatch.setattr(extraction, "_extract_image", lambda raw, mime: ImageFacts(image_type="chat_screenshot", legible=True, visible_text="Hi, can I collect my cake at 5pm tomorrow?"))
    d = check([IMG]).json()
    assert d["ai_status"]["extraction"] == "ok" and d["state"] == "SAFE"

def test_too_many_images_has_message_and_position(monkeypatch):
    monkeypatch.setenv("MAX_IMAGES", "3")
    r = check([IMG] * 5)
    assert r.status_code == 422
    detail = r.json()["detail"]
    assert "up to 3 images" in detail["message"] and detail["position"] == 3

def test_bad_image_error_names_its_position():
    bad = {"kind": "image", "mime_type": "image/png", "image_b64": base64.b64encode(b"MZ not an image").decode()}
    r = check([{"kind": "message", "text": "hello there"}, bad])
    assert r.status_code == 422 and r.json()["detail"]["position"] == 1 and "match" in r.json()["detail"]["message"]

def test_images_are_read_in_parallel(monkeypatch):
    def slow(raw, mime):
        time.sleep(0.4)
        return ImageFacts(image_type="chat_screenshot", legible=True, visible_text="Hi, can I collect my cake at 5pm tomorrow?")
    monkeypatch.setattr(extraction, "extract_image", slow)
    t0 = time.time(); d = check([IMG] * 3).json()
    assert time.time() - t0 < 1.0 and len(d["image_reads"]) == 3        # one after another would take 1.2s

def test_rate_limit_sends_retry_after(monkeypatch):
    monkeypatch.setenv("RATE_LIMIT_PER_MIN", "1"); main._hits.clear()
    body = [{"kind": "message", "text": "hello there"}]
    assert check(body).status_code == 200
    r = check(body)
    assert r.status_code == 429 and 1 <= int(r.headers["retry-after"]) <= 61

def test_second_demo_profile_matches_the_designs():
    d = client.get("/v1/business/demo_shop").json()
    assert [s["name"] for s in d["suppliers"]] == ["ABC Flour", "Cake Box Supply"]
    assert d["suppliers"][0]["typical_amount_min"] == 8000 and d["suppliers"][0]["accounts"][0]["last4"] == "8231"
    ok = check([{"kind": "message", "text": "Invoice for this month, Rs 18,000, same account as usual 100200308231.", "channel": "email",
                 "sender": "accounts@abcflour.example", "claimed_entity": "ABC Flour"}], biz="demo_shop").json()
    assert ok["state"] == "SAFE" and ok["positives"]
    bad = check([{"kind": "message", "text": "Our bank changed, please urgently pay Rs 18,000 to account 555566667777.", "channel": "email",
                  "sender": "accounts@abcflour.example", "claimed_entity": "ABC Flour"}], biz="demo_shop").json()
    assert bad["state"] != "SAFE" and "CTX_NEW_ACCOUNT" in rules_of(bad)

def test_headline_wording_for_verify():
    d = check([{"kind": "message", "text": "URGENT: pay the release fee within 2 hours or your order is cancelled."}]).json()
    assert d["headline"] == "Check before you act"
