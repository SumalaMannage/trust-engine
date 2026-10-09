import json
from pathlib import Path
from fastapi.testclient import TestClient
from app import main

client = TestClient(main.app)

def test_business_view_masks_numbers():
    r = client.get("/v1/business/demo_bakery")
    assert r.status_code == 200
    body = r.text
    assert "100200308231" not in body and "0771234567" not in body
    d = r.json()
    assert d["suppliers"][0]["accounts"][0]["last4"] == "8231" and d["suppliers"][0]["phone_hints"] == ["ends 4567"]

def test_unknown_business_is_404_and_health_alias():
    assert client.get("/v1/business/../../etc").status_code in (404, 405)
    assert client.get("/v1/business/nope").status_code == 404
    assert client.get("/health").json()["status"] == "ok"

def test_openapi_schema_is_available_for_type_generation():
    r = client.get("/openapi.json")
    assert r.status_code == 200
    paths = r.json()["paths"]
    assert "/v1/check" in paths and "/v1/business/{business_id}" in paths

def test_rate_limit(monkeypatch):
    monkeypatch.setenv("RATE_LIMIT_PER_MIN", "3")
    main._hits.clear()
    body = {"business_id": "demo_bakery", "thread": [{"kind": "message", "text": "hello there"}]}
    codes = [client.post("/v1/check", json=body, headers={"x-forwarded-for": "9.9.9.9"}).status_code for _ in range(5)]
    assert codes[:3] == [200, 200, 200] and codes[3:] == [429, 429]
    main._hits.clear()

def test_static_site_is_served_but_never_shadows_the_api(tmp_path, monkeypatch):
    monkeypatch.setenv("RATE_LIMIT_PER_MIN", "1000")
    (tmp_path / "index.html").write_text("<html>trust engine ui</html>")
    before = len(main.app.router.routes)
    assert main.mount_web(main.app, tmp_path) is True
    try:
        assert "trust engine ui" in client.get("/").text
        assert client.get("/health").json()["status"] == "ok"
        r = client.post("/v1/check", json={"business_id": "demo_bakery", "thread": [{"kind": "message", "text": "hello"}]})
        assert r.status_code == 200 and r.json()["state"] == "SAFE"
    finally:
        del main.app.router.routes[before:]
    assert main.mount_web(main.app, tmp_path / "missing") is False

def test_cors_only_for_listed_origin():
    from fastapi import FastAPI
    from fastapi.middleware.cors import CORSMiddleware
    a = FastAPI(); a.add_middleware(CORSMiddleware, allow_origins=["http://localhost:3000"], allow_methods=["POST"], allow_headers=["Content-Type"])
    @a.post("/x")
    def x(): return {}
    c = TestClient(a)
    ok = c.options("/x", headers={"Origin": "http://localhost:3000", "Access-Control-Request-Method": "POST"})
    bad = c.options("/x", headers={"Origin": "http://evil.example", "Access-Control-Request-Method": "POST"})
    assert ok.headers.get("access-control-allow-origin") == "http://localhost:3000"
    assert "access-control-allow-origin" not in bad.headers

def test_health_reports_gemini_settings_without_secrets(monkeypatch):
    monkeypatch.setenv("GEMINI_MODEL", "gemini-test"); monkeypatch.setenv("GOOGLE_CLOUD_PROJECT", "p1")
    g = client.get("/health").json()["gemini"]
    assert g["enabled"] is True and g["model"] == "gemini-test"
    monkeypatch.delenv("GEMINI_MODEL")
    assert client.get("/health").json()["gemini"]["enabled"] is False
