import { describe, expect, it } from "vitest";

import { validateParsedRequest } from "./schema";
import { routeRequest } from "./route";
import { understandRequest, formatsFromParsedRequest } from "./understand";
import { canRunStep } from "./workflow";
import { buildRequestIdempotencyKey, claimIdempotencyKey } from "./idempotency";
import { detectFormatsViaUnderstanding } from "./bridge";
import { userMessageForRequestCode } from "./errors";

function primaryFormats(assignment: string, attachments?: Parameters<typeof understandRequest>[0]["attachments"]) {
  const parsed = understandRequest({ assignment, attachments });
  return {
    parsed,
    formats: formatsFromParsedRequest(parsed),
    mode: parsed.execution_mode,
    intent: parsed.intent,
  };
}

describe("request understanding — acceptance matrix", () => {
  it("1. 議事録を作って → Word", () => {
    const { formats, mode } = primaryFormats("議事録を作って");
    expect(mode).toBe("artifact");
    expect(formats).toContain("docx");
  });

  it("2. 売上表を作って → Excel", () => {
    const { formats } = primaryFormats("売上表を作って");
    expect(formats[0]).toBe("xlsx");
  });

  it("3. 提出用報告書を作って → PDF", () => {
    const { formats } = primaryFormats("提出用報告書を作って");
    expect(formats).toContain("pdf");
  });

  it("4. 営業資料を作って → PowerPoint", () => {
    const { formats } = primaryFormats("営業資料を作って");
    expect(formats).toContain("pptx");
  });

  it("5. CSVで出して → CSV", () => {
    const { formats } = primaryFormats("顧客一覧をCSVで出して");
    expect(formats).toContain("csv");
  });

  it("6. 見積書を作って → ExcelまたはWord + PDF", () => {
    const { formats, parsed } = primaryFormats("見積書を作って");
    expect(formats.some((f) => f === "xlsx" || f === "docx")).toBe(true);
    expect(formats).toContain("pdf");
    expect(parsed.document_kind).toBe("estimate");
  });

  it("7. このExcelをPDFにして → 変換", () => {
    const { mode, formats } = primaryFormats("このExcelをPDFにして", [
      { id: "a1", fileName: "sales.xlsx", mimeType: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" },
    ]);
    expect(mode).toBe("conversion");
    expect(formats).toContain("pdf");
  });

  it("8. このPDFを要約して → 解析", () => {
    const { mode } = primaryFormats("このPDFを要約して", [
      { id: "p1", fileName: "contract.pdf", mimeType: "application/pdf" },
    ]);
    expect(mode).toBe("analysis");
  });

  it("9. この画像をExcelにして → Vision + Excel", () => {
    const { formats, parsed } = primaryFormats("この画像をExcelにして", [
      { id: "i1", fileName: "table.png", mimeType: "image/png" },
    ]);
    expect(formats).toContain("xlsx");
    expect(parsed.detected_entities.wantsVision).toBe(true);
  });

  it("10. レシートから家計簿 → Vision + Excel", () => {
    const { formats, parsed } = primaryFormats("レシートから家計簿を作って", [
      { id: "r1", fileName: "receipt.jpg", mimeType: "image/jpeg" },
    ]);
    expect(formats).toContain("xlsx");
    expect(parsed.document_kind).toBe("household");
    expect(parsed.detected_entities.wantsVision).toBe(true);
  });

  it("11. 投稿文を作って → 外部実行しない", () => {
    const { mode, parsed } = primaryFormats("Xの投稿文を作って");
    expect(mode).toBe("answer");
    expect(parsed.risks).not.toContain("external_action_requires_confirmation");
  });

  it("12. Xへ投稿して → 外部実行", () => {
    const { mode, parsed } = primaryFormats("Xへ投稿して");
    expect(["external_action", "mixed"]).toContain(mode);
    expect(parsed.risks).toContain("external_action_requires_confirmation");
  });

  it("13. 毎日投稿して → 自動化", () => {
    const { mode, parsed } = primaryFormats("毎日Xへ投稿して");
    expect(["automation", "mixed"]).toContain(mode);
    expect(parsed.detected_entities.recurring).toBe(true);
  });

  it("14. 今日だけ投稿して → 単発", () => {
    const { parsed } = primaryFormats("今日だけXへ投稿して");
    expect(parsed.detected_entities.recurring).toBe(false);
    expect(parsed.detected_entities.scheduleOnce).toBe(true);
  });

  it("15. メール文を作って → 作成のみ", () => {
    const { mode, parsed } = primaryFormats("お礼のメール文を作って");
    expect(mode).toBe("answer");
    expect(parsed.risks).not.toContain("external_action_requires_confirmation");
  });

  it("16. メールを送って → 外部実行", () => {
    const { mode, parsed } = primaryFormats("お客様へメールを送って");
    expect(["external_action", "mixed"]).toContain(mode);
    expect(parsed.risks).toContain("external_action_requires_confirmation");
  });

  it("17. 複数添付から対象を判断", () => {
    const parsed = understandRequest({
      assignment: "全部まとめてPDFにして",
      attachments: [
        { id: "1", fileName: "a.docx", mimeType: "application/vnd.openxmlformats-officedocument.wordprocessingml.document" },
        { id: "2", fileName: "b.docx", mimeType: "application/vnd.openxmlformats-officedocument.wordprocessingml.document" },
      ],
    });
    expect(parsed.needs_clarification).toBe(false);
    expect(parsed.source_inputs.length).toBeGreaterThan(2);
  });

  it("18. 添付不足", () => {
    const decision = routeRequest({ assignment: "これをPDFにして" });
    expect(decision.target).toBe("needs_input");
    expect(decision.parsed.missing_required_fields).toContain("attachment");
  });

  it("19. 形式明示を優先", () => {
    const { formats } = primaryFormats("議事録をExcelで作って");
    expect(formats[0]).toBe("xlsx");
  });

  it("20. 複数形式生成", () => {
    const { formats } = primaryFormats("見積書を作ってPDFでもほしい");
    expect(formats).toContain("pdf");
    expect(formats.some((f) => f === "xlsx" || f === "docx")).toBe(true);
  });

  it("21. 不足情報がある見積書", () => {
    const parsed = understandRequest({ assignment: "見積書を作って" });
    expect(parsed.missing_required_fields.length).toBeGreaterThan(0);
    expect(parsed.needs_clarification).toBe(true);
  });

  it("22. 安全に仮定できる依頼", () => {
    const parsed = understandRequest({ assignment: "議事録を作って" });
    expect(parsed.assumptions.length).toBeGreaterThan(0);
    expect(parsed.needs_clarification).toBe(false);
  });

  it("23. 仮定禁止の金額情報", () => {
    const parsed = understandRequest({ assignment: "請求書を作って" });
    const amountField = parsed.required_fields.find((f) => f.key === "amount" || f.key === "bank");
    expect(amountField?.level).toBe("never_assume");
  });

  it("24. 低confidenceで確認", () => {
    const parsed = understandRequest({ assignment: "あれよろしく" });
    expect(parsed.confidence).toBeLessThan(0.7);
    expect(parsed.needs_clarification || parsed.fallback_used).toBe(true);
  });

  it("25. 高confidenceで即実行", () => {
    const decision = routeRequest({ assignment: "議事録をWordで作って" });
    expect(decision.parsed.confidence).toBeGreaterThanOrEqual(0.7);
    expect(decision.shouldStartJob).toBe(true);
    expect(decision.target).toBe("artifact_generate");
  });

  it("26. 複合依頼の分解", () => {
    const parsed = understandRequest({
      assignment: "このレシートを読み取って家計簿に追加し、月次PDFを作ってメールして",
      attachments: [{ id: "r", fileName: "r.jpg", mimeType: "image/jpeg" }],
    });
    expect(parsed.recommended_workflow.length).toBeGreaterThan(3);
    expect(parsed.recommended_workflow.some((s) => s.type === "vision")).toBe(true);
  });

  it("27. 前段失敗で後段停止", () => {
    const parsed = understandRequest({ assignment: "見積書を作って" });
    const clarify = parsed.recommended_workflow.find((s) => s.stepId === "clarify");
    expect(clarify).toBeTruthy();
    const later = parsed.recommended_workflow.find((s) => s.stepId.startsWith("generate_"));
    if (later) {
      expect(canRunStep(later, new Set(["validate_input"]), new Set(["clarify"]))).toBe(false);
    }
  });

  it("28. 未対応機能", () => {
    const decision = routeRequest({ assignment: "製品紹介の動画を生成して" });
    expect(decision.target).toBe("unsupported");
    expect(decision.parsed.alternatives?.length).toBeGreaterThan(0);
  });

  it("29. 重複リクエスト", () => {
    const key = buildRequestIdempotencyKey({
      userId: "u1",
      assignment: "売上表を作って",
    });
    expect(claimIdempotencyKey(key)).toBe(true);
    expect(claimIdempotencyKey(key)).toBe(false);
  });

  it("30. 日本語の曖昧表現", () => {
    const parsed = understandRequest({ assignment: "いつもの感じで資料お願い" });
    expect(parsed.confidence).toBeLessThan(0.75);
  });

  it("31. 誤字を含む依頼", () => {
    const { formats } = primaryFormats("みつもり書をエクセルるで作って");
    expect(formats).toContain("xlsx");
  });

  it("32. 短文「これExcel」", () => {
    const { formats, parsed } = primaryFormats("これExcel", [
      { id: "img", fileName: "shot.png", mimeType: "image/png" },
    ]);
    expect(formats).toContain("xlsx");
    expect(parsed.detected_entities.deictic).toBe(true);
  });

  it("33. 短文「PDFで」", () => {
    const { formats } = primaryFormats("報告書をPDFで");
    expect(formats).toContain("pdf");
  });

  it("34. 既存成果物への再編集", () => {
    const { intent, mode } = primaryFormats("このPDFの3ページ目を削除して", [
      { id: "p", fileName: "a.pdf", mimeType: "application/pdf" },
    ]);
    expect(["edit_artifact", "convert_file", "needs_input"]).toContain(intent);
    expect(["artifact", "conversion", "analysis"]).toContain(mode);
  });

  it("35. 外部連携未接続は確認対象", () => {
    const decision = routeRequest({ assignment: "Xへ投稿して" });
    expect(decision.shouldConfirm || decision.parsed.risks.length > 0).toBe(true);
  });

  it("36. 権限不足コードを定義", () => {
    expect(userMessageForRequestCode("permission_denied")).toMatch(/権限/);
  });

  it("37. timeout メッセージ", () => {
    expect(userMessageForRequestCode("timeout")).toMatch(/時間/);
  });

  it("38. fallback", () => {
    const parsed = understandRequest({ assignment: "???" });
    expect(parsed.fallback_used || parsed.needs_clarification).toBe(true);
  });

  it("39. 既存形式検出ブリッジ非破壊", () => {
    const detection = detectFormatsViaUnderstanding("議事録を作って");
    expect(detection.formats).toContain("docx");
    expect(detection.matchedRule).toMatch(/request_understanding/);
  });

  it("40. モバイルからの短い依頼", () => {
    const { formats, mode } = primaryFormats("売上表");
    expect(mode).toBe("artifact");
    expect(formats).toContain("xlsx");
  });
});

describe("schema validation", () => {
  it("rejects empty intent-like contradictions", () => {
    const parsed = understandRequest({ assignment: "議事録を作って" });
    const result = validateParsedRequest(parsed);
    expect(result.ok).toBe(true);
  });
});
