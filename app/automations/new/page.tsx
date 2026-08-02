import type { Metadata } from "next";
import { Suspense } from "react";

import { AutomationCreateWizard } from "@/components/automations/v2/automation-create-wizard";
import { LoadingState } from "@/components/ui/loading-state";

export const metadata: Metadata = {
  title: "仕事を任せる — MINERVOT",
  description: "MINERVOTに仕事を引き継ぎます。専門知識は不要です。",
};

function WizardEntry({
  searchParams,
}: {
  searchParams: { draft?: string; seed?: string };
}) {
  return (
    <AutomationCreateWizard
      initialDraftId={searchParams.draft ?? null}
      seedText={searchParams.seed ?? null}
    />
  );
}

export default async function NewAutomationPage({
  searchParams,
}: {
  searchParams: Promise<{ draft?: string; seed?: string }>;
}) {
  const params = await searchParams;
  return (
    <Suspense fallback={<LoadingState />}>
      <WizardEntry searchParams={params} />
    </Suspense>
  );
}
