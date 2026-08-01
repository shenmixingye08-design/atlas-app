import { describe, expect, it } from "vitest";

import { detectInstructionConflicts } from "@/lib/automation-platform/instruction/conflict";
import {
  buildCreateInputFromWizard,
  createEmptyWizardDraft,
  createStepFromCapability,
  reorderSteps,
  validateWizardDraft,
} from "@/lib/automation-platform/wizard/builders";
import { resolveCategoryAvailability } from "@/lib/automation-platform/wizard/categories";
import { proposeWizardFromNaturalLanguage } from "@/lib/automation-platform/wizard/nl-propose";
import { describeSchedule } from "@/lib/automation-platform/wizard/schedule-copy";
import type { FeatureAvailabilityMap } from "@/lib/feature-flags/types";

const allFlagsOn = {
  google: true,
  x: true,
  wordpress: true,
  dropbox: true,
  video_generation: true,
  image_generation: true,
  sales_material: true,
  blog: true,
  sns: true,
  ai_employees: true,
  high_quality_mode: true,
  automation_v2_enabled: true,
  automation_memory_enabled: true,
  automation_approval_enabled: true,
} satisfies FeatureAvailabilityMap;

describe("automation create wizard domain", () => {
  it("1-5. builds daily/weekly/monthly/once/manual schedules", () => {
    const daily = createEmptyWizardDraft({
      triggerType: "schedule",
      frequency: "daily",
      hour: 9,
      minute: 0,
    });
    expect(describeSchedule(daily)).toContain("毎日");

    const weekly = createEmptyWizardDraft({
      frequency: "weekly",
      daysOfWeek: [5],
      hour: 18,
      minute: 0,
    });
    expect(describeSchedule(weekly)).toContain("金曜日");

    const monthly = createEmptyWizardDraft({
      frequency: "monthly",
      dayOfMonth: 15,
    });
    expect(describeSchedule(monthly)).toContain("毎月15日");

    const once = createEmptyWizardDraft({
      frequency: "once",
      runAt: "2026-12-01T00:00:00.000Z",
    });
    expect(describeSchedule(once)).toContain("1回");

    const manual = createEmptyWizardDraft({ triggerType: "manual" });
    expect(describeSchedule(manual)).toContain("手動");
  });

  it("6-10. supports multi step add/delete/duplicate/reorder", () => {
    let draft = createEmptyWizardDraft({
      steps: [
        createStepFromCapability("word_generate"),
        createStepFromCapability("pdf_generate"),
      ],
    });
    draft = {
      ...draft,
      steps: [...draft.steps, createStepFromCapability("notify")],
    };
    expect(draft.steps).toHaveLength(3);

    const duplicated = {
      ...draft.steps[0]!,
      id: "copy",
      name: "Word生成（コピー）",
    };
    draft = { ...draft, steps: [...draft.steps, duplicated] };
    expect(draft.steps).toHaveLength(4);

    draft = {
      ...draft,
      steps: draft.steps.filter((step) => step.id !== "copy"),
    };
    expect(draft.steps).toHaveLength(3);

    draft = { ...draft, steps: reorderSteps(draft.steps, 0, 2) };
    expect(draft.steps[2]?.type).toBe("word_generate");
  });

  it("11-15. includes word/excel/pdf/gmail/dropbox steps in payload", () => {
    const draft = createEmptyWizardDraft({
      name: "資料自動化",
      steps: [
        createStepFromCapability("word_generate"),
        createStepFromCapability("excel_generate"),
        createStepFromCapability("pdf_generate"),
        {
          ...createStepFromCapability("gmail"),
          configuration: { mode: "draft" },
        },
        {
          ...createStepFromCapability("dropbox"),
          configuration: { folderPath: "/Reports" },
        },
      ],
      conflictResolution: null,
    });
    const built = buildCreateInputFromWizard(draft);
    const types = built.input.workflow.steps.map((step) => step.type);
    expect(types).toEqual([
      "word_generate",
      "excel_generate",
      "pdf_generate",
      "gmail",
      "dropbox",
    ]);
  });

  it("16. marks disconnected integrations unavailable", () => {
    const result = resolveCategoryAvailability(allFlagsOn, new Set());
    const sns = result.find((item) => item.category.id === "sns");
    expect(sns?.available).toBe(false);
    expect(sns?.connectHref).toBe("/settings/x");
  });

  it("17-19. stores structuredOptions/freeformNotes and detects conflicts", () => {
    const draft = createEmptyWizardDraft({
      name: "矛盾テスト",
      steps: [createStepFromCapability("pdf_generate")],
      freeformNotes: "PDFは不要、Excelだけでよい",
    });
    const conflicts = detectInstructionConflicts({
      structuredOptions: { generatePdf: true },
      freeformNotes: draft.freeformNotes,
    });
    expect(conflicts.length).toBeGreaterThan(0);
    const errors = validateWizardDraft(draft);
    expect(errors.some((error) => error.code === "instruction_conflict")).toBe(
      true,
    );
    const resolved = buildCreateInputFromWizard({
      ...draft,
      conflictResolution: "prefer_notes",
    });
    expect(
      resolved.input.workflow.steps.find((step) => step.type === "pdf_generate")
        ?.enabled,
    ).toBe(false);
  });

  it("20-24. maps execution policies", () => {
    const modes = [
      "review_before_run",
      "run_then_notify",
      "approve_first_then_auto",
      "review_high_risk_only",
      "review_post_only",
      "review_send_only",
      "review_selected_steps",
    ] as const;
    for (const mode of modes) {
      const built = buildCreateInputFromWizard(
        createEmptyWizardDraft({
          name: "policy",
          steps: [createStepFromCapability("notify")],
          executionMode: mode,
          selectedApprovalStepIds: mode === "review_selected_steps" ? ["x"] : [],
        }),
      );
      expect(built.input.executionPolicy?.mode).toBe(mode);
      expect(built.input.executionPolicy?.systemHighRiskOverride).toBe(true);
    }
  });

  it("25-27. notification and memory policies", () => {
    const built = buildCreateInputFromWizard(
      createEmptyWizardDraft({
        name: "notify-memory",
        steps: [createStepFromCapability("notify")],
        notifyBeforeRun: true,
        notificationChannels: ["in_app", "web_push"],
        memoryEnabled: true,
        memoryAllowedScopes: ["writing_style"],
        memoryDeniedScopes: ["default_recipients"],
        memoryLockedOverrides: { writing_style: "formal" },
      }),
    );
    expect(built.input.notificationPolicy?.beforeRun).toBe(true);
    expect(built.input.memoryPolicy?.allowedScopes).toContain("writing_style");
    expect(built.input.memoryPolicy?.lockedOverrides).toEqual({
      writing_style: "formal",
    });
  });

  it("28-31. draft defaults, review summary, create payload, activate flag", () => {
    const draft = createEmptyWizardDraft({
      name: "週次",
      steps: [createStepFromCapability("excel_generate")],
      activateOnCreate: true,
    });
    expect(draft.savedAt).toBeNull();
    const built = buildCreateInputFromWizard(draft);
    expect(built.summary).toContain("週次");
    expect(built.input.status).toBe("active");
    expect(built.errors.filter((e) => e.code !== "instruction_conflict")).toEqual(
      [],
    );
  });

  it("34. feature categories respect flags", () => {
    const flags = { ...allFlagsOn, x: false };
    const result = resolveCategoryAvailability(flags, new Set(["x"]));
    const sns = result.find((item) => item.category.id === "sns");
    expect(sns?.available).toBe(false);
  });

  it("proposes from natural language without auto-activate", () => {
    const proposed = proposeWizardFromNaturalLanguage(
      "毎週金曜日の18時に、売上をまとめてPowerPointを作り、PDFにしてDropboxに保存し、完了したら通知して",
    );
    expect(proposed.activateOnCreate).toBe(false);
    expect(proposed.frequency).toBe("weekly");
    expect(proposed.daysOfWeek).toContain(5);
    expect(proposed.hour).toBe(18);
    expect(proposed.steps.some((step) => step.type === "powerpoint_generate")).toBe(
      true,
    );
    expect(proposed.steps.some((step) => step.type === "pdf_generate")).toBe(true);
    expect(proposed.steps.some((step) => step.type === "dropbox")).toBe(true);
    expect(proposed.steps.some((step) => step.type === "notify")).toBe(true);
  });
});
