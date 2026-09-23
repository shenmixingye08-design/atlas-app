import { describe, expect, it, vi } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import React from "react";

vi.mock("next/link", () => ({
  default: ({ children, href, className }: { children: React.ReactNode; href: string; className?: string }) =>
    React.createElement("a", { href, className }, children),
}));
vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn(), replace: vi.fn(), refresh: vi.fn() }),
  useSearchParams: () => new URLSearchParams(),
  usePathname: () => "/automations/runs/r1",
}));

import { RunReviewPanel } from "@/components/automations/v2/run-review-panel";
import type { AutomationRun } from "@/lib/automation-platform/types";

const now = "2026-09-23T09:00:00.000Z";

function run(status: AutomationRun["status"]): AutomationRun {
  return {
    id: "r1",
    automationId: "a1",
    automationName: "週次売上レポート",
    userId: "u",
    status,
    runKey: "k",
    idempotencyKey: "i",
    scheduleOccurrenceKey: null,
    triggerType: "schedule",
    scheduledFor: now,
    queuedAt: now,
    startedAt: now,
    completedAt: status === "succeeded" ? now : null,
    durationMs: null,
    attemptCount: 1,
    maxAttempts: 3,
    nextRetryAt: null,
    lastErrorCode: null,
    lastErrorMessage: null,
    failedStepId: null,
    retryable: false,
    needsUserInput: false,
    resolvedInstruction: null,
    memoryUsage: { used: [], updated: [], unusedScopes: [] },
    statusHistory: [],
    preparation: null,
    approval: null,
    steps: [],
    artifacts: [
      { id: "x1", kind: "deliverable", label: "売上集計.xlsx", url: "/api/deliverables/x1/download", externalId: null, createdAt: now },
      { id: "x2", kind: "external", label: "X投稿", url: "https://x.com/i/status/1", externalId: "1", createdAt: now },
    ],
    attempts: [],
    approvalExpiresAt: null,
    resultSummary: null,
    diagnosticId: "d",
    createdAt: now,
    updatedAt: now,
  } as unknown as AutomationRun;
}

describe("RunReviewPanel deliverables", () => {
  it("puts deliverables first on a finished run with readable labels", () => {
    const html = renderToStaticMarkup(
      React.createElement(RunReviewPanel, { runId: "r1", initialRun: run("succeeded") }),
    );
    expect(html).toContain('id="artifact-x1"');
    expect(html.indexOf('id="artifacts"')).toBeLessThan(html.indexOf("タイムライン"));
    expect(html).toContain("Excel");
    expect(html).toContain("外部サービスへの反映");
    expect(html).not.toMatch(/>deliverable<|>external</);
  });

  it("keeps deliverables below progress while the run is still going", () => {
    const html = renderToStaticMarkup(
      React.createElement(RunReviewPanel, { runId: "r1", initialRun: run("running") }),
    );
    expect(html.indexOf('id="artifacts"')).toBeGreaterThan(html.indexOf("タイムライン"));
  });
});
