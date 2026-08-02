import type { Metadata } from "next";
import { notFound } from "next/navigation";

import { ValueHomeDashboard } from "@/components/home/value/value-home-dashboard";

export const metadata: Metadata = {
  title: "Value Home Preview — MINERVOT",
};

export const dynamic = "force-dynamic";

const NOW = new Date().toISOString();

export default function ValuePreviewPage() {
  const screenshotMode =
    process.env.ATLAS_SCREENSHOT_MODE === "1" ||
    process.env.ATLAS_SCREENSHOT_MODE === "true";
  if (
    process.env.NODE_ENV === "production" &&
    process.env.VERCEL_ENV === "production" &&
    !screenshotMode
  ) {
    notFound();
  }
  if (process.env.NODE_ENV === "production" && !screenshotMode && process.env.VERCEL) {
    notFound();
  }

  return (
    <div className="min-h-[100dvh] bg-[var(--background)] px-4 py-6">
      <ValueHomeDashboard
        showAskBar
        projects={[
          {
            id: "preview-sales",
            title: "営業資料",
            workRequest: "提案資料を作成",
            status: "completed",
            progress: 100,
            createdAt: NOW,
            updatedAt: NOW,
            assignedEmployees: [],
            result: null,
          },
          {
            id: "preview-mail",
            title: "メール返信",
            workRequest: "顧客メール返信",
            status: "completed",
            progress: 100,
            createdAt: NOW,
            updatedAt: NOW,
            assignedEmployees: [],
            result: null,
          },
        ]}
        automations={
          [
            {
              id: "preview-auto",
              userId: "preview",
              name: "毎週の営業レポート",
              description: "",
              schedule: {
                kind: "schedule",
                preset: { type: "weekly", dayOfWeek: 1, hour: 9, minute: 0 },
                timezone: "Asia/Tokyo",
                label: "毎週月曜 9:00",
              },
              workflow: { assignment: "営業レポート" },
              timing: { startDate: null, endCondition: { type: "never" } },
              executionLevel: "approve_then_run",
              executionMode: "standard",
              snsBatchDays: null,
              executionFlow: { templateId: "sales_material", steps: [] },
              destination: "none",
              enabled: true,
              lastRun: NOW,
              nextRun: new Date(Date.now() + 86400000 * 3).toISOString(),
              status: "success",
              lastWorkflowRunId: null,
              lastError: null,
              successCount: 8,
              failureCount: 0,
              runHistory: [],
              createdAt: NOW,
              updatedAt: NOW,
            },
          ] as never
        }
      />
    </div>
  );
}
