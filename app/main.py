from __future__ import annotations
from fastapi import FastAPI, HTTPException
from .context import load_profiles
from .evidence import analyze, decide_state
from .reasoner import explain
from .schemas import CheckRequest, TrustDecision

app = FastAPI(title="Trust Engine", version="0.1")
PROFILES = load_profiles()   # fixed allow-list of business ids: no user-controlled file paths

@app.get("/health")
def healthz(): return {"status": "ok", "profiles": list(PROFILES)}

@app.post("/v1/check", response_model=TrustDecision)
def check(req: CheckRequest) -> TrustDecision:
    prof = PROFILES.get(req.business_id)
    if prof is None: raise HTTPException(404, "Unknown business profile")
    es = analyze(req, prof)                 # layers 1-3 (deterministic + context + correlation)
    return explain(es, decide_state(es), req)   # layer 4 (Gemini explains; cannot change the verdict)
