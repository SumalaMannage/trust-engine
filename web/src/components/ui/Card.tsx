import type { ComponentProps, ReactNode } from "react";
import { FileWarning, Info, ShieldCheck } from "lucide-react";
import styles from "./Card.module.css";

/** Plain white container used for sections such as "What to do now". */
export function Card({ className, muted, ...rest }: ComponentProps<"section"> & { muted?: boolean }) {
  return <section className={[styles.card, muted && styles.muted, className].filter(Boolean).join(" ")} {...rest} />;
}

const ICONS = { shield: ShieldCheck, info: Info, file: FileWarning };

/** Guidance card in the Check screen's side column ("Before you check", "Take your time"). */
export function InfoCard({ title, children, icon = "shield" }: { title: string; children: ReactNode; icon?: keyof typeof ICONS }) {
  const Icon = ICONS[icon];
  return (
    <aside className={`${styles.card} ${styles.info}`}>
      <Icon aria-hidden size={20} className={styles.icon} />
      <h2 className={styles.title}>{title}</h2>
      <div className={styles.text}>{children}</div>
    </aside>
  );
}
