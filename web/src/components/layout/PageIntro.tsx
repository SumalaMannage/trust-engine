import type { ReactNode } from "react";
import { BUSINESS_ID, BUSINESS_LABEL } from "@/lib/config";
import styles from "./PageIntro.module.css";

/** "Demo Bakery · demo_bakery", the page title and one line of context. */
export function PageIntro({ title, lede }: { title: string; lede?: ReactNode }) {
  return (
    <div className={styles.intro}>
      <p className={styles.business}>{BUSINESS_LABEL} · {BUSINESS_ID}</p>
      <h1 className={styles.title}>{title}</h1>
      {lede && <p className={styles.lede}>{lede}</p>}
    </div>
  );
}
