import { describe, expect, it } from "vitest";

import { parseLegacyDocumentText } from "@/lib/documents/ir/parse-legacy";
import { renderDocumentIRToText } from "@/lib/documents/ir/render";

describe("document IR legacy parse", () => {
  it("parses headings and bullets", () => {
    const ir = parseLegacyDocumentText(
      "# 議事録\n\n## 決定事項\n\n- 来週再開\n\n本文段落",
    );
    expect(ir.documentType).toBe("minutes");
    expect(ir.title).toBe("議事録");
    expect(ir.sections.length).toBeGreaterThan(0);
    const text = renderDocumentIRToText(ir);
    expect(text).toContain("決定事項");
    expect(text).toContain("- 来週再開");
  });
});
