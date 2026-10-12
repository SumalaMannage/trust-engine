"""Shared Gemini helpers: thinking level, client with a hard HTTP timeout, and a wall-clock deadline for every call.
Rule: a slow or failing Gemini must never make a check hang. On timeout the caller falls back (rules only / template text)."""
import concurrent.futures, contextvars, os

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

_ORDER = {"skipped": 0, "ok": 1, "off": 2, "timeout": 3, "error": 4}
_status: contextvars.ContextVar = contextvars.ContextVar("ai_status", default=None)

def start_status() -> dict:
    d = {"extraction": "skipped", "analyst": "skipped", "explanation": "skipped"}
    _status.set(d)
    return d

def mark(step: str, value: str) -> None:
    """Record how a Gemini step went for the current request. The worst outcome wins (error > timeout > off > ok)."""
    d = _status.get()
    if d is not None and _ORDER[value] > _ORDER[d[step]]: d[step] = value

def run_with_deadline(fn, env_name: str, default_s: float, label: str, step: str | None = None):
    """Run fn() but give up after the deadline (seconds, overridable by env var). Returns None on timeout or error."""
    limit = float(os.getenv(env_name, default_s))
    fut = _pool.submit(fn)
    try:
        out = fut.result(timeout=limit)
        if step: mark(step, "ok" if out is not None else "error")
        return out
    except concurrent.futures.TimeoutError:
        print(f"gemini_timeout: {label} gave up after {limit}s", flush=True)
        if step: mark(step, "timeout")
    except Exception as e:
        print(f"gemini_error: {label}: {type(e).__name__}: {str(e)[:200]}", flush=True)
        if step: mark(step, "error")
    return None
