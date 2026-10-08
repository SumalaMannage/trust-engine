from __future__ import annotations
from fastapi import FastAPI, HTTPException
from . import extraction
from .context import load_profiles
from .evidence import analyze, decide_state
from .reasoner import explain
from . import analyst, rules
from .schemas import CheckRequest, ImageInput, ImageRead, TrustDecision

app = FastAPI(title="Trust Engine", version="0.1")
PROFILES = load_profiles()   # fixed allow-list of business ids: no user-controlled file paths

@app.get("/healthz")
def healthz(): return {"status": "ok", "profiles": list(PROFILES)}

@app.post("/v1/check", response_model=TrustDecision)
def check(req: CheckRequest) -> TrustDecision:
    prof = PROFILES.get(req.business_id)
    if prof is None: raise HTTPException(404, "Unknown business profile")
    images = {}                             # step 0: Gemini READS images into facts (or None if unreadable)
    for i, item in enumerate(req.thread):
        if isinstance(item, ImageInput):
            try:
                raw = extraction.decode_and_validate(item.image_b64, item.mime_type)
            except ValueError as e:
                raise HTTPException(422, str(e))
            images[i] = extraction.extract_image(raw, item.mime_type)
    findings = analyst.run(analyst.build_sources(req, images))   # Gemini analyst: adds capped, quote-verified evidence only
    es = analyze(req, prof, images, findings)         # layers 1-3 (deterministic + context + correlation)
    d = explain(es, decide_state(es), req)  # layer 4 (Gemini explains; cannot change the verdict)
    d.image_reads = [ImageRead(index=i, image_type=f.image_type, legible=f.legible, reference_id=f.reference_id, amount=f.amount,
                               currency=f.currency, date=f.date, requests_made=f.requests_made, urgency_cues=f.urgency_cues,
                               warning_signs=f.warning_signs, text_excerpt=rules.redact(f.visible_text or "")[:300])
                     for i, f in images.items() if f is not None]
    return d
