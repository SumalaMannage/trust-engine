import { API_BASE, CHECK_TIMEOUT_MS } from "@/lib/config";
import type { BusinessView, CheckRequest, TrustDecision } from "./types";

export type ApiErrorKind = "rate_limited" | "not_found" | "invalid" | "timeout" | "network" | "server";

export class ApiError extends Error {
  constructor(
    public kind: ApiErrorKind,
    message: string,
    public status?: number,
    /** For 422: the thread position the error belongs to, when the backend says so. */
    public position?: number,
    /** For 422: which field of that item ("text", "url", "image_b64", ...). */
    public field?: string,
    /** For 429: seconds from a Retry-After header, only when the service supplies one. */
    public retryAfter?: number,
  ) {
    super(message);
    this.name = "ApiError";
  }
}

const FALLBACK: Record<ApiErrorKind, string> = {
  rate_limited: "The service has received too many checks. Wait before retrying.",
  not_found: "The service could not find this demo business.",
  invalid: "Something you added could not be checked.",
  timeout: "We did not receive a result in time.",
  network: "Check your internet connection and try again.",
  server: "The service could not complete this request.",
};

interface ValidationIssue { loc?: (string | number)[]; msg?: string }

/** FastAPI sends `{detail: "text"}` for its own errors and `{detail: [{loc, msg}]}` for validation. */
function parse422(body: unknown): { message: string; position?: number; field?: string } {
  const detail = body && typeof body === "object" && "detail" in body ? (body as { detail: unknown }).detail : null;
  if (typeof detail === "string") return { message: detail, field: /image/i.test(detail) ? "image_b64" : undefined };
  if (Array.isArray(detail) && detail.length > 0) {
    const issue = detail[0] as ValidationIssue;
    const loc = issue.loc ?? [];
    const i = loc.indexOf("thread");
    const position = i >= 0 && typeof loc[i + 1] === "number" ? (loc[i + 1] as number) : undefined;
    const field = typeof loc.at(-1) === "string" ? (loc.at(-1) as string) : undefined;
    return { message: issue.msg ?? FALLBACK.invalid, position, field };
  }
  return { message: FALLBACK.invalid };
}

async function request<T>(path: string, init: RequestInit & { timeoutMs?: number } = {}): Promise<T> {
  const { timeoutMs = 30_000, signal, ...rest } = init;
  const timeout = AbortSignal.timeout(timeoutMs);
  const combined = signal ? AbortSignal.any([signal, timeout]) : timeout;

  let res: Response;
  try {
    res = await fetch(`${API_BASE}${path}`, { ...rest, signal: combined });
  } catch (err) {
    if (timeout.aborted) throw new ApiError("timeout", FALLBACK.timeout);
    if (err instanceof DOMException && err.name === "AbortError") throw err; // caller cancelled
    throw new ApiError("network", FALLBACK.network);
  }

  if (!res.ok) {
    const body = await res.json().catch(() => null);
    if (res.status === 422 || res.status === 413) {
      const { message, position, field } = parse422(body);
      throw new ApiError("invalid", message, res.status, position, field);
    }
    if (res.status === 429) {
      const ra = Number(res.headers.get("Retry-After"));
      throw new ApiError("rate_limited", FALLBACK.rate_limited, 429, undefined, undefined, Number.isFinite(ra) && ra > 0 ? ra : undefined);
    }
    if (res.status === 404) throw new ApiError("not_found", FALLBACK.not_found, 404);
    throw new ApiError("server", FALLBACK.server, res.status);
  }
  return (await res.json()) as T;
}

export function checkThread(body: CheckRequest, signal?: AbortSignal): Promise<TrustDecision> {
  return request<TrustDecision>("/v1/check", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
    signal,
    timeoutMs: CHECK_TIMEOUT_MS,
  });
}

export function getBusiness(businessId: string, signal?: AbortSignal): Promise<BusinessView> {
  return request<BusinessView>(`/v1/business/${encodeURIComponent(businessId)}`, { signal });
}
