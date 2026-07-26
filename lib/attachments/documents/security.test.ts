import { describe, expect, it } from "vitest";

import {
  assertDocumentBatchLimits,
  assertSupportedDocument,
  DocumentValidationError,
  sanitizeOriginalFileName,
} from "./security";

describe("document attachment security", () => {
  it("rejects executable extensions", () => {
    expect(() =>
      assertSupportedDocument({
        fileName: "malware.exe",
        mimeType: "application/octet-stream",
        bytes: 100,
      }),
    ).toThrow(DocumentValidationError);
  });

  it("accepts pdf by extension when mime is empty", () => {
    expect(
      assertSupportedDocument({
        fileName: "invoice.pdf",
        mimeType: "",
        bytes: 2048,
      }),
    ).toBe("application/pdf");
  });

  it("rejects oversized files", () => {
    expect(() =>
      assertSupportedDocument({
        fileName: "big.pdf",
        mimeType: "application/pdf",
        bytes: 21 * 1024 * 1024,
      }),
    ).toThrow(/上限/);
  });

  it("enforces batch totals", () => {
    expect(() =>
      assertDocumentBatchLimits([
        { bytes: 30 * 1024 * 1024 },
        { bytes: 30 * 1024 * 1024 },
      ]),
    ).toThrow(/合計/);
  });

  it("sanitizes path traversal in file names", () => {
    expect(sanitizeOriginalFileName("../../etc/passwd.pdf")).toBe("passwd.pdf");
  });
});
