import type { Direction } from "@/lib/api/types";
import styles from "./DirectionToggle.module.css";

interface Props {
  name: string;
  value: Direction;
  onChange: (value: Direction) => void;
  disabled?: boolean;
  legend: string;
}

const OPTIONS: { value: Direction; label: string }[] = [
  { value: "inbound", label: "From them" },
  { value: "outbound", label: "From me" },
];

/** "From them / From me" stays explicit: the owner's replies are how the backend spots escalation. */
export function DirectionToggle({ name, value, onChange, disabled, legend }: Props) {
  return (
    <fieldset className={styles.group} disabled={disabled}>
      <legend className="visually-hidden">{legend}</legend>
      {OPTIONS.map((o) => (
        <label key={o.value} className={styles.option}>
          <input type="radio" name={name} value={o.value} checked={value === o.value} onChange={() => onChange(o.value)} className={styles.input} />
          <span className={styles.dot} aria-hidden />
          {o.label}
        </label>
      ))}
    </fieldset>
  );
}
