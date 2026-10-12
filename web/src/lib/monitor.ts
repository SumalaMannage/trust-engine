import { API_BASE, BUSINESS_ID } from "@/lib/config";
import type { AIStatus, TrustDecision } from "@/lib/api/types";

/*
 * Internal health checks for /status. Each probe calls the backend directly (no shared client) so a
 * failure is reported as it happened: network, CORS, HTTP status, or a wrong-looking body.
 */

export type ProbeState = "ok" | "warn" | "fail" | "idle" | "running";

export interface ProbeResult {
  state: ProbeState;
  summary: string;
  detail?: string;
  ms?: number;
  at?: string;
}

export interface Target {
  id: string;
  label: string;
  base: string;          // "" = same origin as this page
}

export const DEPLOYED_API = "https://trust-engine-865854861902.asia-southeast1.run.app";

export function presetTargets(): Target[] {
  const list: Target[] = [
    { id: "configured", label: `This app's API (${API_BASE || "same origin"})`, base: API_BASE },
    { id: "local", label: "Local backend (localhost:8000)", base: "http://localhost:8000" },
    { id: "cloud", label: "Cloud Run (asia-southeast1)", base: DEPLOYED_API },
  ];
  // Hide duplicates when the configured API is one of the presets.
  return list.filter((t, i) => list.findIndex((o) => o.base === t.base) === i);
}

interface Health {
  status: string;
  profiles: string[];
  gemini?: { enabled: boolean; model?: string | null; location?: string | null };
}

async function timed<T>(fn: () => Promise<T>): Promise<{ value: T; ms: number }> {
  const t0 = performance.now();
  const value = await fn();
  return { value, ms: Math.round(performance.now() - t0) };
}

function networkHint(base: string): string {
  const origin = typeof window === "undefined" ? "this page" : window.location.origin;
  return base && !base.startsWith(origin)
    ? `The request never got a response. Either the backend is down, or it is up but blocks requests from ${origin} (CORS). Fix: set ALLOWED_ORIGINS=${origin} on the backend.`
    : "The request never got a response. The backend may be down or unreachable.";
}

async function get(base: string, path: string, timeoutMs = 15_000): Promise<Response> {
  return fetch(`${base}${path}`, { signal: AbortSignal.timeout(timeoutMs), cache: "no-store" });
}

function now(): string {
  return new Date().toLocaleTimeString();
}

// ---------- quick probes (cheap: no Gemini, safe to repeat) ----------

export async function probeHealth(base: string): Promise<{ result: ProbeResult; health?: Health }> {
  try {
    const { value: res, ms } = await timed(() => get(base, "/health"));
    if (!res.ok) return { result: { state: "fail", summary: `HTTP ${res.status} from /health`, ms, at: now() } };
    const health = (await res.json()) as Health;
    const ok = health.status === "ok";
    return {
      health,
      result: { state: ok ? "ok" : "warn", summary: ok ? "Backend is up" : `Backend says "${health.status}"`, detail: `Profiles: ${health.profiles.join(", ") || "none"}`, ms, at: now() },
    };
  } catch (e) {
    const timeout = e instanceof DOMException && e.name === "TimeoutError";
    return { result: { state: "fail", summary: timeout ? "No answer within 15 s" : "Could not reach the backend", detail: timeout ? "Cloud Run may be starting up (cold start). Try again." : networkHint(base), at: now() } };
  }
}

export function geminiFromHealth(health?: Health): ProbeResult {
  if (!health) return { state: "idle", summary: "Waiting for the backend" };
  const g = health.gemini;
  if (!g) return { state: "warn", summary: "Backend does not report Gemini settings", detail: "Older backend version." };
  return g.enabled
    ? { state: "ok", summary: `Configured: ${g.model}`, detail: `Region: ${g.location ?? "default"}. Configured is not the same as working: run the full check to call it.`, at: now() }
    : { state: "warn", summary: "Switched off on this backend", detail: "GOOGLE_CLOUD_PROJECT and GEMINI_MODEL are not set. Text checks still work with safety rules; images are not read and explanations use the template.", at: now() };
}

export async function probeProfile(base: string, health?: Health): Promise<ProbeResult> {
  if (health && !health.profiles.includes(BUSINESS_ID)) {
    return { state: "fail", summary: `Profile "${BUSINESS_ID}" is missing on this backend`, detail: `It has: ${health.profiles.join(", ")}. Change BUSINESS_ID in src/lib/config.ts or add data/profile_${BUSINESS_ID}.json.`, at: now() };
  }
  try {
    const { value: res, ms } = await timed(() => get(base, `/v1/business/${BUSINESS_ID}`));
    if (!res.ok) return { state: "fail", summary: `HTTP ${res.status} loading "${BUSINESS_ID}"`, ms, at: now() };
    const b = await res.json();
    const masked = !JSON.stringify(b).match(/\d{8,}/);
    return {
      state: masked ? "ok" : "fail",
      summary: `${b.name} · ${b.suppliers.length} supplier${b.suppliers.length === 1 ? "" : "s"}`,
      detail: masked ? "Account and phone numbers are masked." : "Long numbers found in the response: masking may be broken.",
      ms, at: now(),
    };
  } catch {
    return { state: "fail", summary: "Could not load the profile", detail: networkHint(base), at: now() };
  }
}

// ---------- full probes (call Gemini when it is on; count toward the rate limit) ----------

// 1x1 transparent PNG: enough to test the image path without sending a real picture.
const TINY_PNG = "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==";

async function postCheck(base: string, thread: unknown[]): Promise<{ res: Response; ms: number }> {
  const { value: res, ms } = await timed(() =>
    fetch(`${base}/v1/check`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ business_id: BUSINESS_ID, thread }),
      signal: AbortSignal.timeout(120_000),
    }),
  );
  return { res, ms };
}

function describeStatus(s?: AIStatus): string {
  if (!s) return "Backend does not report ai_status (older version).";
  return `Image reading: ${s.extraction} · Analyst: ${s.analyst} · Explanation: ${s.explanation}`;
}

function failFromResponse(res: Response, ms: number, body: unknown): ProbeResult {
  if (res.status === 429) return { state: "warn", summary: "Rate limited (429)", detail: `Retry after ${res.headers.get("Retry-After") ?? "a minute"} s.`, ms, at: now() };
  return { state: "fail", summary: `HTTP ${res.status}`, detail: JSON.stringify(body).slice(0, 240), ms, at: now() };
}

/** A known scam thread must never come back SAFE. */
export async function probeTextCheck(base: string): Promise<{ result: ProbeResult; status?: AIStatus }> {
  try {
    const { res, ms } = await postCheck(base, [
      { kind: "message", channel: "email", sender: "ABC Flour <accounts@abcflour-pay.com>", text: "Our bank details have changed. Please pay invoice 4471 today to account 7731 0042 9910." },
      { kind: "message", channel: "email", direction: "outbound", text: "I'd prefer to call you first." },
    ]);
    const body = await res.json().catch(() => null);
    if (!res.ok) return { result: failFromResponse(res, ms, body) };
    const d = body as TrustDecision;
    const status = d.ai_status;
    const aiBad = status && ["timeout", "error"].includes(status.analyst) || status && ["timeout", "error"].includes(status.explanation);
    const state: ProbeState = d.state === "SAFE" ? "fail" : aiBad || ms > 20_000 ? "warn" : "ok";
    return {
      status,
      result: {
        state,
        summary: d.state === "SAFE" ? "Known scam came back SAFE" : `Known scam → ${d.state} (${d.evidence.length} findings)`,
        detail: `${describeStatus(status)}. Explanation by: ${d.explanation_source}.${ms > 20_000 ? " Slow response." : ""}`,
        ms, at: now(),
      },
    };
  } catch (e) {
    const timeout = e instanceof DOMException && e.name === "TimeoutError";
    return { result: { state: "fail", summary: timeout ? "No result within 120 s" : "Check request failed", detail: timeout ? "The client timeout the app uses was reached." : networkHint(base), at: now() } };
  }
}

/** The image path: decode, validate, and (when Gemini is on) read. */
export async function probeImageCheck(base: string): Promise<{ result: ProbeResult; status?: AIStatus }> {
  try {
    const { res, ms } = await postCheck(base, [{ kind: "image", mime_type: "image/png", image_b64: TINY_PNG }]);
    const body = await res.json().catch(() => null);
    if (!res.ok) return { result: failFromResponse(res, ms, body) };
    const d = body as TrustDecision;
    const step = d.ai_status?.extraction;
    const map: Record<string, ProbeResult["state"]> = { ok: "ok", off: "warn", timeout: "fail", error: "fail", skipped: "warn" };
    const words: Record<string, string> = {
      ok: "Gemini read the image",
      off: "Image reading is switched off",
      timeout: "Image reading timed out",
      error: "Image reading failed",
      skipped: "Image was not sent for reading",
    };
    return {
      status: d.ai_status,
      result: {
        state: step ? map[step] : "warn",
        summary: step ? words[step] : `Image accepted → ${d.state}`,
        detail: `Verdict for a blank test image: ${d.state}. ${describeStatus(d.ai_status)}.`,
        ms, at: now(),
      },
    };
  } catch (e) {
    const timeout = e instanceof DOMException && e.name === "TimeoutError";
    return { result: { state: "fail", summary: timeout ? "No result within 120 s" : "Image request failed", detail: timeout ? undefined : networkHint(base), at: now() } };
  }
}
