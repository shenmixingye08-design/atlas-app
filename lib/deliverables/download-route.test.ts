import { beforeEach, describe, expect, it, vi } from "vitest";

const authMock = vi.fn();

vi.mock("@clerk/nextjs/server", () => ({
  auth: () => authMock(),
}));

import { GET } from "@/app/api/deliverables/[id]/route";
import { POST as exportPost } from "@/app/api/deliverables/export/route";
import { DocxDeliverableGenerator } from "@/lib/deliverables/generators/docx-generator";
import { PdfDeliverableGenerator } from "@/lib/deliverables/generators/pdf-generator";
import { resetDurableDeliverableStoreForTests } from "@/lib/deliverables/durable-store";
import {
  getStoredDeliverableForUser,
  resetDeliverableMemoryStoreForTests,
  saveDeliverableFileDurable,
  toDeliverableMetadata,
} from "@/lib/deliverables/store";

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
    resetDeliverableMemoryStoreForTests();
    resetDurableDeliverableStoreForTests();
  });

  it("returns Word with correct headers and non-zero body", async () => {
    const generated = await new DocxDeliverableGenerator().generate(
      LONG_JA,
      "日本語長文レポート",
    );
    const stored = await saveDeliverableFileDurable(generated, OWNER, {
      sourceContent: LONG_JA,
      baseFileName: "日本語長文レポート",
    });
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
    const stored = await saveDeliverableFileDurable(generated, OWNER, {
      sourceContent: LONG_JA,
      baseFileName: "日本語長文レポート",
    });
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

  it("hydrates Word/PDF after process memory is cleared (serverless miss)", async () => {
    const generated = await new DocxDeliverableGenerator().generate(
      LONG_JA,
      "cross-instance",
    );
    const stored = await saveDeliverableFileDurable(generated, OWNER, {
      sourceContent: LONG_JA,
      baseFileName: "cross-instance",
    });

    // Simulate another serverless instance: binary memory empty, durable remains.
    resetDeliverableMemoryStoreForTests();
    expect(await getStoredDeliverableForUser(stored.id, OWNER)).toBeTruthy();

    const response = await GET(
      new Request(`http://localhost/api/deliverables/${stored.id}`),
      { params: Promise.resolve({ id: stored.id }) },
    );
    expect(response.status).toBe(200);
    const body = Buffer.from(await response.arrayBuffer());
    expect(body.subarray(0, 2).toString("utf8")).toBe("PK");
    expect(body.byteLength).toBeGreaterThan(2000);
  });

  it("exports Word/PDF on demand without a stored id", async () => {
    const docx = await exportPost(
      new Request("http://localhost/api/deliverables/export", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          format: "docx",
          content: LONG_JA,
          title: "オンデマンド",
        }),
      }),
    );
    expect(docx.status).toBe(200);
    const docxBody = Buffer.from(await docx.arrayBuffer());
    expect(docxBody.subarray(0, 2).toString("utf8")).toBe("PK");

    const pdf = await exportPost(
      new Request("http://localhost/api/deliverables/export", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          format: "pdf",
          content: LONG_JA,
          title: "オンデマンド",
        }),
      }),
    );
    expect(pdf.status).toBe(200);
    const pdfBody = Buffer.from(await pdf.arrayBuffer());
    expect(pdfBody.toString("latin1").startsWith("%PDF")).toBe(true);
  });

  it("rejects unauthenticated download", async () => {
    authMock.mockResolvedValue({ userId: null });
    const sample = "# 権限確認\n\nこれは認証拒否の確認用本文です。";
    const generated = await new DocxDeliverableGenerator().generate(
      sample,
      "権限確認",
    );
    const stored = await saveDeliverableFileDurable(generated, OWNER, {
      sourceContent: sample,
      baseFileName: "権限確認",
    });

    const response = await GET(
      new Request(`http://localhost/api/deliverables/${stored.id}`),
      { params: Promise.resolve({ id: stored.id }) },
    );

    expect(response.status).toBe(401);
  });

  it("rejects download by a different user", async () => {
    authMock.mockResolvedValue({ userId: OTHER });
    const sample = "# 権限確認\n\nこれは他ユーザー拒否の確認用本文です。";
    const generated = await new DocxDeliverableGenerator().generate(
      sample,
      "権限確認",
    );
    const stored = await saveDeliverableFileDurable(generated, OWNER, {
      sourceContent: sample,
      baseFileName: "権限確認",
    });

    const response = await GET(
      new Request(`http://localhost/api/deliverables/${stored.id}`),
      { params: Promise.resolve({ id: stored.id }) },
    );

    expect(response.status).toBe(404);
  });
});
