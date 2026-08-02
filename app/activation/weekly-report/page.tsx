import type { Metadata } from "next";

import { WeeklyReportActivationPageClient } from "@/components/activation/weekly-report-activation-page-client";

export const metadata: Metadata = {
  title: "最初の仕事 — MINERVOT",
  description: "毎週の営業レポートをWordで作成します",
};

export default function WeeklyReportActivationPage() {
  return <WeeklyReportActivationPageClient />;
}
