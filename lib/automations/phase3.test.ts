import { describe, expect, it } from "vitest";

import { estimateRequestIntent } from "./intent-estimate";
import { buildSchedulePreview, presetToPlainLabel } from "./schedule-display";
import { buildPauseResumePatch, filterProductionRuns } from "./pause-resume";
import { filterWiredTemplates } from "./wired-templates";
import { defaultWizardState } from "./wizard-state";
import { hasMeaningfulDraft, buildDraftEnvelope } from "./wizard-draft";
import type { Automation } from "./types";

describe("estimateRequestIntent", () => {
  it("detects recurring from 毎週", () => {
    const r = estimateRequestIntent("毎週月曜9時にレポートを作成");
    expect(r.timing).toBe("recurring");
    expect(r.confidence).toBe("high");
  });

  it("defaults to once_now for empty", () => {
    expect(estimateRequestIntent("").timing).toBe("once_now");
  });
});

describe("schedule display", () => {
  it("formats preset without cron jargon", () => {
    const label = presetToPlainLabel({ type: "daily", hour: 9, minute: 0 });
    expect(label).toContain("毎日");
    expect(label).toContain("Asia/Tokyo");
    expect(label).not.toContain("*");
  });

  it("computes next and following run", () => {
    const preview = buildSchedulePreview({
      kind: "schedule",
      preset: { type: "daily", hour: 9, minute: 0 },
      timezone: "Asia/Tokyo",
      label: "毎日 09:00",
    });
    expect(preview?.nextRun).toBeTruthy();
    expect(preview?.followingRun).toBeTruthy();
  });
});

describe("wizard draft", () => {
  it("detects meaningful draft", () => {
    const env = buildDraftEnvelope(
      defaultWizardState({ assignment: "週次レポート" }),
    );
    expect(hasMeaningfulDraft(env)).toBe(true);
    expect(hasMeaningfulDraft(null)).toBe(false);
  });
});

describe("wired templates", () => {
  it("filters by query", () => {
    const hits = filterWiredTemplates("wordpress");
    expect(hits.some((t) => t.id === "blog-wordpress")).toBe(true);
    expect(hits.every((t) => t.requiredConnections.length >= 0)).toBe(true);
  });
});

describe("pause/resume", () => {
  const automation = {
    enabled: true,
    schedule: {
      kind: "schedule" as const,
      preset: { type: "daily" as const, hour: 9, minute: 0 },
      timezone: "Asia/Tokyo",
      label: "毎日 09:00",
    },
    nextRun: "2026-07-23T00:00:00.000Z",
  } as Automation;

  it("pause keeps nextRun", () => {
    const patch = buildPauseResumePatch(automation, false);
    expect(patch.enabled).toBe(false);
    expect(patch.nextRun).toBe(automation.nextRun);
  });

  it("resume recomputes nextRun from now", () => {
    const patch = buildPauseResumePatch(automation, true, new Date("2026-07-22T10:00:00Z"));
    expect(patch.enabled).toBe(true);
    expect(patch.nextRun).toBeTruthy();
  });
});

describe("test run exclusion", () => {
  it("excludes test from production metrics", () => {
    const runs = filterProductionRuns([
      {
        id: "1",
        status: "completed",
        startedAt: "",
        completedAt: "",
        error: null,
        triggerType: "test",
      },
      {
        id: "2",
        status: "completed",
        startedAt: "",
        completedAt: "",
        error: null,
        triggerType: "manual",
      },
    ]);
    expect(runs).toHaveLength(1);
    expect(runs[0]?.triggerType).toBe("manual");
  });
});
