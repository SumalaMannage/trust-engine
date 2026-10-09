import type { SourceItem } from "@/lib/thread";
import styles from "./SourceThread.module.css";

interface Props {
  items: SourceItem[];
  /** Thread positions that at least one finding points to. */
  referenced?: Set<number>;
  footnote?: string;
}

/** "Source thread": what was sent, numbered as the backend saw it. */
export function SourceThread({ items, referenced, footnote }: Props) {
  if (items.length === 0) return null;
  return (
    <section className={styles.panel} aria-labelledby="source-title">
      <h2 id="source-title" className={styles.title}>Source thread</h2>
      <ol className={styles.list}>
        {items.map((it, i) => (
          <li key={it.number} className={it.direction === "outbound" ? styles.mine : styles.item}>
            <p className={styles.meta}>
              {it.number} · {it.meta}
              {referenced?.has(i) ? " · Referenced in evidence" : ""}
            </p>
            <p className={styles.text}>{it.text}</p>
          </li>
        ))}
      </ol>
      {footnote && <p className={styles.footnote}>{footnote}</p>}
    </section>
  );
}
