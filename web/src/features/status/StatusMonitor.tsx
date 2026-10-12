"use client";

import { useCallback, useEffect, useRef, useState, useSyncExternalStore } from "react";
import { Activity, CircleAlert, CircleCheck, CircleDashed, LoaderCircle, Play, RefreshCw, TriangleAlert } from "lucide-react";
import { API_BASE, BUSINESS_ID, LIMITS } from "@/lib/config";
import {
  geminiFromHealth, presetTargets, probeHealth, probeImageCheck, probeProfile, probeTextCheck,
  type ProbeResult, type ProbeState,
} from "@/lib/monitor";
import { Button } from "@/components/ui/Button";
import styles from "./StatusMonitor.module.css";

type Key = "api" | "gemini" | "profile" | "text" | "image";

const ROWS: { key: Key; name: string; what: string; full?: boolean }[] = [
  { key: "api", name: "Backend API", what: "GET /health answers" },
  { key: "gemini", name: "Gemini settings", what: "Model configured on the backend" },
  { key: "profile", name: "Business profile", what: `GET /v1/business/${BUSINESS_ID}, numbers masked` },
  { key: "text", name: "Text check pipeline", what: "A known scam must not come back SAFE", full: true },
  { key: "image", name: "Image pipeline", what: "Test image decoded and read", full: true },
];

const IDLE: ProbeResult = { state: "idle", summary: "Not run yet" };
const INTERVAL_S = 30;

interface Beat { at: string; state: ProbeState; ms?: number }

function overall(results: Record<Key, ProbeResult>): { state: ProbeState; text: string } {
  const ran = Object.values(results).filter((r) => r.state !== "idle");
  if (ran.some((r) => r.state === "running")) return { state: "running", text: "Checking…" };
  if (ran.length === 0) return { state: "idle", text: "Not checked yet" };
  if (results.api.state === "fail") return { state: "fail", text: "Backend unreachable" };
  if (ran.some((r) => r.state === "fail")) return { state: "fail", text: "Something is broken" };
  if (ran.some((r) => r.state === "warn")) return { state: "warn", text: "Working, with limits" };
  return { state: "ok", text: "All checked parts working" };
}

function Icon({ state }: { state: ProbeState }) {
  if (state === "ok") return <CircleCheck aria-hidden size={20} />;
  if (state === "warn") return <TriangleAlert aria-hidden size={20} />;
  if (state === "fail") return <CircleAlert aria-hidden size={20} />;
  if (state === "running") return <LoaderCircle aria-hidden size={20} className={styles.spin} />;
  return <CircleDashed aria-hidden size={20} />;
}

// The page origin only exists in the browser; the pre-rendered HTML shows a dash until hydration.
const noSubscribe = () => () => {};
function usePageOrigin(): string {
  return useSyncExternalStore(noSubscribe, () => window.location.origin, () => "–");
}

const STATE_WORD: Record<ProbeState, string> = { ok: "Working", warn: "Limited", fail: "Failing", running: "Checking", idle: "Not run" };

export function StatusMonitor() {
  const targets = presetTargets();
  const origin = usePageOrigin();
  const [targetId, setTargetId] = useState(targets[0].id);
  const [custom, setCustom] = useState("");
  const [results, setResults] = useState<Record<Key, ProbeResult>>({ api: IDLE, gemini: IDLE, profile: IDLE, text: IDLE, image: IDLE });
  const [beats, setBeats] = useState<Beat[]>([]);
  const [auto, setAuto] = useState(true);
  const [fullBusy, setFullBusy] = useState(false);
  const busy = useRef(false);

  const base = targetId === "custom" ? custom.trim().replace(/\/+$/, "") : targets.find((t) => t.id === targetId)?.base ?? API_BASE;

  const set = (key: Key, r: ProbeResult) => setResults((prev) => ({ ...prev, [key]: r }));

  const runQuick = useCallback(async () => {
    if (busy.current) return;
    busy.current = true;
    setResults((p) => ({ ...p, api: { ...p.api, state: "running" }, gemini: { ...p.gemini, state: "running" }, profile: { ...p.profile, state: "running" } }));
    const { result, health } = await probeHealth(base);
    set("api", result);
    set("gemini", health ? geminiFromHealth(health) : { state: "idle", summary: "Needs the backend" });
    set("profile", health ? await probeProfile(base, health) : { state: "idle", summary: "Needs the backend" });
    setBeats((b) => [...b.slice(-29), { at: result.at ?? "", state: result.state, ms: result.ms }]);
    busy.current = false;
  }, [base]);

  async function runFull() {
    setFullBusy(true);
    await runQuick();
    set("text", { ...results.text, state: "running" });
    set("image", { ...results.image, state: "running" });
    const [text, image] = await Promise.all([probeTextCheck(base), probeImageCheck(base)]);
    set("text", text.result);
    set("image", image.result);
    setFullBusy(false);
  }

  function changeTarget(id: string, url = custom) {
    setResults({ api: IDLE, gemini: IDLE, profile: IDLE, text: IDLE, image: IDLE });
    setBeats([]);
    setTargetId(id);
    setCustom(url);
  }

  // Run quick checks for the current target, then every INTERVAL_S while auto is on.
  useEffect(() => {
    if (targetId === "custom" && !custom.trim()) return;
    runQuick();
    if (!auto) return;
    const id = window.setInterval(runQuick, INTERVAL_S * 1000);
    return () => window.clearInterval(id);
  }, [runQuick, auto, targetId, custom]);

  const top = overall(results);
  const okBeats = beats.filter((b) => b.state === "ok");
  const avg = okBeats.length ? Math.round(okBeats.reduce((s, b) => s + (b.ms ?? 0), 0) / okBeats.length) : null;

  return (
    <div className={styles.page}>
      <header className={styles.head}>
        <p className={styles.eyebrow}><Activity aria-hidden size={16} /> Internal · not shown to shop owners</p>
        <h1 className={styles.title}>System status</h1>
        <p className={styles.lede}>Live checks against the backend you choose. Quick checks repeat every {INTERVAL_S} seconds; the full check calls Gemini and runs only when you press it.</p>
      </header>

      <section className={styles.controls} aria-label="Target backend">
        <label className={styles.label} htmlFor="target">Backend to check</label>
        <select id="target" className={styles.select} value={targetId} onChange={(e) => changeTarget(e.target.value)}>
          {targets.map((t) => <option key={t.id} value={t.id}>{t.label}</option>)}
          <option value="custom">Custom URL…</option>
        </select>
        {targetId === "custom" && (
          <input className={styles.select} placeholder="https://…" value={custom} onChange={(e) => changeTarget("custom", e.target.value)} aria-label="Custom backend URL" />
        )}
        <div className={styles.buttons}>
          <Button variant="secondary" icon={<RefreshCw aria-hidden size={18} />} onClick={runQuick}>Run quick checks</Button>
          <Button icon={<Play aria-hidden size={18} />} onClick={runFull} loading={fullBusy} loadingLabel="Running full check…">Run full check</Button>
        </div>
        <label className={styles.toggle}>
          <input type="checkbox" checked={auto} onChange={(e) => setAuto(e.target.checked)} /> Repeat quick checks every {INTERVAL_S} s
        </label>
      </section>

      <section className={`${styles.overall} ${styles[top.state]}`} aria-live="polite">
        <Icon state={top.state} />
        <div>
          <p className={styles.overallText}>{top.text}</p>
          <p className={styles.small}>{base || "Same origin as this page"}</p>
        </div>
      </section>

      <section aria-labelledby="checks-title">
        <h2 id="checks-title" className={styles.h2}>Checks</h2>
        <ul className={styles.rows}>
          {ROWS.map((row) => {
            const r = results[row.key];
            return (
              <li key={row.key} className={`${styles.row} ${styles[r.state]}`}>
                <span className={styles.rowIcon}><Icon state={r.state} /></span>
                <div className={styles.rowBody}>
                  <div className={styles.rowHead}>
                    <p className={styles.rowName}>{row.name}{row.full && <span className={styles.badge}>Full check</span>}</p>
                    <p className={styles.rowState}>{STATE_WORD[r.state]}{r.ms != null && ` · ${r.ms} ms`}</p>
                  </div>
                  <p className={styles.what}>{row.what}</p>
                  <p className={styles.summary}>{r.summary}</p>
                  {r.detail && <p className={styles.detail}>{r.detail}</p>}
                  {r.at && <p className={styles.small}>Last run {r.at}</p>}
                </div>
              </li>
            );
          })}
        </ul>
      </section>

      <section aria-labelledby="history-title" className={styles.history}>
        <h2 id="history-title" className={styles.h2}>Backend uptime · this session</h2>
        {beats.length === 0 ? (
          <p className={styles.small}>No checks yet.</p>
        ) : (
          <>
            <ol className={styles.beats} aria-label={`${okBeats.length} of ${beats.length} checks answered`}>
              {beats.map((b, i) => <li key={i} className={`${styles.beat} ${styles[b.state]}`} title={`${b.at} · ${STATE_WORD[b.state]}${b.ms != null ? ` · ${b.ms} ms` : ""}`} />)}
            </ol>
            <p className={styles.small}>{okBeats.length} of {beats.length} answered{avg != null && ` · average ${avg} ms`} · oldest on the left</p>
          </>
        )}
      </section>

      <section aria-labelledby="fe-title" className={styles.config}>
        <h2 id="fe-title" className={styles.h2}>This frontend</h2>
        <dl className={styles.dl}>
          <div><dt>Configured API</dt><dd>{API_BASE || "Same origin (production)"}</dd></div>
          <div><dt>Page origin</dt><dd>{origin}</dd></div>
          <div><dt>Business profile</dt><dd>{BUSINESS_ID}</dd></div>
          <div><dt>Limits</dt><dd>{LIMITS.threadItems} items · {LIMITS.images} images · {LIMITS.messageChars.toLocaleString()} characters per message</dd></div>
          <div><dt>Build</dt><dd>{process.env.NODE_ENV}</dd></div>
        </dl>
      </section>
    </div>
  );
}
