"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { FileText, ImagePlus, Link2, MessageSquarePlus, Paperclip, ShieldCheck } from "lucide-react";
import { ApiError, checkThread } from "@/lib/api/client";
import { BUSINESS_ID, LIMITS, SLOW_CHECK_AFTER_MS } from "@/lib/config";
import { DEMO_EXAMPLES } from "@/lib/examples";
import { plural } from "@/lib/format";
import { saveResult, saveThread, takeThread } from "@/lib/session";
import { buildRequest, emptyThread, itemIdAtPosition, newItem, validateThread, type DraftErrors, type DraftItem, type DraftKind, type SourceItem } from "@/lib/thread";
import { Banner } from "@/components/ui/Banner";
import { Button } from "@/components/ui/Button";
import { InfoCard } from "@/components/ui/Card";
import { PageIntro } from "@/components/layout/PageIntro";
import { SourceThread } from "@/components/result/SourceThread";
import { ItemCard } from "./ItemCard";
import { CheckingPanel, RecoveryPanel } from "./CheckStates";
import styles from "./CheckScreen.module.css";

type Phase = { name: "editing" } | { name: "checking"; slow: boolean } | { name: "failed"; error: ApiError };

export function CheckScreen() {
  const router = useRouter();
  // The thread survives "Back to check" (in memory) but is never written to storage.
  const [items, setItems] = useState<DraftItem[]>(() => takeThread() ?? emptyThread());
  const [errors, setErrors] = useState<DraftErrors>({});
  const [submitted, setSubmitted] = useState(false);
  const [phase, setPhase] = useState<Phase>({ name: "editing" });
  const [source, setSource] = useState<SourceItem[]>([]);
  const [pickFor, setPickFor] = useState<string | null>(null);
  const abortRef = useRef<AbortController | null>(null);
  const atLimit = items.length >= LIMITS.threadItems;
  const blocked = submitted && Object.keys(errors).length > 0;

  useEffect(() => () => abortRef.current?.abort(), []);
  useEffect(() => saveThread(items), [items]);

  function update(next: DraftItem[]) {
    setItems(next);
    if (submitted) setErrors(validateThread(next));
  }

  function add(kind: DraftKind) {
    if (atLimit) return;
    const item = newItem(kind, items.at(-1));
    update([...items, item]);
    if (kind === "image") setPickFor(item.id);
    requestAnimationFrame(() => document.getElementById(`item-${item.id}`)?.scrollIntoView({ behavior: "smooth", block: "start" }));
  }

  function move(index: number, delta: -1 | 1) {
    const next = [...items];
    const [it] = next.splice(index, 1);
    next.splice(index + delta, 0, it);
    update(next);
  }

  function applyExample(build: () => DraftItem[]) {
    setSubmitted(false);
    setErrors({});
    setItems(build());
    window.scrollTo({ top: 0, behavior: "smooth" });
  }

  async function run() {
    const { request, source: src } = buildRequest(items, BUSINESS_ID);
    setSource(src);
    const controller = new AbortController();
    abortRef.current = controller;
    setPhase({ name: "checking", slow: false });
    window.scrollTo({ top: 0 });
    const slowTimer = window.setTimeout(() => setPhase({ name: "checking", slow: true }), SLOW_CHECK_AFTER_MS);
    try {
      const decision = await checkThread(request, controller.signal);
      saveResult({ decision, source: src, checkedAt: new Date().toISOString() });
      router.push("/result/");
    } catch (err) {
      if (controller.signal.aborted) return;
      const error = err instanceof ApiError ? err : new ApiError("server", "The service could not complete this request.");
      if (error.kind === "invalid") {
        // Field problems go back to the form, on the item the backend named.
        setPhase({ name: "editing" });
        setSubmitted(true);
        const onlyImage = items.filter((i) => i.kind === "image" && i.image);
        const targetId = error.position != null ? itemIdAtPosition(items, error.position) : error.field === "image_b64" && onlyImage.length === 1 ? onlyImage[0].id : undefined;
        const field = error.field === "image_b64" || error.field === "mime_type" ? "image_b64" : error.field === "filename" ? "fileName" : error.field ?? "form";
        setErrors({ ...validateThread(items), ...(targetId ? { [`${targetId}:${field}`]: error.message } : { form: error.message }) });
        requestAnimationFrame(() => targetId && document.getElementById(`item-${targetId}`)?.scrollIntoView({ block: "start" }));
      } else {
        setPhase({ name: "failed", error });
      }
    } finally {
      window.clearTimeout(slowTimer);
    }
  }

  function submit() {
    setSubmitted(true);
    const found = validateThread(items);
    setErrors(found);
    if (Object.keys(found).length > 0) {
      const first = Object.keys(found).find((k) => k !== "form")?.split(":")[0];
      requestAnimationFrame(() => (first ? document.getElementById(`item-${first}`) : document.getElementById("check-errors"))?.scrollIntoView({ block: "start" }));
      return;
    }
    run();
  }

  if (phase.name === "checking") {
    return (
      <div className={styles.narrow}>
        <PageIntro title="Checking your conversation" lede={phase.slow ? "Still checking · over 20 seconds. There is no result yet." : "No verdict has been returned yet."} />
        <CheckingPanel slow={phase.slow} />
        <InfoCard title="While you wait">
          <p>Do not click unfamiliar links, open attachments or pay under pressure.</p>
          <p className={styles.small}>Your thread remains on this page. If the check cannot finish, you can retry without rebuilding it.</p>
        </InfoCard>
        <SourceThread items={source} />
      </div>
    );
  }

  if (phase.name === "failed") {
    return (
      <div className={styles.narrow}>
        <PageIntro title="When a check cannot finish" lede="Missing checks never become SAFE. Your thread is preserved." />
        <RecoveryPanel error={phase.error} itemCount={source.length} onRetry={run} onReview={() => setPhase({ name: "editing" })} />
        <SourceThread items={source} />
      </div>
    );
  }

  return (
    <div className={styles.layout}>
      <div className={styles.main}>
        <PageIntro title="Check this conversation" lede="Add what they sent and your replies, in order. We check all the items together." />

        <section className={styles.section} aria-labelledby="thread-title">
          <div>
            <h2 id="thread-title" className={styles.sectionTitle}>Your thread · {items.length} of {LIMITS.threadItems} items</h2>
            <p className={styles.small}>Include your reply so changes in pressure can be considered.</p>
          </div>
          <ol className={styles.items}>
            {items.map((it, i) => (
              <ItemCard
                key={it.id}
                item={it}
                number={i + 1}
                total={items.length}
                errors={errors}
                disabled={false}
                autoPickImage={pickFor === it.id}
                onChange={(next) => update(items.map((x) => (x.id === it.id ? next : x)))}
                onMove={(d) => move(i, d)}
                onRemove={() => update(items.filter((x) => x.id !== it.id))}
              />
            ))}
          </ol>
          {items.length === 0 && <p className={styles.empty}>Your thread is empty. Add the first message, screenshot, link or file details below.</p>}
        </section>

        <section className={styles.section} aria-labelledby="add-title">
          <div>
            <h2 id="add-title" className={styles.subTitle}>Add in the order they happened</h2>
            <p className={styles.small}>{atLimit ? `Your thread has ${LIMITS.threadItems} items. Remove an item before adding another.` : `1–${LIMITS.threadItems} overall items.`}</p>
          </div>
          <div className={styles.addGrid}>
            <Button variant="secondary" icon={<ImagePlus aria-hidden size={20} />} onClick={() => add("image")} disabled={atLimit}>Add screenshot or image</Button>
            <Button variant="secondary" icon={<MessageSquarePlus aria-hidden size={20} />} onClick={() => add("message")} disabled={atLimit}>Add message</Button>
            <Button variant="secondary" icon={<Link2 aria-hidden size={20} />} onClick={() => add("link")} disabled={atLimit}>Add link</Button>
            <Button variant="secondary" icon={<Paperclip aria-hidden size={20} />} onClick={() => add("file")} disabled={atLimit}>Add file details</Button>
          </div>
          <p className={styles.small}>File details check only filename, type and size. File content stays on your device; it is not uploaded or read.</p>
        </section>

        <div className={styles.submit} id="check-errors">
          <p className={styles.small}>Remove passwords and PINs before checking. Only the content you choose to add is checked.</p>
          {errors.form && <Banner tone="danger" icon="alert" title={errors.form} />}
          {blocked && !errors.form && <Banner tone="danger" icon="alert" title={`${plural(Object.keys(errors).length, "field")} need attention before checking.`} />}
          <Button type="button" fullWidth icon={<ShieldCheck aria-hidden size={20} />} onClick={submit} disabled={blocked}>
            {blocked ? "Check unavailable" : "Check conversation"}
          </Button>
          <p className={styles.small}>We send the complete thread for this check. Text can take several seconds; image checks can take much longer.</p>
        </div>
      </div>

      <div className={styles.aside}>
        <InfoCard title="Before you check" icon="info">
          <p>Add incoming messages and your replies in order.</p>
          <p>Do not open a suspicious link or file to gather details.</p>
          <p className={styles.small}>URLs: up to 2,048 characters. Messages: up to 5,000 characters each.</p>
        </InfoCard>

        <InfoCard title="PDF or document?" icon="file">
          <p><strong>PDF, DOC, DOCX and other documents are not supported yet.</strong> We don&apos;t read document content.</p>
          <p>Use screenshots of the relevant pages from a trusted, already-open viewer or message, or ask the sender for screenshots.</p>
          <p className={styles.small}>Never open an unknown or suspicious file just to gather details.</p>
          <div className={styles.cardActions}>
            <Button variant="secondary" fullWidth icon={<ImagePlus aria-hidden size={20} />} onClick={() => add("image")} disabled={atLimit}>Use screenshots instead</Button>
          </div>
          <p><strong>Check a file name without opening it.</strong> Only filename, type and size are checked. File contents stay on your device.</p>
          <div className={styles.cardActions}>
            <Button variant="secondary" fullWidth icon={<FileText aria-hidden size={20} />} onClick={() => add("file")} disabled={atLimit}>Add file details</Button>
          </div>
        </InfoCard>

        <section className={styles.demos} aria-labelledby="demos-title">
          <h2 id="demos-title" className={styles.subTitle}>Demo examples</h2>
          <p className={styles.small}>Sample scenarios for testing, not real messages. The result comes from the live check.</p>
          {DEMO_EXAMPLES.map((ex) => (
            <div key={ex.id} className={styles.demo}>
              <h3 className={styles.demoTitle}>{ex.title}</h3>
              <p className={styles.small}>{ex.description}</p>
              <Button variant="secondary" fullWidth onClick={() => applyExample(ex.build)}>Use demo example</Button>
            </div>
          ))}
        </section>

        <InfoCard title="Take your time">
          <p>Code supplies the verdict. AI only helps with bounded evidence and explanation. No check can guarantee authenticity.</p>
        </InfoCard>
      </div>
    </div>
  );
}
