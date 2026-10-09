import { useId, type ComponentProps, type ReactNode } from "react";
import styles from "./Field.module.css";

interface FieldShellProps {
  label: string;
  hint?: ReactNode;
  error?: string;
  optional?: boolean;
  /** Shows "120 / 5,000 characters" ahead of the hint or error. */
  counter?: { length: number; max: number };
  children: (ids: { inputId: string; describedBy?: string; invalid: boolean }) => ReactNode;
}

/** Label, control, then one line of help. An error replaces the hint and says how to fix it. */
export function FieldShell({ label, hint, error, optional, counter, children }: FieldShellProps) {
  const inputId = useId();
  const helpId = `${inputId}-help`;
  const help = error ?? hint;
  const count = counter ? `${counter.length.toLocaleString()} / ${counter.max.toLocaleString()} characters` : null;
  return (
    <div className={styles.field}>
      <label className={styles.label} htmlFor={inputId}>
        {label}
        {optional && <span className={styles.optional}> · optional</span>}
      </label>
      {children({ inputId, describedBy: help || count ? helpId : undefined, invalid: Boolean(error) })}
      {(help || count) && (
        <p id={helpId} className={error ? styles.error : styles.hint} role={error ? "alert" : undefined}>
          {count && help ? `${count} · ` : count}
          {help}
        </p>
      )}
    </div>
  );
}

type Shared = { label: string; hint?: ReactNode; error?: string; optional?: boolean; counter?: { length: number; max: number } };

export function TextField({ label, hint, error, optional, counter, className, ...input }: Shared & ComponentProps<"input">) {
  return (
    <FieldShell label={label} hint={hint} error={error} optional={optional} counter={counter}>
      {({ inputId, describedBy, invalid }) => (
        <input id={inputId} aria-describedby={describedBy} aria-invalid={invalid || undefined} className={[styles.control, className].filter(Boolean).join(" ")} {...input} />
      )}
    </FieldShell>
  );
}

export function TextArea({ label, hint, error, optional, counter, className, ...input }: Shared & ComponentProps<"textarea">) {
  return (
    <FieldShell label={label} hint={hint} error={error} optional={optional} counter={counter}>
      {({ inputId, describedBy, invalid }) => (
        <textarea id={inputId} aria-describedby={describedBy} aria-invalid={invalid || undefined} className={[styles.control, styles.textarea, className].filter(Boolean).join(" ")} {...input} />
      )}
    </FieldShell>
  );
}

export function SelectField({ label, hint, error, optional, className, children, ...input }: Shared & ComponentProps<"select">) {
  return (
    <FieldShell label={label} hint={hint} error={error} optional={optional}>
      {({ inputId, describedBy, invalid }) => (
        <select id={inputId} aria-describedby={describedBy} aria-invalid={invalid || undefined} className={[styles.control, styles.select, className].filter(Boolean).join(" ")} {...input}>
          {children}
        </select>
      )}
    </FieldShell>
  );
}
