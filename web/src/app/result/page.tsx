import type { Metadata } from "next";
import { ResultView } from "@/features/result/ResultView";

export const metadata: Metadata = { title: "Your conversation check" };

export default function ResultPage() {
  return <ResultView />;
}
