import { Suspense } from "react";
import { auth } from "@clerk/nextjs/server";
import { redirect } from "next/navigation";

import { RunReviewPanel } from "@/components/automations/v2/run-review-panel";
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
    <main className="min-h-dvh bg-[var(--background)] text-[var(--foreground)]">
      <Suspense fallback={<p className="p-4 text-sm">読み込み中…</p>}>
        <RunReviewPanel runId={runId} initialRun={initialRun} />
      </Suspense>
    </main>
  );
}
