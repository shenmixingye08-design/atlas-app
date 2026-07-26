import { describe, expect, it } from "vitest";

import {
  evaluateMissingAttachmentIdsGate,
  stripVisionPoisonText,
} from "@/lib/vision/gate";

describe("commander vision attachment wiring", () => {
  it("blocks filename-only household prompts without attachmentIds", () => {
    const assignment = stripVisionPoisonText(
      "「4830.jpg」はレシートです。日付・店名・金額・品目を読み取り、家計簿（支出）へ登録してください。",
    );
    expect(assignment).not.toContain("4830.jpg");
    const gate = evaluateMissingAttachmentIdsGate({
      assignment,
      attachmentIds: [],
    });
    expect(gate).not.toBeNull();
    expect(gate?.status).toBe("needs_image_retry");
    expect(gate?.userCode).toBe("missing_attachment_ids");
  });

  it("allows text-only work without attachments", () => {
    const gate = evaluateMissingAttachmentIdsGate({
      assignment: "週次報告を書いてください",
      attachmentIds: [],
    });
    expect(gate).toBeNull();
  });

  it("allows when attachmentIds are present", () => {
    const gate = evaluateMissingAttachmentIdsGate({
      assignment: "家計簿Excelにして",
      attachmentIds: ["img_abc"],
    });
    expect(gate).toBeNull();
  });
});
