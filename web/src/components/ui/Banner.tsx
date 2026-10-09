import type { ReactNode } from "react";
import { CircleAlert, TrendingUp, TriangleAlert } from "lucide-react";
import styles from "./Banner.module.css";

type Tone = "danger" | "warning";

interface Props {
  tone: Tone;
  title: ReactNode;
  children?: ReactNode;
  icon?: "trend" | "alert";
}

/**
 * Solid-surface notices: "Pressure increased after you declined" (danger) and
 * "Using safety rules for this result" (warning). Never translucent.
 */
export function Banner({ tone, title, children, icon = tone === "danger" ? "trend" : "alert" }: Props) {
  const Icon = icon === "trend" ? TrendingUp : tone === "danger" ? CircleAlert : TriangleAlert;
  return (
    <div className={`${styles.banner} ${styles[tone]}`} role="status">
      <Icon aria-hidden size={20} className={styles.icon} />
      <div className={styles.body}>
        <p className={styles.title}>{title}</p>
        {children && <p className={styles.text}>{children}</p>}
      </div>
    </div>
  );
}
