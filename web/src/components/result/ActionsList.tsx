import { ButtonLink } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import styles from "./ActionsList.module.css";

/** "What to do now": the backend's next steps, numbered because order matters. */
export function ActionsList({ actions }: { actions: string[] }) {
  return (
    <Card aria-labelledby="actions-title">
      <h2 id="actions-title" className={styles.title}>What to do now</h2>
      {actions.length > 0 && (
        <ol className={styles.list}>
          {actions.map((a, i) => (
            <li key={i} className={styles.item}>
              <span className={styles.number} aria-hidden>{i + 1}.</span>
              <span>{a}</span>
            </li>
          ))}
        </ol>
      )}
      <ButtonLink href="/" variant="secondary" fullWidth>Back to check</ButtonLink>
    </Card>
  );
}
