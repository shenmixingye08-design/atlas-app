import { beforeEach, describe, expect, it, vi } from "vitest";

const authMock = vi.fn();

vi.mock("@clerk/nextjs/server", () => ({
  auth: () => authMock(),
}));

import { GET } from "@/app/api/deliverables/[id]/route";
import { POST as exportPost } from "@/app/api/deliverables/export/route";
import { generateDeliverables } from "@/lib/deliverables/engine";
import { resetDurableDeliverableStoreForTests } from "@/lib/deliverables/durable-store";
import { resetDeliverableMemoryStoreForTests } from "@/lib/deliverables/store";

const OWNER = "user_flow_owner";
const CONTENT = `# 提案書

## 課題
業務の手戻りを減らす。

## 解決策
MINERVOTが成果物を整えます。

| 項目 | 内容 |
| --- | --- |
| 形式 | Word / PDF / Markdown |
`;

describe("generate → Word → PDF → Markdown flow", () => {
  beforeEach(() => {
    authMock.mockResolvedValue({ userId: OWNER });
    resetDeliverableMemoryStoreForTests();
    resetDurableDeliverableStoreForTests();
  });

  it("generates files and downloads Word/PDF after memory clear; Markdown export works", async () => {
    const result = await generateDeliverables(
      {
        assignment: "提案書をWordとPDFで作成",
        finalDeliverable: CONTENT,
        title: "提案書",
        formats: ["docx", "pdf", "md"],
      },
      "http://localhost",
      { userId: OWNER },
    );

    const formats = result.deliverables.map((d) => d.format);
    expect(formats).toEqual(expect.arrayContaining(["docx", "md", "pdf"]));
    for (const d of result.deliverables) {
      expect(d.id).toBeTruthy();
      expect(d.downloadUrl).toBe(`/api/deliverables/${d.id}`);
      expect(d.sizeBytes).toBeGreaterThan(0);
    }

    // Simulate serverless instance switch before download.
    resetDeliverableMemoryStoreForTests();

    const docxMeta = result.deliverables.find((d) => d.format === "docx")!;
    const pdfMeta = result.deliverables.find((d) => d.format === "pdf")!;
    const mdMeta = result.deliverables.find((d) => d.format === "md")!;

    const docxRes = await GET(
      new Request(`http://localhost${docxMeta.downloadUrl}`),
      { params: Promise.resolve({ id: docxMeta.id }) },
    );
    expect(docxRes.status).toBe(200);
    const docxBody = Buffer.from(await docxRes.arrayBuffer());
    expect(docxBody.subarray(0, 2).toString("utf8")).toBe("PK");

    const pdfRes = await GET(
      new Request(`http://localhost${pdfMeta.downloadUrl}`),
      { params: Promise.resolve({ id: pdfMeta.id }) },
    );
    expect(pdfRes.status).toBe(200);
    const pdfBody = Buffer.from(await pdfRes.arrayBuffer());
    expect(pdfBody.toString("latin1").startsWith("%PDF")).toBe(true);

    const mdRes = await GET(
      new Request(`http://localhost${mdMeta.downloadUrl}`),
      { params: Promise.resolve({ id: mdMeta.id }) },
    );
    expect(mdRes.status).toBe(200);
    const mdText = Buffer.from(await mdRes.arrayBuffer()).toString("utf8");
    expect(mdText).toContain("提案書");

    // Client Markdown path equivalent: on-demand export also works.
    const mdExport = await exportPost(
      new Request("http://localhost/api/deliverables/export", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ format: "md", content: CONTENT, title: "提案書" }),
      }),
    );
    expect(mdExport.status).toBe(200);
  });
});
