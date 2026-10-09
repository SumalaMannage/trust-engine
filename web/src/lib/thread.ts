import { LIMITS } from "@/lib/config";
import type { Channel, CheckRequest, Direction, ThreadItem } from "@/lib/api/types";
import type { PreparedImage } from "@/lib/image";

/*
 * The thread the owner builds on the Check screen: ordered items, sent to the backend in exactly
 * this order. Order matters: the backend reports findings by position and detects escalation
 * (pressure after the owner said no) from what comes after an owner reply.
 */

interface Base {
  id: string;
  direction: Direction;
}

export interface MessageItem extends Base {
  kind: "message";
  channel: Channel;
  sender: string;
  text: string;
  claimedEntity: string;
  attachmentNames: string;      // comma separated in the UI
}

export interface ImageItem extends Base {
  kind: "image";
  image: PreparedImage | null;
  expectedAmount: string;
}

export interface LinkItem extends Base {
  kind: "link";
  url: string;
}

export interface FileItem extends Base {
  kind: "file";
  fileName: string;
  fileType: string;
  fileSize: string;
}

export type DraftItem = MessageItem | ImageItem | LinkItem | FileItem;
export type DraftKind = DraftItem["kind"];

/** One line of the checked thread, kept for the result screen (never the image bytes). */
export interface SourceItem {
  number: number;
  kind: DraftKind;
  direction: Direction;
  meta: string;                 // "From them · Email", "Image · PNG", "File details"
  text: string;
}

export const CHANNELS: { value: Channel; label: string }[] = [
  { value: "email", label: "Email" },
  { value: "whatsapp", label: "WhatsApp" },
  { value: "sms", label: "SMS" },
  { value: "phone", label: "Phone" },
  { value: "linkedin", label: "LinkedIn" },
  { value: "web", label: "Web" },
  { value: "other", label: "Other" },
];

export function channelLabel(channel: Channel): string {
  return CHANNELS.find((c) => c.value === channel)?.label ?? "Other";
}

export const KIND_LABEL: Record<DraftKind, string> = {
  message: "Message",
  image: "Screenshot / image",
  link: "Link",
  file: "File details",
};

export function directionLabel(d: Direction): string {
  return d === "inbound" ? "From them" : "From me";
}

let counter = 0;
function newId(): string {
  counter += 1;
  return `i${Date.now().toString(36)}${counter}`;
}

export function newItem(kind: DraftKind, previous?: DraftItem, id: string = newId()): DraftItem {
  const base = { id, direction: "inbound" as Direction };
  switch (kind) {
    case "message": {
      const prevChannel = [previous].find((p): p is MessageItem => p?.kind === "message")?.channel;
      // Conversations alternate, so a message after one of theirs defaults to the owner's reply.
      const direction: Direction = previous?.kind === "message" && previous.direction === "inbound" ? "outbound" : "inbound";
      return { ...base, kind, direction, channel: prevChannel ?? "email", sender: "", text: "", claimedEntity: "", attachmentNames: "" };
    }
    case "image":
      return { ...base, kind, image: null, expectedAmount: "" };
    case "link":
      return { ...base, kind, url: "" };
    case "file":
      return { ...base, kind, fileName: "", fileType: "", fileSize: "" };
  }
}

/**
 * The starting item is pre-rendered at build time and hydrated in the browser, so its id must be the
 * same in both. Items added later only exist in the browser and can use generated ids.
 */
export function emptyThread(): DraftItem[] {
  return [newItem("message", undefined, "first")];
}

// ---------- validation ----------

/** Keys are `${itemId}:${field}`, or "form" for the whole thread. */
export type DraftErrors = Record<string, string>;

export function parseAmount(value: string): number | null {
  const n = Number(value.replace(/[,\s]/g, "").replace(/^(rs|lkr)\.?/i, ""));
  return value.trim() && Number.isFinite(n) && n >= 0 ? n : null;
}

/** "18 KB", "2.4 MB", "1200" (bytes) -> bytes. */
export function parseSize(value: string): number | null {
  const m = value.trim().match(/^(\d+(?:\.\d+)?)\s*(b|bytes?|kb|k|mb|m|gb|g)?$/i);
  if (!m) return null;
  const unit = (m[2] ?? "b").toLowerCase()[0];
  const mult = unit === "k" ? 1024 : unit === "m" ? 1024 ** 2 : unit === "g" ? 1024 ** 3 : 1;
  return Math.round(Number(m[1]) * mult);
}

export function overBy(text: string, max: number): number {
  return Math.max(0, text.length - max);
}

function isEmpty(item: DraftItem): boolean {
  switch (item.kind) {
    case "message": return !item.text.trim();
    case "image": return !item.image;
    case "link": return !item.url.trim();
    case "file": return !item.fileName.trim();
  }
}

export function validateThread(items: DraftItem[]): DraftErrors {
  const errors: DraftErrors = {};
  for (const it of items) {
    const k = (f: string) => `${it.id}:${f}`;
    if (it.kind === "message") {
      const over = overBy(it.text, LIMITS.messageChars);
      if (over) errors[k("text")] = `Message text must be ${LIMITS.messageChars.toLocaleString()} characters or fewer. Remove ${over.toLocaleString()} characters before checking.`;
      if (it.sender.length > LIMITS.senderChars) errors[k("sender")] = "This is too long for an email address or phone number.";
      if (it.claimedEntity.length > 120) errors[k("claimedEntity")] = "Keep the name under 120 characters.";
      if (it.attachmentNames.split(",").filter((s) => s.trim()).length > 10) errors[k("attachmentNames")] = "List up to 10 attachment names.";
    }
    if (it.kind === "image" && it.expectedAmount.trim() && parseAmount(it.expectedAmount) === null) {
      errors[k("expectedAmount")] = "Enter the amount as a number, such as 120000.";
    }
    if (it.kind === "link" && it.url.trim()) {
      const over = overBy(it.url.trim(), LIMITS.urlChars);
      if (over) errors[k("url")] = `Shorten the URL by ${over.toLocaleString()} characters. Do not visit it.`;
      else if (/\s/.test(it.url.trim())) errors[k("url")] = "Paste one link address, with no spaces.";
    }
    if (it.kind === "file") {
      if (it.fileName.length > LIMITS.fileNameChars) errors[k("fileName")] = "This file name is too long.";
      if (it.fileSize.trim() && parseSize(it.fileSize) === null) errors[k("fileSize")] = "Enter a size such as 18 KB or 2 MB.";
    }
  }
  const filled = items.filter((i) => !isEmpty(i));
  if (!filled.some((i) => i.direction === "inbound")) {
    errors.form = "Add at least one item from them: a message, screenshot, link or file details.";
  }
  if (items.length > LIMITS.threadItems) {
    errors.form = `This check accepts up to ${LIMITS.threadItems} items. Remove an item before checking.`;
  }
  return errors;
}

// ---------- request ----------

const TYPE_TO_MIME: Record<string, string> = {
  pdf: "application/pdf", doc: "application/msword", docx: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  xls: "application/vnd.ms-excel", xlsx: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  jpg: "image/jpeg", jpeg: "image/jpeg", png: "image/png", zip: "application/zip", html: "text/html", htm: "text/html",
  exe: "application/x-msdownload", vbs: "application/vbscript", hta: "application/hta", sh: "application/x-sh",
};

/** "PDF", ".vbs" or "application/pdf" -> a MIME type the backend can compare, or null. */
function toMime(fileType: string): string | null {
  const t = fileType.trim().toLowerCase().replace(/^\./, "");
  if (!t) return null;
  if (t.includes("/")) return t;
  return TYPE_TO_MIME[t.split(/\s+/)[0]] ?? null;
}

const IMAGE_EXT: Record<string, string> = { "image/jpeg": "JPG", "image/png": "PNG", "image/webp": "WEBP" };

/** Empty items are skipped; numbering in the summary matches the backend's thread positions. */
export function buildRequest(items: DraftItem[], businessId: string): { request: CheckRequest; source: SourceItem[] } {
  const thread: ThreadItem[] = [];
  const source: SourceItem[] = [];
  for (const it of items) {
    if (isEmpty(it)) continue;
    const number = thread.length + 1;
    const who = directionLabel(it.direction);
    switch (it.kind) {
      case "message": {
        const sender = it.sender.trim();
        const attachments = it.attachmentNames.split(",").map((s) => s.trim()).filter(Boolean);
        thread.push({
          kind: "message", text: it.text.trim(), channel: it.channel, direction: it.direction,
          ...(sender ? { sender } : {}),
          ...(it.claimedEntity.trim() ? { claimed_entity: it.claimedEntity.trim() } : {}),
          ...(attachments.length ? { attachment_names: attachments } : {}),
        });
        source.push({ number, kind: it.kind, direction: it.direction, meta: `${who} · ${channelLabel(it.channel)}`, text: [sender, it.text.trim()].filter(Boolean).join("\n") });
        break;
      }
      case "image": {
        const img = it.image!;
        const amount = parseAmount(it.expectedAmount);
        thread.push({ kind: "image", image_b64: img.base64, mime_type: img.mime, expected_amount: amount, direction: it.direction });
        source.push({ number, kind: it.kind, direction: it.direction, meta: `Image · ${IMAGE_EXT[img.mime]} · ${who}`, text: img.name + (amount != null ? ` · Expected amount ${amount.toLocaleString("en-LK")}` : "") });
        break;
      }
      case "link":
        thread.push({ kind: "url", url: it.url.trim(), direction: it.direction });
        source.push({ number, kind: it.kind, direction: it.direction, meta: `Link · ${who}`, text: `${it.url.trim()}\nNot visited.` });
        break;
      case "file": {
        const size = parseSize(it.fileSize);
        thread.push({ kind: "file", filename: it.fileName.trim(), mime_type: toMime(it.fileType), size_bytes: size, direction: it.direction });
        const extra = [it.fileType.trim(), it.fileSize.trim()].filter(Boolean).join(" · ");
        source.push({ number, kind: it.kind, direction: it.direction, meta: `File details · ${who}`, text: `${it.fileName.trim()}${extra ? ` · ${extra}` : ""}\nMetadata only; not uploaded or opened.` });
        break;
      }
    }
  }
  return { request: { business_id: businessId, thread }, source };
}

/** Which draft item a backend thread position refers to (empty items are not sent). */
export function itemIdAtPosition(items: DraftItem[], position: number): string | undefined {
  return items.filter((i) => !isEmpty(i))[position]?.id;
}
