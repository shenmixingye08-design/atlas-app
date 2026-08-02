import type { Metadata } from "next";
import { notFound } from "next/navigation";

import { AutomationFirstPreviewClient } from "@/components/automation-first/preview-client";
import { checkAtlasOwner } from "@/lib/auth/require-atlas-owner";
import type { Automation } from "@/lib/automations/types";
import type { Project } from "@/lib/projects/types";

/**
 * DEV-ONLY design sandbox (theme toggles + fixture data).
 * - Production: 404
 * - Non-production: owner-only (or open when ATLAS_DEV_PREVIEW_OPEN=1 for local design)
 *
 * Formal post-login home is `/projects` (ProjectsDashboard → AutomationFirstHome).
 * Do not treat this route as the product home. Normal users never need this URL.
 */
export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Automation First Preview (dev)",
  robots: { index: false, follow: false, nocache: true },
};

const now = new Date().toISOString();

function sampleAutomation(
  partial: Partial<Automation> & Pick<Automation, "id" | "name" | "status">,
): Automation {
  return {
    userId: null,
    description: "",
    schedule: {
      kind: "schedule",
      preset: { type: "daily", hour: 9, minute: 0 },
      timezone: "Asia/Tokyo",
      label: "毎日 9:00",
    },
    workflow: { assignment: partial.workflow?.assignment ?? "習慣の仕事" },
    timing: { startDate: null, endCondition: { type: "never" } },
    executionLevel: "approve_then_run",
    executionMode: "standard",
    snsBatchDays: null,
    executionFlow: { templateId: "generic", steps: [] },
    destination: "none",
    enabled: true,
    lastRun: now,
    nextRun: now,
    lastWorkflowRunId: null,
    lastError: null,
    successCount: 3,
    failureCount: 0,
    runHistory: [],
    createdAt: now,
    updatedAt: now,
    ...partial,
  };
}

const SAMPLE_AUTOMATIONS: Automation[] = [
  sampleAutomation({
    id: "auto-preview-1",
    name: "毎朝メール要約",
    status: "running",
    schedule: {
      kind: "schedule",
      preset: { type: "daily", hour: 8, minute: 0 },
      timezone: "Asia/Tokyo",
      label: "毎日 8:00",
    },
    workflow: { assignment: "未読メールを要約して返信案を作成" },
  }),
  sampleAutomation({
    id: "auto-preview-2",
    name: "金曜の営業資料",
    status: "idle",
    schedule: {
      kind: "schedule",
      preset: { type: "weekly", dayOfWeek: 5, hour: 18, minute: 0 },
      timezone: "Asia/Tokyo",
      label: "毎週金曜 18:00",
    },
    executionLevel: "full_auto",
  }),
  sampleAutomation({
    id: "auto-preview-3",
    name: "毎日18時 X投稿",
    status: "failed",
    schedule: {
      kind: "schedule",
      preset: { type: "daily", hour: 18, minute: 0 },
      timezone: "Asia/Tokyo",
      label: "毎日 18:00",
    },
    workflow: { assignment: "SNS投稿文を作成してXへ投稿" },
    executionFlow: { templateId: "sns_post", steps: [] },
    executionLevel: "full_auto",
    failureCount: 1,
  }),
];

const SAMPLE_PROJECTS: Project[] = [];

export default async function DevAutomationFirstPreviewPage() {
  if (process.env.NODE_ENV === "production" || process.env.VERCEL_ENV === "production") {
    notFound();
  }

  const openLocal =
    process.env.ATLAS_DEV_PREVIEW_OPEN === "1" ||
    process.env.ATLAS_DEV_PREVIEW_OPEN === "true";
  if (!openLocal) {
    const isOwner = await checkAtlasOwner();
    if (!isOwner) {
      notFound();
    }
  }

  return (
    <AutomationFirstPreviewClient
      automations={SAMPLE_AUTOMATIONS}
      projects={SAMPLE_PROJECTS}
    />
  );
}
