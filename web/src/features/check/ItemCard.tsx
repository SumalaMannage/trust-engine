"use client";

import { useEffect, useId, useMemo, useRef, useState } from "react";
import { ImagePlus, LoaderCircle } from "lucide-react";
import { LIMITS } from "@/lib/config";
import { ACCEPTED_IMAGE_TYPES, ImageError, prepareImage } from "@/lib/image";
import { CHANNELS, directionLabel, KIND_LABEL, type DraftErrors, type DraftItem, type ImageItem } from "@/lib/thread";
import { Button } from "@/components/ui/Button";
import { DirectionToggle } from "@/components/ui/DirectionToggle";
import { Disclosure } from "@/components/ui/Disclosure";
import { SelectField, TextArea, TextField } from "@/components/ui/Field";
import styles from "./ItemCard.module.css";

interface Props {
  item: DraftItem;
  number: number;
  total: number;
  errors: DraftErrors;
  disabled: boolean;
  onChange: (item: DraftItem) => void;
  onMove: (delta: -1 | 1) => void;
  onRemove: () => void;
  autoPickImage?: boolean;
}

const IMAGE_EXT: Record<string, string> = { "image/jpeg": "JPG", "image/png": "PNG", "image/webp": "WEBP" };

function moveHint(number: number, total: number): string {
  if (total === 1) return "Only item · add another to reorder.";
  if (number === 1) return "First item · can move down.";
  if (number === total) return "Last item · can move up.";
  return "Can move up or down.";
}

export function ItemCard({ item, number, total, errors, disabled, onChange, onMove, onRemove, autoPickImage }: Props) {
  const err = (field: string) => errors[`${item.id}:${field}`];
  const title = `Item ${number} · ${KIND_LABEL[item.kind]}${item.kind === "message" ? ` · ${directionLabel(item.direction)}` : ""}`;

  return (
    <li className={styles.card} id={`item-${item.id}`} aria-labelledby={`title-${item.id}`}>
      <h3 id={`title-${item.id}`} className={styles.title}>{title}</h3>

      {item.kind === "image" && <ImageBody item={item} error={err("image_b64")} disabled={disabled} onChange={onChange} autoPick={autoPickImage} />}

      <DirectionToggle name={`direction-${item.id}`} legend={`Who sent item ${number}?`} value={item.direction} disabled={disabled} onChange={(direction) => onChange({ ...item, direction })} />

      {item.kind === "message" && (
        <>
          <SelectField
            label="Channel"
            hint={item.direction === "inbound" ? "WhatsApp, SMS, phone, LinkedIn, web or other." : "Your reply on the same channel."}
            value={item.channel}
            disabled={disabled}
            onChange={(e) => onChange({ ...item, channel: e.target.value as typeof item.channel })}
          >
            {CHANNELS.map((c) => <option key={c.value} value={c.value}>{c.label}</option>)}
          </SelectField>
          <TextField
            label="Sender email or phone"
            optional={item.direction === "outbound"}
            hint={item.direction === "inbound" ? "Include the address or number, not just their display name." : "Optional for your outgoing reply."}
            placeholder={item.direction === "inbound" ? "Enter address or number, if known" : "Me · not supplied"}
            value={item.sender}
            error={err("sender")}
            disabled={disabled}
            autoComplete="off"
            onChange={(e) => onChange({ ...item, sender: e.target.value })}
          />
          <TextArea
            label="Message text"
            counter={{ length: item.text.length, max: LIMITS.messageChars }}
            hint="Include the whole message."
            placeholder={item.direction === "inbound" ? "Paste what they sent" : "Paste what you replied"}
            value={item.text}
            error={err("text")}
            disabled={disabled}
            onChange={(e) => onChange({ ...item, text: e.target.value })}
          />
          {item.direction === "inbound" && (
            <Disclosure title="Extra details" defaultOpen={Boolean(item.claimedEntity || item.attachmentNames)}>
              <TextField
                label="Claimed entity"
                optional
                hint="Who they say they are, such as a supplier or bank."
                value={item.claimedEntity}
                error={err("claimedEntity")}
                disabled={disabled}
                onChange={(e) => onChange({ ...item, claimedEntity: e.target.value })}
              />
              <TextField
                label="Attachment names"
                optional
                hint="Separate names with commas. Do not open attachments to find them."
                value={item.attachmentNames}
                error={err("attachmentNames")}
                disabled={disabled}
                autoComplete="off"
                onChange={(e) => onChange({ ...item, attachmentNames: e.target.value })}
              />
            </Disclosure>
          )}
        </>
      )}

      {item.kind === "image" && item.image && (
        <TextField
          label="Expected amount"
          optional
          hint="How much should you have received? Optional for this image."
          placeholder="Add amount, if relevant"
          inputMode="decimal"
          value={item.expectedAmount}
          error={err("expectedAmount")}
          disabled={disabled}
          onChange={(e) => onChange({ ...item, expectedAmount: e.target.value })}
        />
      )}

      {item.kind === "link" && (
        <TextField
          label="Link URL"
          counter={item.url.length > 200 ? { length: item.url.trim().length, max: LIMITS.urlChars } : undefined}
          hint={item.url.length > 200 ? "Do not visit it." : `Paste the URL without visiting it. Up to ${LIMITS.urlChars.toLocaleString()} characters.`}
          placeholder="Paste URL without visiting it"
          inputMode="url"
          value={item.url}
          error={err("url")}
          disabled={disabled}
          autoComplete="off"
          onChange={(e) => onChange({ ...item, url: e.target.value })}
        />
      )}

      {item.kind === "file" && (
        <>
          <TextField label="File name" hint="Do not open the file to find its name." placeholder="Paste the filename" value={item.fileName} error={err("fileName") ?? err("filename")} disabled={disabled} autoComplete="off" onChange={(e) => onChange({ ...item, fileName: e.target.value })} />
          <TextField label="File type" optional hint="For example: PDF or VBS." placeholder="Type or extension, if known" value={item.fileType} disabled={disabled} autoComplete="off" onChange={(e) => onChange({ ...item, fileType: e.target.value })} />
          <TextField label="File size" optional hint="Metadata only. File contents stay on your device." placeholder="Size, if known" value={item.fileSize} error={err("fileSize")} disabled={disabled} autoComplete="off" onChange={(e) => onChange({ ...item, fileSize: e.target.value })} />
        </>
      )}

      <div className={styles.controls}>
        <div className={styles.move}>
          <Button variant="secondary" onClick={() => onMove(-1)} disabled={disabled || number === 1}>Move up</Button>
          <Button variant="secondary" onClick={() => onMove(1)} disabled={disabled || number === total}>Move down</Button>
        </div>
        <p className={styles.hint}>{moveHint(number, total)}</p>
        <Button variant="secondary" fullWidth onClick={onRemove} disabled={disabled}>Remove item</Button>
      </div>
    </li>
  );
}

function ImageBody({ item, error, disabled, onChange, autoPick }: { item: ImageItem; error?: string; disabled: boolean; onChange: (i: DraftItem) => void; autoPick?: boolean }) {
  const inputId = useId();
  const inputRef = useRef<HTMLInputElement>(null);
  const [localError, setLocalError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const shown = localError ?? error;
  const preview = useMemo(() => (item.image ? `data:${item.image.mime};base64,${item.image.base64}` : null), [item.image]);

  useEffect(() => {
    if (autoPick) inputRef.current?.click();
  }, [autoPick]);

  async function handleFile(file: File | undefined) {
    if (!file) return;
    setBusy(true);
    setLocalError(null);
    try {
      onChange({ ...item, image: await prepareImage(file) });
    } catch (e) {
      setLocalError(e instanceof ImageError ? e.message : "This image could not be read. Choose another JPEG, PNG or WEBP.");
    } finally {
      setBusy(false);
      if (inputRef.current) inputRef.current.value = "";
    }
  }

  return (
    <div className={styles.imageBody}>
      <p className={item.image ? styles.ready : styles.waiting}>{item.image ? "Ready to check · Not yet checked" : "No image chosen yet"}</p>
      <div className={[styles.imageBox, shown && styles.imageInvalid].filter(Boolean).join(" ")}>
        <p className={styles.imageLabel}>Image</p>
        {item.image ? (
          <p className={styles.imageName}>{item.image.name} · {IMAGE_EXT[item.image.mime]}</p>
        ) : (
          <p className={styles.imageName}>Read message from screenshot or image</p>
        )}
        <p id={`${inputId}-help`} className={shown ? styles.error : styles.hint} role={shown ? "alert" : undefined}>
          {shown ?? "JPEG, PNG or WEBP. Decoded image: 5 MB or less."}
        </p>
      </div>
      {preview && (
        // A data URL preview of the owner's own image; next/image adds nothing in a static export.
        // eslint-disable-next-line @next/next/no-img-element
        <img src={preview} alt={`Preview of ${item.image!.name}`} className={styles.preview} />
      )}
      {item.image && <p className={styles.hint}>We&apos;ll read the message from your image. A payment slip is not proof of payment.</p>}
      {shown && <p className={styles.hint}>Do not open a suspicious attachment to convert it. Choose an image already on your device.</p>}

      <input
        ref={inputRef}
        id={inputId}
        type="file"
        accept={ACCEPTED_IMAGE_TYPES.join(",")}
        className="visually-hidden"
        disabled={disabled || busy}
        aria-describedby={`${inputId}-help`}
        onChange={(e) => handleFile(e.target.files?.[0])}
      />
      <div className={styles.imageActions}>
        <label htmlFor={inputId} className={styles.pick} aria-disabled={disabled || busy || undefined}>
          {busy ? <LoaderCircle className={styles.spin} aria-hidden size={20} /> : <ImagePlus aria-hidden size={20} />}
          {busy ? "Preparing image…" : item.image ? "Replace image" : shown ? "Choose another image" : "Choose an image"}
        </label>
        {item.image && (
          <Button variant="secondary" fullWidth onClick={() => { setLocalError(null); onChange({ ...item, image: null, expectedAmount: "" }); }} disabled={disabled}>
            Remove image
          </Button>
        )}
      </div>
    </div>
  );
}
