import { notFound } from "next/navigation";

import { AtlasAppShell } from "@/components/layout/atlas-app-shell";
import { SecretaryHomeDashboard } from "@/components/home/secretary-home-dashboard";
import type { Automation } from "@/lib/automations/types";
import type { Project } from "@/lib/projects/types";

/**
 * DEV-ONLY visual preview of the post-login home shell.
 * Renders SecretaryHomeDashboard without authentication so themes can be
 * screenshot-verified locally. Returns 404 in production.
 */
export const dynamic = "force-static";

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
    executionLevel: "draft_save",
    executionMode: "standard",
    snsBatchDays: null,
    executionFlow: { templateId: "generic", steps: [] },
    destination: "none",
    enabled: true,
    lastRun: now,
    nextRun: now,
    lastWorkflowRunId: null,
    lastError: null,
    successCount: 0,
    failureCount: 0,
    runHistory: [],
    createdAt: now,
    updatedAt: now,
    ...partial,
  };
}

const SAMPLE_PROJECTS: Project[] = [
  {
    id: "preview-1",
    title: "X投稿文の作成",
    workRequest: "商品画像からX投稿文を作成",
    status: "running",
    progress: 55,
    createdAt: now,
    updatedAt: now,
    assignedEmployees: [],
    result: null,
  },
  {
    id: "preview-2",
    title: "契約書の要約",
    workRequest: "契約書PDFの要約と期限抽出",
    status: "review",
    progress: 100,
    createdAt: now,
    updatedAt: now,
    assignedEmployees: [],
    result: null,
  },
  {
    id: "preview-3",
    title: "月次レポートの作成",
    workRequest: "先月の売上データを要約",
    status: "completed",
    progress: 100,
    createdAt: now,
    updatedAt: now,
    assignedEmployees: [],
    result: null,
  },
  {
    id: "preview-4",
    title: "ブログ記事の下書き",
    workRequest: "新商品のブログ記事をWordPressへ投稿",
    status: "completed",
    progress: 100,
    createdAt: now,
    updatedAt: now,
    assignedEmployees: [],
    result: null,
  },
];

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
  }),
];

export default function DevHomePreviewPage() {
  if (process.env.NODE_ENV === "production") {
    notFound();
  }

  return (
    <AtlasAppShell active="projects" width="wide">
      <SecretaryHomeDashboard
        automations={SAMPLE_AUTOMATIONS}
        projects={SAMPLE_PROJECTS}
      />
    </AtlasAppShell>
  );
}
