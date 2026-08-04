import { describe, expect, it } from "vitest";

import { buildAttachmentContentDisposition } from "./content-disposition";

describe("buildAttachmentContentDisposition", () => {
  it("uses filename* UTF-8 encoding for Japanese names", () => {
    const header = buildAttachmentContentDisposition("ATLAS紹介文.docx");
    expect(header).toContain("attachment;");
    expect(header).toContain('filename="ATLAS___.docx"');
    expect(header).toContain(
      "filename*=UTF-8''ATLAS%E7%B4%B9%E4%BB%8B%E6%96%87.docx",
    );
  });

  it("keeps ASCII filenames readable in both fields", () => {
    const header = buildAttachmentContentDisposition("report.pdf");
    expect(header).toBe(
      'attachment; filename="report.pdf"; filename*=UTF-8\'\'report.pdf',
    );
  });
});
