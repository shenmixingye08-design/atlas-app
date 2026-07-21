import type { Metadata } from "next";

import { AtlasAppShell } from "@/components/layout/atlas-app-shell";
import { ResultsView } from "@/components/results/results-view";

export const metadata: Metadata = {
  title: "結果 | ATLAS",
  description: "通知から成果物・実行結果を表示します",
};

type ResultPageProps = {
  params: Promise<{ notificationId: string }>;
};

/**
 * Unified result route. Canonical destination of every「結果を見る」button:
 * `/results/<notificationId>` resolves the exact outcome from the notification
 * (auth + ownership on the server) and renders the 成果物 directly.
 */
export default async function ResultPage({ params }: ResultPageProps) {
  const { notificationId } = await params;

  return (
    <AtlasAppShell width="default">
      <ResultsView notificationId={notificationId} />
    </AtlasAppShell>
  );
}
