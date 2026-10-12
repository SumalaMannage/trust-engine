import type { AIStatus, AIStep } from "@/lib/api/types";
import { Card } from "@/components/ui/Card";
import styles from "./CheckStatusCard.module.css";

const STEP_LABEL: Record<AIStep, string> = {
  ok: "Done",
  off: "Switched off",
  timeout: "Took too long",
  error: "Failed",
  skipped: "Not needed",
};

const ROWS: { key: keyof AIStatus; label: string }[] = [
  { key: "extraction", label: "Reading images (Gemini)" },
  { key: "analyst", label: "Spotting scam tactics (Gemini)" },
  { key: "explanation", label: "Writing the explanation (Gemini)" },
];

function tone(step: AIStep): string {
  if (step === "ok") return styles.ok;
  if (step === "skipped") return styles.muted;
  return styles.warn;
}

/** "How this was checked": safety rules always run; each Gemini step reports how it went (backend ai_status). */
export function CheckStatusCard({ status }: { status: AIStatus }) {
  const degraded = ROWS.some((r) => ["off", "timeout", "error"].includes(status[r.key]));
  return (
    <Card aria-labelledby="how-title">
      <h2 id="how-title" className={styles.title}>How this was checked</h2>
      <ul className={styles.list}>
        <li className={styles.row}>
          <span>Safety rules and your records</span>
          <span className={`${styles.chip} ${styles.ok}`}>Done</span>
        </li>
        {ROWS.map((r) => (
          <li key={r.key} className={styles.row}>
            <span>{r.label}</span>
            <span className={`${styles.chip} ${tone(status[r.key])}`}>{STEP_LABEL[status[r.key]]}</span>
          </li>
        ))}
      </ul>
      {degraded && (
        <p className={styles.note}>
          The verdict comes from the safety rules, so it still stands. A step that did not run is never treated as safe.
        </p>
      )}
    </Card>
  );
}
