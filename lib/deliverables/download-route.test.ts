import { describe, expect, it } from "vitest";

import { GET } from "@/app/api/deliverables/[id]/route";
import { DocxDeliverableGenerator } from "@/lib/deliverables/generators/docx-generator";
import { PdfDeliverableGenerator } from "@/lib/deliverables/generators/pdf-generator";
import { saveDeliverableFile, toDeliverableMetadata } from "@/lib/deliverables/store";

const LONG_JA = `# 長文レポート

## 概要
ATLASは習慣的な作業を減らし、専属秘書として成果物を整えます。

## 本文
${"日本語の本文です。表や見出しを含む長文をダウンロードできることを確認します。\n".repeat(40)}

## 表
| 項目 | 内容 |
| --- | --- |
| Word | .docx |
| PDF | .pdf |
| 言語 | 日本語 |
`;

describe("deliverables download API", () => {
  it("returns Word with correct headers and non-zero body", async () => {
    const generated = await new DocxDeliverableGenerator().generate(
      LONG_JA,
      "日本語長文レポート",
    );
    const stored = saveDeliverableFile(generated);
    const meta = toDeliverableMetadata(stored);

    expect(meta.downloadUrl).toBe(`/api/deliverables/${stored.id}`);
    expect(meta.fileName).toBe("日本語長文レポート.docx");

    const response = await GET(new Request(`http://localhost${meta.downloadUrl}`), {
      params: Promise.resolve({ id: stored.id }),
    });

    expect(response.status).toBe(200);
    expect(response.headers.get("Content-Type")).toBe(stored.mimeType);
    expect(response.headers.get("Content-Disposition")).toContain(
      "filename*=UTF-8''",
    );
    expect(response.headers.get("Content-Disposition")).toContain(
      encodeURIComponent("日本語長文レポート.docx"),
    );
    expect(response.headers.get("Content-Length")).toBe(String(stored.buffer.byteLength));

    const body = Buffer.from(await response.arrayBuffer());
    expect(body.byteLength).toBeGreaterThan(2000);
    expect(body.byteLength).toBe(stored.buffer.byteLength);
    expect(body.subarray(0, 2).toString("utf8")).toBe("PK");
  });

  it("returns PDF with correct headers and non-zero body", async () => {
    const generated = await new PdfDeliverableGenerator().generate(
      LONG_JA,
      "日本語長文レポート",
    );
    const stored = saveDeliverableFile(generated);
    const meta = toDeliverableMetadata(stored);

    const response = await GET(new Request(`http://localhost${meta.downloadUrl}`), {
      params: Promise.resolve({ id: stored.id }),
    });

    expect(response.status).toBe(200);
    expect(response.headers.get("Content-Type")).toBe("application/pdf");
    expect(response.headers.get("Content-Disposition")).toContain(
      "filename*=UTF-8''",
    );

    const body = Buffer.from(await response.arrayBuffer());
    expect(body.byteLength).toBeGreaterThan(3000);
    expect(body.toString("latin1").startsWith("%PDF")).toBe(true);
    expect(body.toString("latin1")).toContain("%%EOF");
  });
});
