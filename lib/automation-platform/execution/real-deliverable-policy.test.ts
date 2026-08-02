import { describe, expect, it, afterEach } from "vitest";
import {
  buildDeliverableSourceContent,
  formatsForDeliverableStep,
  isDeliverableGenerateStep,
  isV2RealDeliverablesEnabled,
} from "./real-deliverable-policy";
import { WORD_CONTENT_MIN_CHARS } from "@/lib/deliverables/constants";

describe("real-deliverable-policy", () => {
  const original = process.env.ATLAS_V2_REAL_DELIVERABLES;

  afterEach(() => {
    if (original === undefined) {
      delete process.env.ATLAS_V2_REAL_DELIVERABLES;
    } else {
      process.env.ATLAS_V2_REAL_DELIVERABLES = original;
    }
  });

  it("defaults real deliverables ON", () => {
    delete process.env.ATLAS_V2_REAL_DELIVERABLES;
    expect(isV2RealDeliverablesEnabled()).toBe(true);
  });

  it("supports rollback via ATLAS_V2_REAL_DELIVERABLES=false", () => {
    process.env.ATLAS_V2_REAL_DELIVERABLES = "false";
    expect(isV2RealDeliverablesEnabled()).toBe(false);
  });

  it("maps document steps to real formats", () => {
    expect(formatsForDeliverableStep("word_generate")).toEqual(["docx", "pdf"]);
    expect(formatsForDeliverableStep("excel_generate")).toEqual([
      "xlsx",
      "pdf",
    ]);
    expect(isDeliverableGenerateStep("word_generate")).toBe(true);
    expect(isDeliverableGenerateStep("gmail")).toBe(false);
  });

  it("builds weekly-report source content long enough for Word export", () => {
    const built = buildDeliverableSourceContent({
      automationName: "毎週営業レポート",
      assignmentNotes: "今週の商談3件と来週の予定をまとめてください。",
      stepName: "週次報告書",
      stepType: "word_generate",
      configuration: {
        title: "週次営業報告書",
        documentType: "report",
        tone: "formal",
      },
    });
    expect(built.title).toBe("週次営業報告書");
    expect(built.content.length).toBeGreaterThanOrEqual(WORD_CONTENT_MIN_CHARS);
    expect(built.content).toContain("週次営業報告書");
    expect(built.assignment).toContain("毎週営業レポート");
  });
});
