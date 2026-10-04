# Trust Engine (prototype core)

Hybrid trust checker for small businesses: deterministic rules + business-context matching -> evidence set -> Gemini explains.
The verdict (SAFE / VERIFY / STOP) is computed in code. Gemini only writes the explanation and cannot change it.

    pip install -r requirements.txt
    python -m pytest -q          # 9 tests, no cloud needed
    python demo.py               # cake-shop attack thread
    uvicorn app.main:app --reload

Enable Gemini (otherwise a deterministic template explains):

    export GOOGLE_CLOUD_PROJECT=<project>
    export GEMINI_MODEL=<current Flash model id from the Vertex AI model docs>   # verify; do not guess

Layout: app/schemas.py (contracts) - rules.py (layer 1) - context.py (layer 2) - evidence.py (layer 3 + verdict) - reasoner.py (layer 4) - main.py (API).
SAFE copy means "nothing unusual found against your records", never "genuine".
