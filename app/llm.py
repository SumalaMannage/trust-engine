"""Shared Gemini helpers: thinking level, client with a hard HTTP timeout, and a wall-clock deadline for every call.
Rule: a slow or failing Gemini must never make a check hang. On timeout the caller falls back (rules only / template text)."""
import concurrent.futures, os

_pool = concurrent.futures.ThreadPoolExecutor(max_workers=16)

def thinking_kwargs() -> dict:
    """GEMINI_THINKING_BUDGET = token budget for Gemini 2.5 models (0 turns thinking off on 2.5 Flash).
    GEMINI_THINKING_LEVEL = LOW, MEDIUM or HIGH for Gemini 3.x only (older models reject it). Use one, not both."""
    budget = os.getenv("GEMINI_THINKING_BUDGET", "").strip()
    if budget.lstrip("-").isdigit():
        from google.genai import types
        return {"thinking_config": types.ThinkingConfig(thinking_budget=int(budget))}
    lvl = os.getenv("GEMINI_THINKING_LEVEL", "").strip().upper()
    if not lvl: return {}
    from google.genai import types
    level = getattr(types.ThinkingLevel, lvl, None)
    return {"thinking_config": types.ThinkingConfig(thinking_level=level)} if level is not None else {}

def client():
    from google import genai
    from google.genai import types
    kw = dict(vertexai=True, project=os.environ["GOOGLE_CLOUD_PROJECT"], location=os.getenv("GOOGLE_CLOUD_LOCATION", "us-central1"))
    try:   # per-request HTTP timeout in milliseconds, so abandoned calls do not pile up
        return genai.Client(**kw, http_options=types.HttpOptions(timeout=int(float(os.getenv("GEMINI_HTTP_TIMEOUT_S", "25")) * 1000)))
    except Exception:
        return genai.Client(**kw)

def run_with_deadline(fn, env_name: str, default_s: float, label: str):
    """Run fn() but give up after the deadline (seconds, overridable by env var). Returns None on timeout or error."""
    limit = float(os.getenv(env_name, default_s))
    fut = _pool.submit(fn)
    try:
        return fut.result(timeout=limit)
    except concurrent.futures.TimeoutError:
        print(f"gemini_timeout: {label} gave up after {limit}s", flush=True)
    except Exception as e:
        print(f"gemini_error: {label}: {type(e).__name__}: {str(e)[:200]}", flush=True)
    return None
