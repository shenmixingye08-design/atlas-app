import { describe, expect, it } from "vitest";

import {
  classifyDeliverableError,
  wordFailureTitle,
  wordFailureUserMessage,
} from "./recovery-messages";

describe("word failure user messages", () => {
  it("classifies AI / Word / Storage / permission / timeout", () => {
    expect(wordFailureTitle("content_quality:too_short")).toBe("AI応答失敗");
    expect(wordFailureTitle("Word生成失敗: Packer output")).toBe("Word生成失敗");
    expect(wordFailureTitle("storage_failed:bucket missing")).toBe(
      "Storage保存失敗",
    );
    expect(wordFailureTitle("forbidden 403")).toBe("権限エラー");
    expect(wordFailureTitle("ETIMEDOUT maxDuration")).toBe("Timeout");
  });

  it("maps undefined.trim crash class to Word生成失敗", () => {
    const reason = "Cannot read properties of undefined (reading 'trim')";
    expect(classifyDeliverableError(reason)).toBe("word_convert");
    expect(wordFailureTitle(reason)).toBe("Word生成失敗");
    expect(wordFailureUserMessage(reason).length).toBeGreaterThan(10);
  });

  it("distinguishes Excel structure / workbook / corrupt / unsupported / persist", () => {
    expect(classifyDeliverableError("excel_structure:empty_sheet")).toBe(
      "excel_structure",
    );
    expect(classifyDeliverableError("excel_workbook:exceljs boom")).toBe(
      "excel_workbook",
    );
    expect(classifyDeliverableError("excel_corrupt:xlsx_reopen_failed")).toBe(
      "excel_corrupt",
    );
    expect(
      classifyDeliverableError("excel_unsupported:excel_advanced_no_aggregatable_columns"),
    ).toBe("excel_unsupported");
    expect(wordFailureTitle("excel_corrupt:xlsx_reopen_failed")).not.toBe(
      "Word生成失敗",
    );
    expect(wordFailureUserMessage("excel_structure:empty_sheet")).toMatch(/表/);
    expect(wordFailureUserMessage("excel_corrupt:xlsx_reopen_failed")).toMatch(
      /壊/,
    );
  });
});
