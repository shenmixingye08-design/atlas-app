import { describe, expect, it } from "vitest";

import {
  assignmentRequestsSpreadsheet,
  detectImageDocumentIntent,
  isStructuredImageDocumentIntent,
} from "./intent";

describe("detectImageDocumentIntent", () => {
  it("detects receipt → household ledger", () => {
    const intent = detectImageDocumentIntent(
      "このレシートを家計簿に入れてください",
    );
    expect(intent.documentType).toBe("receipt");
    expect(isStructuredImageDocumentIntent(intent)).toBe(true);
  });

  it("detects table/excel requests", () => {
    const intent = detectImageDocumentIntent("この写真をExcelにして");
    expect(intent.documentType).toBe("table");
    expect(intent.prefersSpreadsheet).toBe(true);
  });

  it("detects business cards", () => {
    const intent = detectImageDocumentIntent("この名刺を連絡先にまとめて");
    expect(intent.documentType).toBe("business_card");
  });

  it("detects handwritten memos", () => {
    const intent = detectImageDocumentIntent("手書きメモを文字にしてToDoにして");
    expect(intent.documentType).toBe("handwritten");
    expect(intent.prefersDocument).toBe(true);
  });

  it("detects invoices", () => {
    const intent = detectImageDocumentIntent("請求書をExcel化して");
    expect(intent.documentType).toBe("invoice");
  });
});

describe("assignmentRequestsSpreadsheet", () => {
  it("matches japanese excel keywords", () => {
    expect(assignmentRequestsSpreadsheet("一覧をエクセルで")).toBe(true);
    expect(assignmentRequestsSpreadsheet("家計簿を作って")).toBe(true);
  });
});
