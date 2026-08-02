import { describe, expect, it } from "vitest";

import {
  applyJobTemplate,
  COMPOSER_STEP_ORDER,
  JOB_TEMPLATES,
} from "@/lib/automation-platform/wizard/job-templates";
import {
  buildCreateInputFromWizard,
  createEmptyWizardDraft,
  createStepFromCapability,
  validateWizardDraft,
  visibleWizardSteps,
} from "@/lib/automation-platform/wizard/builders";

describe("Automation Composer", () => {
  it("exposes 7 human steps (+ complete when created)", () => {
    expect(COMPOSER_STEP_ORDER).toHaveLength(7);
    const draft = createEmptyWizardDraft({
      steps: [createStepFromCapability("word_generate")],
      memoryEnabled: false,
    });
    expect(visibleWizardSteps(draft)).toEqual([
      "work",
      "timing",
      "steps",
      "notifications",
      "memory",
      "notes",
      "review",
    ]);
    expect(
      visibleWizardSteps({
        ...draft,
        createdAutomationId: "auto_1",
      }),
    ).toContain("complete");
  });

  it("templates seed sales deck in one tap", () => {
    const sales = JOB_TEMPLATES.find((t) => t.id === "sales_deck");
    expect(sales).toBeTruthy();
    const draft = applyJobTemplate(sales!);
    expect(draft.name).toBe("営業資料作成");
    expect(draft.steps.some((s) => s.type === "word_generate")).toBe(true);
    expect(draft.steps.some((s) => s.type === "pdf_generate")).toBe(true);
    expect(draft.frequency).toBe("weekly");
    expect(draft.daysOfWeek).toContain(5);
    expect(draft.currentStepId).toBe("timing");
    expect(draft.memoryEnabled).toBe(true);

    const built = buildCreateInputFromWizard(draft);
    expect(built.errors.filter((e) => e.code === "steps_required")).toHaveLength(
      0,
    );
    expect(built.summary.length).toBeGreaterThan(0);
  });

  it("covers required first-time template groups", () => {
    const groups = new Set(JOB_TEMPLATES.map((t) => t.group));
    for (const g of [
      "営業",
      "SNS",
      "経理",
      "資料作成",
      "画像解析",
      "ブログ",
      "レポート",
      "メール",
    ]) {
      expect(groups.has(g as never)).toBe(true);
    }
  });

  it("validates missing deliverables in real time domain", () => {
    const empty = createEmptyWizardDraft({ name: "テスト" });
    const errors = validateWizardDraft(empty);
    expect(errors.some((e) => e.code === "steps_required")).toBe(true);
  });

  it("30-second path: template → review payload is creatable", () => {
    const draft = applyJobTemplate(
      JOB_TEMPLATES.find((t) => t.id === "sales_deck")!,
    );
    draft.currentStepId = "review";
    draft.activateOnCreate = true;
    const built = buildCreateInputFromWizard(draft);
    expect(built.errors).toEqual([]);
    expect(built.input.status).toBe("active");
    expect(built.input.workflow.steps.length).toBeGreaterThanOrEqual(2);
  });
});
