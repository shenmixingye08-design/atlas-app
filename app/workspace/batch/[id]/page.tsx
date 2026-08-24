import type { Metadata } from "next";
import { Suspense } from "react";

import { AtlasAppShell } from "@/components/layout/atlas-app-shell";
import { DeliverableBatchDetail } from "@/components/workspace/deliverable-batch-detail";
import { LoadingState } from "@/components/ui/loading-state";

export const metadata: Metadata = {
  title: "まとめて作成 — MINERVOT",
};

export default async function DeliverableBatchPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  return (
    <AtlasAppShell active="workspace" width="default">
      <Suspense fallback={<LoadingState />}>
        <DeliverableBatchDetail batchId={id} />
      </Suspense>
    </AtlasAppShell>
  );
}
