import type { Evidence } from "@/lib/api/types";
import { LAYER_LABEL, readableObserved, severityLabel } from "@/lib/labels";
import styles from "./EvidenceCard.module.css";

/** One finding: a tinted header (type, severity, where), then what we saw next to what to look for. */
export function EvidenceCard({ evidence: e, location }: { evidence: Evidence; location: string }) {
  const observed = readableObserved(e);
  const tone = e.layer === "ai" ? "ai" : e.severity === "critical" || e.severity === "high" ? "high" : e.severity === "medium" ? "medium" : "low";
  return (
    <article className={[styles.card, e.layer === "ai" && styles.dashed].filter(Boolean).join(" ")}>
      <header className={`${styles.head} ${styles[tone]}`}>
        <p className={styles.layer}>{LAYER_LABEL[e.layer]}</p>
        <p className={styles.severity}>{severityLabel(e)}</p>
        <p className={styles.location}>{location}</p>
      </header>
      <div className={styles.body}>
        <h3 className={styles.title}>{e.title}</h3>
        {e.detail && <p className={styles.detail}>{e.detail}</p>}
        {observed && (
          <div className={styles.pair}>
            <p className={styles.pairLabel}>Observed · What we saw</p>
            <p className={styles.pairValue}>{e.layer === "ai" ? `Tentative quote: “${observed}”` : observed}</p>
          </div>
        )}
        {e.expected && (
          <div className={styles.pair}>
            <p className={styles.pairLabel}>Expected · What to look for</p>
            <p className={styles.pairValue}>{e.expected}</p>
          </div>
        )}
        {e.layer === "ai" && <p className={styles.note}>An AI interpretation is a clue, not proof.</p>}
      </div>
    </article>
  );
}
