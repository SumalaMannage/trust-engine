import Link from "next/link";
import type { ComponentProps, ReactNode } from "react";
import { LoaderCircle } from "lucide-react";
import styles from "./Button.module.css";

type Variant = "primary" | "secondary" | "quiet";

interface CommonProps {
  variant?: Variant;
  icon?: ReactNode;
  fullWidth?: boolean;
  children: ReactNode;
}

type ButtonProps = CommonProps & ComponentProps<"button"> & { loading?: boolean; loadingLabel?: string };
type LinkProps = CommonProps & Omit<ComponentProps<typeof Link>, "children">;

function classes(variant: Variant, fullWidth?: boolean, extra?: string) {
  return [styles.button, styles[variant], fullWidth && styles.fullWidth, extra].filter(Boolean).join(" ");
}

/** Check is the only primary action on a screen. "Add another message" is secondary; "Back to check" is quiet. */
export function Button({ variant = "primary", icon, fullWidth, loading, loadingLabel, children, className, disabled, type = "button", ...rest }: ButtonProps) {
  return (
    <button
      type={type}
      className={classes(variant, fullWidth, className)}
      disabled={disabled || loading}
      aria-busy={loading || undefined}
      {...rest}
    >
      {loading ? <LoaderCircle className={styles.spinner} aria-hidden size={20} /> : icon}
      <span>{loading && loadingLabel ? loadingLabel : children}</span>
    </button>
  );
}

export function ButtonLink({ variant = "secondary", icon, fullWidth, children, className, ...rest }: LinkProps) {
  return (
    <Link className={classes(variant, fullWidth, className)} {...rest}>
      {icon}
      <span>{children}</span>
    </Link>
  );
}
