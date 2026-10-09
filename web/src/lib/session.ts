"use client";

import { useSyncExternalStore } from "react";
import type { TrustDecision } from "@/lib/api/types";
import type { DraftItem, SourceItem } from "@/lib/thread";

/**
 * The server keeps no history, so the last result lives in this tab only (sessionStorage).
 * The thread being built lives in memory: it survives "Back to check" but not a reload, and
 * image bytes never touch storage.
 */
export interface StoredResult {
  decision: TrustDecision;
  source: SourceItem[];
  checkedAt: string;
}

const RESULT_KEY = "trust-engine:last-result";
const listeners = new Set<() => void>();
let cachedRaw: string | null | undefined;
let cachedValue: StoredResult | null = null;
let thread: DraftItem[] | null = null;

function read(): string | null {
  try {
    return window.sessionStorage.getItem(RESULT_KEY);
  } catch {
    return null;
  }
}

export function saveResult(result: StoredResult): void {
  const raw = JSON.stringify(result);
  try {
    window.sessionStorage.setItem(RESULT_KEY, raw);
  } catch {
    // storage blocked: keep it in memory for this page view
  }
  cachedRaw = raw;
  cachedValue = result;
  listeners.forEach((l) => l());
}

function snapshot(): StoredResult | null {
  const raw = read();
  if (raw === null && cachedValue && cachedRaw !== null) return cachedValue; // storage blocked
  if (raw !== cachedRaw) {
    cachedRaw = raw;
    try {
      const parsed = raw ? (JSON.parse(raw) as StoredResult) : null;
      cachedValue = parsed && Array.isArray(parsed.source) ? parsed : null; // ignore results saved by older builds
    } catch {
      cachedValue = null;
    }
  }
  return cachedValue;
}

function subscribe(listener: () => void) {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

/** `undefined` while the static page hydrates, then the stored result or `null`. */
export function useStoredResult(): StoredResult | null | undefined {
  return useSyncExternalStore(subscribe, snapshot, () => undefined);
}

export function saveThread(items: DraftItem[]): void {
  thread = items;
}

export function takeThread(): DraftItem[] | null {
  return thread;
}

export function clearThread(): void {
  thread = null;
}
