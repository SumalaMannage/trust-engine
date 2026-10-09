import type { Evidence, EvidenceLayer, Severity, TrustState } from "@/lib/api/types";
import type { SourceItem } from "@/lib/thread";

/** Owner-facing words for the API's values. The verdict itself always comes from the backend, unchanged. */
export const VERDICT: Record<TrustState, { word: string; fallback: string }> = {
  STOP: { word: "STOP", fallback: "Do not open, click or pay" },
  VERIFY: { word: "VERIFY", fallback: "Check before you act" },
  SAFE: { word: "SAFE", fallback: "No red flags found" },
};

export const LAYER_LABEL: Record<EvidenceLayer, string> = {
  deterministic: "Known scam pattern",
  context: "Doesn't match your records",
  correlation: "Pattern across the conversation",
  ai: "AI noticed",
};

const SEVERITY_RANK: Record<Severity, number> = { critical: 0, high: 1, medium: 2, low: 3, info: 4 };

/** Ordered by severity, then weight, as the result screen states. */
export function sortEvidence(evidence: Evidence[]): Evidence[] {
  return [...evidence].sort((a, b) => SEVERITY_RANK[a.severity] - SEVERITY_RANK[b.severity] || b.weight - a.weight);
}

export function severityLabel(e: Evidence): string {
  return `${e.severity.toUpperCase()} severity${e.layer === "ai" ? " · Tentative" : ""}`;
}

/** "Item 4 · File details" or "Whole conversation · no single source item". */
export function locationLabel(e: Evidence, source: SourceItem[]): string {
  const item = e.thread_index != null ? source[e.thread_index] : undefined;
  if (!item) return "Whole conversation · no single source item";
  return `Item ${item.number} · ${item.meta}`;
}

const STAGE_WORD: Record<string, string> = { lure: "lure", fake_page: "fake page", payload: "risky file", pressure: "pressure" };

/**
 * Backend `observed` values meant for machines: "message 4" is a thread position (shown as an item
 * number), and correlation stage lists use ids.
 */
export function readableObserved(e: Evidence): string | null {
  if (!e.observed) return null;
  const pos = e.observed.match(/^message (\d+)$/i);
  if (pos) return `Item ${pos[1]}`;
  if (e.rule_id === "COR_CAMPAIGN") return e.observed.split(",").map((s) => STAGE_WORD[s.trim()] ?? s.trim()).join(", ");
  return e.observed;
}
