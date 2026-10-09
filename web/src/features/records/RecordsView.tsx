"use client";

import { useEffect, useState } from "react";
import { ApiError, getBusiness } from "@/lib/api/client";
import type { BusinessView } from "@/lib/api/types";
import { BUSINESS_ID, IS_DEMO } from "@/lib/config";
import { Banner } from "@/components/ui/Banner";
import { Button } from "@/components/ui/Button";
import { Card, InfoCard } from "@/components/ui/Card";
import { PageIntro } from "@/components/layout/PageIntro";
import { SupplierCard } from "@/components/profile/SupplierCard";
import styles from "./RecordsView.module.css";

type State = { status: "loading" } | { status: "error"; message: string } | { status: "ready"; business: BusinessView };

/** Read-only view of the records each check is compared with. Numbers arrive masked from the API. */
export function RecordsView() {
  const [state, setState] = useState<State>({ status: "loading" });
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    const controller = new AbortController();
    getBusiness(BUSINESS_ID, controller.signal)
      .then((business) => setState({ status: "ready", business }))
      .catch((err) => {
        if (controller.signal.aborted) return;
        setState({ status: "error", message: err instanceof ApiError ? err.message : "Could not load your records." });
      });
    return () => controller.abort();
  }, [attempt]);

  return (
    <div className={styles.page}>
      <PageIntro title="Your records" lede={`Read-only context used to compare messages. This is the ${BUSINESS_ID} business profile, not a list of past checks.`} />

      {state.status === "loading" && <p className={styles.muted}>Loading your records…</p>}
      {state.status === "error" && (
        <>
          <Banner tone="danger" icon="alert" title={state.message}>We cannot show your records right now. Try again later.</Banner>
          <Button variant="secondary" fullWidth onClick={() => { setState({ status: "loading" }); setAttempt((a) => a + 1); }}>Try again</Button>
        </>
      )}

      {state.status === "ready" && (
        <>
          <Card>
            <h2 className={styles.business}>{state.business.name}</h2>
            <p>Business ID: {state.business.business_id}</p>
            {IS_DEMO && <p className={styles.muted}>Demo profile · Illustrative suppliers and normal payment patterns. These are not real verified businesses.</p>}
            <p className={styles.strong}>Read-only · No supplier changes can be made here</p>
          </Card>

          <section className={styles.suppliers} aria-label="Saved suppliers">
            {state.business.suppliers.map((s) => (
              <SupplierCard key={s.id} supplier={s} currency={state.business.currency} demo={IS_DEMO} />
            ))}
          </section>

          <InfoCard title="How these records help" icon="info">
            <p>Checks can compare a sender domain, account ending and payment amount with the existing business profile. A matching name is not proof of identity.</p>
            <p className={styles.muted}>Records are display-only. The server has no conversation history between requests.</p>
          </InfoCard>
        </>
      )}
    </div>
  );
}
