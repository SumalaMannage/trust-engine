import type { Metadata } from "next";
import { RecordsView } from "@/features/records/RecordsView";

export const metadata: Metadata = { title: "Your records" };

export default function RecordsPage() {
  return <RecordsView />;
}
