import { CircleAlert, ShieldCheck, ShieldQuestion } from "lucide-react";
import type { TrustState } from "@/lib/api/types";
import { VERDICT } from "@/lib/labels";
import styles from "./VerdictCard.module.css";

interface Props {
  state: TrustState;
  headline: string;
  explanation: string;
}

const ICON = { STOP: CircleAlert, VERIFY: ShieldQuestion, SAFE: ShieldCheck };

/** The decision leads the reading order. The state comes straight from the backend and is never recomputed here. */
export function VerdictCard({ state, headline, explanation }: Props) {
  const Icon = ICON[state];
  // The template headline repeats the verdict ("STOP: do not open…"); the card already shows the word.
  const text = (headline || VERDICT[state].fallback).replace(/^(STOP|VERIFY|SAFE)\s*:\s*/i, "");
  return (
    <section className={`${styles.card} ${styles[state.toLowerCase()]}`} aria-labelledby="verdict-word" tabIndex={-1} id="verdict">
      <p id="verdict-word" className={styles.word}>
        <Icon aria-hidden size={28} />
        {VERDICT[state].word}
      </p>
      <h2 className={styles.headline}>{text.charAt(0).toUpperCase() + text.slice(1)}</h2>
      <p className={styles.explanation}>{explanation}</p>
    </section>
  );
}
