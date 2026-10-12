import type { Metadata } from "next";
import { StatusMonitor } from "@/features/status/StatusMonitor";

// Internal tool: not linked from the main navigation and kept out of search results.
export const metadata: Metadata = { title: "System status", robots: { index: false, follow: false } };

export default function StatusPage() {
  return <StatusMonitor />;
}
