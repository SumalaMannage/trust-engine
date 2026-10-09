from __future__ import annotations
import os, re, time
from collections import defaultdict, deque
from pathlib import Path
try:  # load the Gemini SDK when the container starts, so the first request does not pay for the import
    import google.genai.types  # noqa: F401
except Exception:
    pass
from fastapi import FastAPI, HTTPException, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles
from . import analyst, extraction, rules
from .context import load_profiles
from .evidence import analyze, decide_state
from .reasoner import explain
from .schemas import (BusinessProfile, BusinessView, CheckRequest, ImageInput, ImageRead, MaskedAccount, SupplierView, TrustDecision)

app = FastAPI(title="Trust Engine", version="0.2")
PROFILES = load_profiles()   # fixed allow-list of business ids: no user-controlled file paths

# Browser origins allowed to call the API from another address (local UI development only). Empty in production.
_origins = [o.strip() for o in os.getenv("ALLOWED_ORIGINS", "").split(",") if o.strip()]
if _origins:
    app.add_middleware(CORSMiddleware, allow_origins=_origins, allow_methods=["GET", "POST"], allow_headers=["Content-Type"])

_hits: dict[str, deque] = defaultdict(deque)
def rate_limit(request: Request) -> None:
    """Simple per-client limit (per instance). RATE_LIMIT_PER_MIN, default 60. Cloud Run puts the client in X-Forwarded-For."""
    limit = int(os.getenv("RATE_LIMIT_PER_MIN", "60"))
    ip = (request.headers.get("x-forwarded-for", "").split(",")[0].strip() or (request.client.host if request.client else "?"))
    now, q = time.time(), _hits[ip]
    while q and now - q[0] > 60: q.popleft()
    if len(q) >= limit: raise HTTPException(429, "Too many checks. Please wait a minute and try again.")
    q.append(now)

@app.get("/health")
@app.get("/healthz")   # note: Cloud Run's front end can intercept /healthz, so use /health
def health():
    model, project = os.getenv("GEMINI_MODEL"), os.getenv("GOOGLE_CLOUD_PROJECT")
    return {"status": "ok", "profiles": list(PROFILES),
            "gemini": {"enabled": bool(model and project), "model": model, "location": os.getenv("GOOGLE_CLOUD_LOCATION"),
                       "thinking_budget": os.getenv("GEMINI_THINKING_BUDGET"), "thinking_level": os.getenv("GEMINI_THINKING_LEVEL")}}   # settings only, no secrets

def _mask_view(p: BusinessProfile) -> BusinessView:
    sup = [SupplierView(id=s.id, name=s.name, aliases=s.aliases, known_domains=s.known_domains,
                        phone_hints=["ends " + re.sub(r"\D", "", ph)[-4:] for ph in s.known_phones],
                        accounts=[MaskedAccount(bank=a.bank, last4=re.sub(r"\D", "", a.number)[-4:], payments_made=a.payments_made, first_used=a.first_used) for a in s.accounts],
                        typical_amount_min=s.typical_amount_min, typical_amount_max=s.typical_amount_max,
                        usual_channels=s.usual_channels, relationship_since=s.relationship_since) for s in p.suppliers]
    return BusinessView(business_id=p.business_id, name=p.name, currency=p.currency, owner_approval_threshold=p.owner_approval_threshold,
                        approved_tools=p.approved_tools, suppliers=sup, trusted_brand_names=[b.name for b in p.trusted_brands])

@app.get("/v1/business/{business_id}", response_model=BusinessView)
def business(business_id: str) -> BusinessView:
    """Read-only profile for the UI. Raw bank and phone numbers never leave the server."""
    prof = PROFILES.get(business_id)
    if prof is None: raise HTTPException(404, "Unknown business profile")
    return _mask_view(prof)

@app.post("/v1/check", response_model=TrustDecision)
def check(req: CheckRequest, request: Request) -> TrustDecision:
    rate_limit(request)
    prof = PROFILES.get(req.business_id)
    if prof is None: raise HTTPException(404, "Unknown business profile")
    t0 = time.perf_counter()
    images = {}                             # step 0: Gemini READS images into facts (or None if unreadable)
    for i, item in enumerate(req.thread):
        if isinstance(item, ImageInput):
            try:
                raw = extraction.decode_and_validate(item.image_b64, item.mime_type)
            except ValueError as e:
                raise HTTPException(422, str(e))
            images[i] = extraction.extract_image(raw, item.mime_type)
    t1 = time.perf_counter()
    findings = analyst.run(analyst.build_sources(req, images))   # Gemini analyst: adds capped, quote-verified evidence only
    t2 = time.perf_counter()
    es = analyze(req, prof, images, findings)         # layers 1-3 (deterministic + context + correlation)
    d = explain(es, decide_state(es), req)  # layer 4 (Gemini explains; cannot change the verdict)
    t3 = time.perf_counter()
    print(f"timing extract={t1-t0:.1f}s analyst={t2-t1:.1f}s explain={t3-t2:.1f}s total={t3-t0:.1f}s", flush=True)   # numbers only, no content
    d.image_reads = [ImageRead(index=i, image_type=f.image_type, legible=f.legible, reference_id=f.reference_id, amount=f.amount,
                               currency=f.currency, date=f.date, requests_made=f.requests_made, urgency_cues=f.urgency_cues,
                               warning_signs=f.warning_signs, text_excerpt=rules.redact(f.visible_text or "")[:300])
                     for i, f in images.items() if f is not None]
    return d

def mount_web(application: FastAPI, directory: Path) -> bool:
    """Serve the built Next.js export at /. Must run AFTER all API routes are registered, so /v1/* and /docs still win."""
    if directory.is_dir():
        application.mount("/", StaticFiles(directory=directory, html=True), name="web")
        return True
    return False

mount_web(app, Path(__file__).resolve().parent.parent / "web" / "out")
