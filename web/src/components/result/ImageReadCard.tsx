import type { ImageRead } from "@/lib/api/types";
import { money } from "@/lib/format";
import type { SourceItem } from "@/lib/thread";
import { Card } from "@/components/ui/Card";
import styles from "./ImageReadCard.module.css";

const TYPE: Record<string, string> = {
  payment_slip: "Payment slip image",
  chat_screenshot: "Chat screenshot",
  invoice: "Invoice image",
  email: "Email screenshot",
  other: "Image",
};

function prettyDate(iso?: string | null): string | null {
  if (!iso) return null;
  const d = new Date(`${iso}T00:00:00`);
  return Number.isNaN(d.getTime()) ? iso : d.toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" });
}

/** "What we read from your image": the facts Gemini extracted. A reading, not a bank confirmation. */
export function ImageReadCard({ read: r, source }: { read: ImageRead; source: SourceItem[] }) {
  const item = source[r.index];
  const where = `Item ${item?.number ?? r.index + 1} · ${item?.meta.split(" · ").slice(1, 2)[0] ?? "Image"} · ${TYPE[r.image_type] ?? "Image"}`;
  const facts = [
    r.amount != null && `Amount: ${money(r.amount, r.currency ?? "LKR")}`,
    prettyDate(r.date) && `Date: ${prettyDate(r.date)}`,
    r.reference_id && `Reference: ${r.reference_id}`,
  ].filter(Boolean);
  const asks = [
    r.requests_made.length > 0 && `Request: ${r.requests_made.join("; ")}`,
    r.urgency_cues.length > 0 && `Urgency: ${r.urgency_cues.map((u) => `“${u}”`).join(", ")}`,
  ].filter(Boolean);

  return (
    <Card aria-label="What we read from your image">
      <h2 className={styles.title}>What we read from your image</h2>
      <p className={styles.where}>{where}</p>
      {r.legible ? (
        <>
          {facts.length > 0 && <p>{facts.join(" · ")}</p>}
          {asks.length > 0 && <p>{asks.join(" · ")}</p>}
          {r.text_excerpt && <p>Excerpt: {r.text_excerpt}</p>}
          {r.warning_signs.length > 0 && (
            <ul className={styles.signs}>
              {r.warning_signs.map((w) => <li key={w}>{w}</li>)}
            </ul>
          )}
        </>
      ) : (
        <>
          <p>
            Some information could not be read from this image.
            {r.text_excerpt ? ` The visible excerpt is “${r.text_excerpt}”.` : ""}
          </p>
          <p className={styles.small}>An unreadable image is not necessarily fake. Choose a clearer screenshot or confirm the payment in your banking app.</p>
        </>
      )}
      <p className={styles.small}>Information shown is an image reading, not confirmation from a bank.</p>
    </Card>
  );
}
