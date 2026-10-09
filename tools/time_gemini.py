"""Run in Cloud Shell: python3 tools/time_gemini.py
Times a tiny Gemini request WITHOUT our app, so we can tell if Gemini itself is slow.
Needs: pip install google-genai   and   gcloud config set project YOUR_PROJECT_ID"""
import os, subprocess, sys, time
from google import genai
from google.genai import types
project = os.getenv("GOOGLE_CLOUD_PROJECT") or subprocess.run(["gcloud", "config", "get-value", "project"], capture_output=True, text=True).stdout.strip()
tests = [("gemini-3.8-flash", "global", None), ("gemini-3.8-flash", "global", "LOW"), ("gemini-3.8-flash", "us-central1", "LOW"), ("gemini-2.5-flash", "us-central1", None)]
for model, loc, lvl in tests:
    cfg = types.GenerateContentConfig(temperature=0, **({"thinking_config": types.ThinkingConfig(thinking_level=getattr(types.ThinkingLevel, lvl))} if lvl else {}))
    t = time.time()
    try:
        c = genai.Client(vertexai=True, project=project, location=loc, http_options=types.HttpOptions(timeout=60000))
        r = c.models.generate_content(model=model, contents="Reply with the single word: ok", config=cfg)
        print(f"{model:18} {loc:12} thinking={lvl or 'default':8} {time.time()-t:5.1f}s  -> {(r.text or '').strip()[:20]}", flush=True)
    except Exception as e:
        print(f"{model:18} {loc:12} thinking={lvl or 'default':8} {time.time()-t:5.1f}s  ERROR {type(e).__name__}: {str(e)[:110]}", flush=True)
