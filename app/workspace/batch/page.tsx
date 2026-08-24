import type { Metadata } from "next";
import { Suspense } from "react";
import Link from "next/link";

import { AtlasAppShell } from "@/components/layout/atlas-app-shell";
import { LoadingState } from "@/components/ui/loading-state";
import { DeliverableBatchList } from "@/components/workspace/deliverable-batch-list";

export const metadata: Metadata = {
  title: "まとめて作成一覧 — MINERVOT",
};

export default function DeliverableBatchListPage() {
  return (
    <AtlasAppShell active="workspace" width="default">
      <Suspense fallback={<LoadingState />}>
        <div className="mx-auto max-w-3xl space-y-4 overflow-x-hidden pb-[max(1.5rem,env(safe-area-inset-bottom))]">
          <header className="space-y-2">
            <p className="text-caption text-accent">まとめて作成</p>
            <h1 className="text-xl font-semibold">納品一覧</h1>
            <Link
              href="/workspace?mode=batch"
              className="inline-flex min-h-[44px] items-center text-sm text-accent"
            >
              成果物をまとめて作る
            </Link>
          </header>
          <DeliverableBatchList />
        </div>
      </Suspense>
    </AtlasAppShell>
  );
}
