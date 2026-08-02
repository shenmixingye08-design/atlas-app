import type { Metadata } from "next";
import { Suspense } from "react";

import { TodayWorkPage } from "@/components/automation-first/today-work-page";
import { AtlasAppShell } from "@/components/layout/atlas-app-shell";
import { LoadingState } from "@/components/ui/loading-state";

export const metadata: Metadata = {
  title: "今日の仕事 — MINERVOT",
  description: "今日、MINERVOTが行う仕事と対応が必要な項目",
};

export default function TodayPage() {
  return (
    <AtlasAppShell active="today" width="wide">
      <Suspense fallback={<LoadingState message="今日の仕事を準備しています…" />}>
        <TodayWorkPage />
      </Suspense>
    </AtlasAppShell>
  );
}
