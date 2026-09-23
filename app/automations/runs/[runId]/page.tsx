import { Suspense } from "react";
import { auth } from "@clerk/nextjs/server";
import { redirect } from "next/navigation";

import { RunReviewPanel } from "@/components/automations/v2/run-review-panel";
import { AtlasAppShell } from "@/components/layout/atlas-app-shell";
import { LoadingState } from "@/components/ui/loading-state";
import { automationPlatformService } from "@/lib/automation-platform/service/automation-service";
import { resolveFeatureAccessContext } from "@/lib/feature-flags/resolve-context";
import { isFeatureEnabled } from "@/lib/feature-flags/access";

type PageProps = {
  params: Promise<{ runId: string }>;
};

export default async function AutomationRunPage({ params }: PageProps) {
  const { userId } = await auth();
  if (!userId) redirect("/sign-in");

  const { runId } = await params;
  const access = await resolveFeatureAccessContext();
  if (!isFeatureEnabled("automation_v2_enabled", access)) {
    redirect("/automations");
  }

  let initialRun = null;
  try {
    initialRun = await automationPlatformService.getRun(userId, runId, access);
  } catch {
    initialRun = null;
  }

  return (
    <AtlasAppShell active="automations" width="narrow">
      <Suspense fallback={<LoadingState message="実行の詳細を読み込んでいます…" />}>
        <RunReviewPanel runId={runId} initialRun={initialRun} />
      </Suspense>
    </AtlasAppShell>
  );
}
