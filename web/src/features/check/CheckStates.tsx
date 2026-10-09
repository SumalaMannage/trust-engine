import { LoaderCircle, RotateCcw, ShieldCheck } from "lucide-react";
import type { ApiError } from "@/lib/api/client";
import { plural } from "@/lib/format";
import { Button } from "@/components/ui/Button";
import styles from "./CheckStates.module.css";

/** No percentage or per-step progress: the backend reports none, and the UI does not invent it. */
export function CheckingPanel({ slow }: { slow: boolean }) {
  return (
    <section className={styles.panel} aria-live="polite" aria-busy="true">
      <LoaderCircle aria-hidden size={36} className={styles.spinner} />
      <h2 className={styles.title}>{slow ? "Still checking · over 20 seconds" : "Please wait while we check"}</h2>
      {slow ? (
        <p>Image checks can take longer. Several images checked one after another can take over a minute. Keep this page open while we wait.</p>
      ) : (
        <p>We&apos;re checking the content you added together. Keep this page open; there is nothing else you need to send.</p>
      )}
      <p>Text-only checks often take several seconds. Images take longer.</p>
      <Button fullWidth loading loadingLabel={slow ? "Still checking…" : "Checking…"}>Checking…</Button>
      <p className={styles.small}>A check is already in progress. Checking again is unavailable until it finishes.</p>
    </section>
  );
}

const COPY: Record<Exclude<ApiError["kind"], "invalid">, { title: string; meta: string; body: string; note: string }> = {
  timeout: {
    title: "The check took too long",
    meta: "Client timeout after 120 seconds",
    body: "We did not receive a result in time. This does not mean the conversation is safe.",
    note: "You can retry or review what you added.",
  },
  network: {
    title: "We couldn't connect",
    meta: "Network error",
    body: "Check your internet connection and try again. We have not received a verdict.",
    note: "Do not pay or open unfamiliar links while waiting for a result.",
  },
  server: {
    title: "The checking service had a problem",
    meta: "Server error",
    body: "The service could not complete this request. Try again later; this is not a safety result.",
    note: "Your messages, links and image selection remain available on this page.",
  },
  rate_limited: {
    title: "Pause before trying again",
    meta: "429 · Too many requests",
    body: "The service has received too many checks. Wait before retrying. No result has been returned.",
    note: "",
  },
  not_found: {
    title: "The demo business is unavailable",
    meta: "404 · Business profile not found",
    body: "The service could not find this demo business. We cannot compare with its records right now.",
    note: "Try again later; no result is available.",
  },
};

export function RecoveryPanel({ error, itemCount, onRetry, onReview }: { error: ApiError; itemCount: number; onRetry: () => void; onReview: () => void }) {
  const copy = COPY[error.kind === "invalid" ? "server" : error.kind];
  const wait = error.kind === "rate_limited" && error.retryAfter ? ` Try again in about ${plural(Math.ceil(error.retryAfter), "second")}.` : "";
  return (
    <section className={styles.panel} role="alert" aria-labelledby="recovery-title">
      <h2 id="recovery-title" className={styles.title}>{copy.title}</h2>
      <p className={styles.meta}>Check · {copy.meta} · {plural(itemCount, "item")} thread preserved</p>
      <p>{copy.body}{wait}</p>
      {error.kind !== "not_found" && (
        <Button fullWidth icon={error.kind === "rate_limited" ? <RotateCcw aria-hidden size={20} /> : <ShieldCheck aria-hidden size={20} />} onClick={onRetry}>
          {error.kind === "rate_limited" ? "Retry when ready" : "Retry this check"}
        </Button>
      )}
      <Button variant="secondary" fullWidth onClick={onReview}>
        {error.kind === "not_found" ? "Back to your thread" : "Review preserved thread"}
      </Button>
      {copy.note && <p className={styles.small}>{copy.note}</p>}
    </section>
  );
}
