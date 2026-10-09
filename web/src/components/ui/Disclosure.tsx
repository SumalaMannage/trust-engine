import type { ReactNode } from "react";
import { ChevronDown } from "lucide-react";
import styles from "./Disclosure.module.css";

interface Props {
  title: string;
  hint?: string;
  defaultOpen?: boolean;
  children: ReactNode;
}

/** "Extra details · optional". Uses native <details> so it works before hydration. */
export function Disclosure({ title, hint, defaultOpen, children }: Props) {
  return (
    <details className={styles.details} open={defaultOpen}>
      <summary className={styles.summary}>
        <span>
          {title} <span className={styles.optional}>· optional</span>
        </span>
        <ChevronDown aria-hidden size={20} className={styles.chevron} />
      </summary>
      <div className={styles.content}>
        {hint && <p className={styles.hint}>{hint}</p>}
        {children}
      </div>
    </details>
  );
}
