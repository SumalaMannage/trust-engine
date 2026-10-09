import type { SupplierView } from "@/lib/api/types";
import { moneyRange } from "@/lib/format";
import { channelLabel } from "@/lib/thread";
import { Tag } from "@/components/ui/Tag";
import styles from "./SupplierCard.module.css";

interface Props {
  supplier: SupplierView;
  currency: string;
  demo?: boolean;
}

/** A saved supplier. Bank and phone numbers arrive masked from the API and are never shown in full. */
export function SupplierCard({ supplier: s, currency, demo }: Props) {
  const rows: [string, string][] = [
    ["Name", [s.name, ...s.aliases].join(" · ")],
    ["Known domains", s.known_domains.join(", ") || "None saved"],
    ["Phone · masked", s.phone_hints.map((p) => `•••• ••• ${p.replace(/^ends\s*/, "")}`).join(", ") || "None saved"],
    ["Bank · last four digits", s.accounts.map((a) => a.last4).join(", ") || "None saved"],
    ["Usual amount range", s.typical_amount_max ? moneyRange(s.typical_amount_min, s.typical_amount_max, currency) : "Not set"],
  ];

  return (
    <div className={styles.group}>
      <article className={styles.card} aria-labelledby={`sup-${s.id}`}>
        {demo && <Tag tone="primary">Demo profile · Not a real identity</Tag>}
        <h3 id={`sup-${s.id}`} className={styles.name}>{s.name}</h3>
        <dl className={styles.list}>
          {rows.map(([label, value]) => (
            <div key={label} className={styles.row}>
              <dt className={styles.label}>{label}</dt>
              <dd className={styles.value}>{value}</dd>
            </div>
          ))}
        </dl>
      </article>
      <div className={styles.channels}>
        <p className={styles.channelsLabel}>Usual channels</p>
        <p>{s.usual_channels.map(channelLabel).join(" · ") || "Not set"}</p>
      </div>
    </div>
  );
}
