import { mkdirSync, writeFileSync } from "fs";
import { join } from "path";
import { execFileSync } from "child_process";
import { beforeEach, describe, expect, it, vi } from "vitest";
import JSZip from "jszip";

const authMock = vi.fn();
vi.mock("@clerk/nextjs/server", () => ({
  auth: () => authMock(),
}));

import { GET } from "@/app/api/deliverables/[id]/route";
import { DocxDeliverableGenerator } from "@/lib/deliverables/generators/docx-generator";
import {
  resetDeliverableMemoryStoreForTests,
  saveDeliverableFileDurable,
  toDeliverableMetadata,
} from "@/lib/deliverables/store";
import { DELIVERABLE_MIME_TYPES } from "@/lib/deliverables/types";

const OUT = "/opt/cursor/artifacts/docx-integrity";
const OWNER = "docx_integrity_user";
const BODY = `# 本番品質Word検証

## 概要
MINERVOTのWord成果物は、Microsoft Wordで開ける完成docxである必要があります。

## 本文
${"日本語の本文です。表と見出しを含む長文を検証します。\n".repeat(30)}

## 表
| 項目 | 内容 |
| --- | --- |
| 形式 | Word |
| 言語 | 日本語 |
| 品質 | 本番 |
`;

describe("docx binary integrity (P0)", () => {
  beforeEach(() => {
    authMock.mockReset();
    authMock.mockResolvedValue({ userId: OWNER });
    resetDeliverableMemoryStoreForTests();
    mkdirSync(OUT, { recursive: true });
  });

  it("generator emits real OOXML zip, not text/xml/json", async () => {
    const generated = await new DocxDeliverableGenerator().generate(
      BODY,
      "本番品質レポート",
    );
    expect(generated.mimeType).toBe(DELIVERABLE_MIME_TYPES.docx);
    expect(generated.fileName.endsWith(".docx")).toBe(true);
    expect(generated.buffer.subarray(0, 2).toString("latin1")).toBe("PK");
    // Must NOT be UTF-8 text dump
    const asText = generated.buffer.toString("utf8");
    expect(asText.startsWith("PK")).toBe(true);
    expect(asText.includes("Content-Type:")).toBe(false);

    const path = join(OUT, "generator.docx");
    writeFileSync(path, generated.buffer);
    const fileOut = execFileSync("file", ["-b", path]).toString();
    expect(fileOut.toLowerCase()).toMatch(/microsoft|zip|ooxml|word/);

    const listing = execFileSync("unzip", ["-l", path]).toString();
    expect(listing).toContain("word/document.xml");
    expect(listing).toContain("[Content_Types].xml");
    expect(listing).toContain("word/_rels/");
    expect(listing).toContain("_rels/.rels");

    const zip = await JSZip.loadAsync(generated.buffer);
    expect(zip.file("word/document.xml")).toBeTruthy();
    expect(zip.file("[Content_Types].xml")).toBeTruthy();
    expect(zip.file("_rels/.rels")).toBeTruthy();
    expect(zip.file("word/_rels/document.xml.rels")).toBeTruthy();

    const docXml = (await zip.file("word/document.xml")?.async("string")) ?? "";
    expect(docXml).toContain("w:document");
    expect(docXml).toMatch(/日本語|本番|Word/);
  });

  it("download API returns correct MIME + disposition + binary body", async () => {
    const generated = await new DocxDeliverableGenerator().generate(
      BODY,
      "本番品質レポート",
    );
    const stored = await saveDeliverableFileDurable(generated, OWNER, {
      sourceContent: BODY,
      baseFileName: "本番品質レポート",
    });
    const meta = toDeliverableMetadata(stored);

    const response = await GET(new Request(`http://localhost${meta.downloadUrl}`), {
      params: Promise.resolve({ id: stored.id }),
    });

    expect(response.status).toBe(200);
    expect(response.headers.get("Content-Type")).toBe(
      "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
    );
    expect(response.headers.get("Content-Type")).not.toBe("text/plain");
    expect(response.headers.get("Content-Type")).not.toBe(
      "application/octet-stream",
    );
    expect(response.headers.get("Content-Type")).not.toBe("application/json");
    const cd = response.headers.get("Content-Disposition") ?? "";
    expect(cd.startsWith("attachment;")).toBe(true);
    expect(cd).toContain(".docx");
    expect(cd.toLowerCase()).toContain('filename="');
    expect(cd).toMatch(/filename\*=UTF-8''/);

    const bytes = Buffer.from(await response.arrayBuffer());
    expect(bytes.subarray(0, 2).toString("latin1")).toBe("PK");
    expect(bytes.byteLength).toBe(stored.buffer.byteLength);

    // Simulate browser Blob construction (must use Uint8Array, not string)
    const blobPartsOk = new Uint8Array(bytes);
    expect(blobPartsOk[0]).toBe(0x50); // P
    expect(blobPartsOk[1]).toBe(0x4b); // K

    const downloaded = join(OUT, "downloaded.docx");
    writeFileSync(downloaded, bytes);

    // Round-trip: clear memory, reload from durable disk, download again
    resetDeliverableMemoryStoreForTests();
    const response2 = await GET(
      new Request(`http://localhost${meta.downloadUrl}`),
      { params: Promise.resolve({ id: stored.id }) },
    );
    expect(response2.status).toBe(200);
    expect(response2.headers.get("Content-Type")).toBe(
      "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
    );
    const bytes2 = Buffer.from(await response2.arrayBuffer());
    expect(bytes2.subarray(0, 2).toString("latin1")).toBe("PK");
    writeFileSync(join(OUT, "downloaded-after-hydrate.docx"), bytes2);
  });
});
