"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { Plus } from "lucide-react";
import { plural } from "@/lib/format";
import { locationLabel, sortEvidence } from "@/lib/labels";
import { clearThread, useStoredResult } from "@/lib/session";
import { Banner } from "@/components/ui/Banner";
import { Button, ButtonLink } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { PageIntro } from "@/components/layout/PageIntro";
import { ActionsList } from "@/components/result/ActionsList";
import { EvidenceCard } from "@/components/result/EvidenceCard";
import { ImageReadCard } from "@/components/result/ImageReadCard";
import { SourceThread } from "@/components/result/SourceThread";
import { VerdictCard } from "@/components/result/VerdictCard";
import styles from "./ResultView.module.css";

export function ResultView() {
  const router = useRouter();
  const result = useStoredResult();

  // Move focus to the verdict so screen readers announce the result first.
  useEffect(() => {
    if (result) document.getElementById("verdict")?.focus({ preventScroll: true });
  }, [result]);

  if (result === undefined) {
    return <p className={styles.loading}>Loading your result…</p>;
  }

  if (result === null) {
    return (
      <div className={styles.narrow}>
        <PageIntro title="No check to show" />
        <Card>
          <p>Results stay only in this browser tab, and the server keeps no history between requests. Start a new check to see a result here.</p>
          <ButtonLink href="/" variant="primary" fullWidth>Start a check</ButtonLink>
        </Card>
      </div>
    );
  }

  const { decision: d, source } = result;
  const findings = sortEvidence(d.evidence.filter((e) => e.weight > 0));
  const advice = d.evidence.filter((e) => e.weight === 0);
  const injection = d.evidence.find((e) => e.rule_id === "INJECTION");
  const referenced = new Set(d.evidence.map((e) => e.thread_index).filter((i): i is number => i != null));

  function checkAnother() {
    clearThread();
    router.push("/");
  }

  return (
    <div className={styles.layout}>
      <div className={styles.main}>
        <PageIntro title="Your conversation check" lede={`${plural(source.length, "source item")} · ${plural(findings.length, "finding")}`} />

        <VerdictCard state={d.state} headline={d.headline} explanation={d.explanation} />
        <p className={styles.small}>
          Trust Engine offers guidance, not a guarantee of safety or payment authenticity. Confirm independently before paying or handing over goods.
        </p>

        <ActionsList actions={d.actions} />

        {d.escalation_detected && <Banner tone="danger" title="They pushed harder after you said no" />}
        {d.injection_attempt_detected && (
          <Banner tone="danger" icon="alert" title="This message tried to trick AI checkers">
            {injection ? `${locationLabel(injection, source).split(" · ")[0]} contains instructions aimed at the checker. ` : ""}
            It is treated as untrusted message content, not an instruction.
          </Banner>
        )}
        {d.explanation_source === "template" && d.state !== "SAFE" && (
          <Banner tone="warning" title="Standard explanation used">
            This result uses a standard explanation. Read the evidence and next steps; the verdict is unchanged.
          </Banner>
        )}

        {d.image_reads.map((r) => <ImageReadCard key={r.index} read={r} source={source} />)}

        {advice.map((e) => (
          <Card key={e.id} muted aria-label={e.title}>
            <h2 className={styles.cardTitle}>{e.rule_id === "SLIP_NOT_PROOF" ? "Payment slip advice · not a scored finding" : `${e.title} · not a scored finding`}</h2>
            <p>{e.title}.</p>
            <p className={styles.small}>Info · 0 weight. {e.detail || "Confirm independently before acting."}</p>
          </Card>
        ))}

        {d.positives.length > 0 && (
          <Card aria-labelledby="matched-title">
            <h2 id="matched-title" className={styles.cardTitle}>What matched your records</h2>
            <ul className={styles.plainList}>
              {d.positives.map((p) => <li key={p}>{p}</li>)}
            </ul>
            <p className={styles.small}>These are profile comparisons, not a verified identity or a confirmed transfer.</p>
          </Card>
        )}

        <section className={styles.section} aria-labelledby="findings-title">
          <h2 id="findings-title" className={styles.sectionTitle}>
            {findings.length > 0 ? `Why this needs attention · ${plural(findings.length, "finding")}` : "Detailed evidence · 0 findings"}
          </h2>
          <p className={styles.small}>Evidence is ordered by severity, then weight. The verdict is supplied by code; AI only contributes bounded observations and explanation.</p>
          {findings.length === 0 ? (
            <Card>
              <p>No scored red flags were found in this thread. This does not establish that the sender or payment is genuine.</p>
            </Card>
          ) : (
            findings.map((e) => <EvidenceCard key={e.id} evidence={e} location={locationLabel(e, source)} />)
          )}
        </section>

        <Button variant="secondary" fullWidth icon={<Plus aria-hidden size={20} />} onClick={checkAnother}>
          Check another conversation
        </Button>
      </div>

      <div className={styles.aside}>
        <SourceThread items={source} referenced={referenced} footnote="Demo records are illustrative, not verified identities." />
      </div>
    </div>
  );
}
