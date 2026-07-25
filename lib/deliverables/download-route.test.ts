import { beforeEach, describe, expect, it, vi } from "vitest";

const authMock = vi.fn();

vi.mock("@clerk/nextjs/server", () => ({
  auth: () => authMock(),
}));

import { GET } from "@/app/api/deliverables/[id]/route";
import { DocxDeliverableGenerator } from "@/lib/deliverables/generators/docx-generator";
import { PdfDeliverableGenerator } from "@/lib/deliverables/generators/pdf-generator";
import { saveDeliverableFile, toDeliverableMetadata } from "@/lib/deliverables/store";

const OWNER = "user_owner_a";
const OTHER = "user_other_b";

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
  beforeEach(() => {
    authMock.mockReset();
    authMock.mockResolvedValue({ userId: OWNER });
  });

  it("returns Word with correct headers and non-zero body", async () => {
    const generated = await new DocxDeliverableGenerator().generate(
      LONG_JA,
      "日本語長文レポート",
    );
    const stored = saveDeliverableFile(generated, OWNER);
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
    const stored = saveDeliverableFile(generated, OWNER);
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

  it("rejects unauthenticated download", async () => {
    authMock.mockResolvedValue({ userId: null });
    const generated = await new DocxDeliverableGenerator().generate("短文", "短文");
    const stored = saveDeliverableFile(generated, OWNER);

    const response = await GET(
      new Request(`http://localhost/api/deliverables/${stored.id}`),
      { params: Promise.resolve({ id: stored.id }) },
    );

    expect(response.status).toBe(401);
  });

  it("rejects download by a different user", async () => {
    authMock.mockResolvedValue({ userId: OTHER });
    const generated = await new DocxDeliverableGenerator().generate("短文", "短文");
    const stored = saveDeliverableFile(generated, OWNER);

    const response = await GET(
      new Request(`http://localhost/api/deliverables/${stored.id}`),
      { params: Promise.resolve({ id: stored.id }) },
    );

    expect(response.status).toBe(404);
  });
});
