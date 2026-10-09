import { newItem, type DraftItem, type FileItem, type MessageItem } from "@/lib/thread";
import type { Channel, Direction } from "@/lib/api/types";

/*
 * Demo scenarios for testing. Each matches the demo_bakery profile in data/profile_demo_bakery.json.
 * Verdicts come from the backend; these only fill in the thread.
 */

function msg(direction: Direction, channel: Channel, text: string, extra: Partial<MessageItem> = {}): MessageItem {
  return { ...(newItem("message") as MessageItem), direction, channel, text, ...extra };
}

function file(fileName: string, fileType: string, fileSize: string): FileItem {
  return { ...(newItem("file") as FileItem), fileName, fileType, fileSize };
}

export interface DemoExample {
  id: string;
  title: string;
  description: string;
  build: () => DraftItem[];
}

export const DEMO_EXAMPLES: DemoExample[] = [
  {
    id: "cake-shop",
    title: "Cake shop scam",
    description: "A meeting link, disguised file and pressure after refusal.",
    build: () => [
      msg("inbound", "linkedin", "Hi, I want a custom wedding cake. Join to discuss: https://zoom-meeting-join.com/j/8812.vbs"),
      msg("outbound", "linkedin", "I can't download that. Can we use WhatsApp?"),
      msg("inbound", "linkedin", "No, you must use my link. Pay the advance fee within 2 hours or the order is cancelled. Update Reader to view the PDF."),
      file("Cake_Design.pdf.vbs", "VBS", "18 KB"),
    ],
  },
  {
    id: "bank-change",
    title: "Supplier bank change",
    description: "A new sender address and changed account details.",
    build: () => [
      msg("inbound", "email", "Our bank details have changed. Please pay invoice 4471 today to account 7731 0042 9910.", {
        sender: "ABC Flour <accounts@abcflour-pay.com>",
        claimedEntity: "ABC Flour",
      }),
      msg("outbound", "email", "I'd prefer to call you first."),
    ],
  },
  {
    id: "ordinary",
    title: "Ordinary supplier message",
    description: "A routine invoice; confirm payments independently.",
    build: () => [
      msg("inbound", "email", "Your usual flour order is ready. Invoice 4471 is Rs 85,000. Please use the existing account ending 8231.", {
        sender: "ABC Flour <accounts@abcflour.example>",
      }),
      msg("outbound", "email", "Thank you. I'll confirm the payee in my banking app before paying."),
    ],
  },
];
