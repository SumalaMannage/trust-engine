import type { ReactNode } from "react";
import styles from "./Tag.module.css";

/** Small label such as "Rule · Safety check", "AI · Gemini" or "Demo · Demo Bakery". */
export function Tag({ children, tone = "neutral" }: { children: ReactNode; tone?: "neutral" | "primary" }) {
  return <span className={`${styles.tag} ${styles[tone]}`}>{children}</span>;
}
