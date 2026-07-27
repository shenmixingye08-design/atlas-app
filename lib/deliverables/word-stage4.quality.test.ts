import { beforeEach, describe, expect, it } from "vitest";
import { createHash } from "node:crypto";
import { mkdirSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { inflateRawSync } from "node:zlib";

import {
  DocxDeliverableGenerator,
  DocxPlaceholderGenerator,
} from "@/lib/deliverables/generators/docx-generator";
import { generateDeliverables } from "@/lib/deliverables/engine";
import { PdfDeliverableGenerator } from "@/lib/deliverables/generators/pdf-generator";
import { PptxDeliverableGenerator } from "@/lib/deliverables/generators/pptx-generator";
import { XlsxDeliverableGenerator } from "@/lib/deliverables/generators/xlsx-generator";
import { resolveDocumentModel } from "@/lib/deliverables/document-model/normalize-document-model";
import { parseDocumentModel } from "@/lib/deliverables/document-model/document-model-schema";
import {
  detectWordPurpose,
  getWordTemplate,
  listWordTemplates,
  WORD_TEMPLATE_IDS,
  type WordTemplateId,
} from "@/lib/deliverables/word-templates";
import {
  addDeliverableVersion,
  buildVersionedDisplayName,
  createVersionGroup,
  findVersionGroupByDeliverableId,
  getLatestDeliverableVersion,
  listDeliverableVersions,
  resetDeliverableVersionsForTests,
} from "@/lib/deliverables/versioning";
import {
  resetWordCompanyBrandForTests,
  saveWordCompanyBrand,
  validateWordLogoDataUrl,
} from "@/lib/deliverables/company-brand";
import { buildWordPreviewModel } from "@/lib/deliverables/word-preview";
import {
  assertWordContentLimits,
  assertWordTableLimits,
  enforceWordGenerateRateLimit,
  resetWordRateLimitsForTests,
  WORD_CONTENT_MAX_CHARS,
} from "@/lib/deliverables/word-rate-limit";
import {
  claimWordJob,
  completeWordJob,
  resetWordJobsForTests,
} from "@/lib/deliverables/word-job-stages";
import { listZipEntryNames, verifyOoxmlStructure } from "@/lib/deliverables/integrity";
import {
  getStoredDeliverableForUser,
  resetDeliverableMemoryStoreForTests,
  saveDeliverableFileDurable,
} from "@/lib/deliverables/store";
import { resetDurableDeliverableStoreForTests } from "@/lib/deliverables/durable-store";

const OWNER = "stage4_user";
const OUT = "/opt/cursor/artifacts/word-stage4-templates";
const LOAD_OUT = "/tmp/word-stage4-concurrent-load";

type TemplateArtifactReport = {
  templateId: WordTemplateId;
  filename: string;
  size: number;
  sha256: string;
  mime: string;
  PK: boolean;
  OOXML: boolean;
  entriesPresent: {
    documentXml: boolean;
    stylesXml: boolean;
    numberingXml: boolean;
    headerXml: boolean;
    footerXml: boolean;
  };
  genTimeMs: number;
};

type ZipEntry = {
  name: string;
  method: number;
  compressedSize: number;
  localOffset: number;
};

const LONG_BODY = (label: string) => `# ${label}

## 概要
${label}向けの本文です。顧客への提出を想定し、背景と目的を明確にします。

## 本文
${"業務上必要な説明を丁寧に記載します。関係者と共有できる粒度でまとめます。\n".repeat(8)}

## 箇条書き
- 要点Aを確認する
- 要点Bを実施する
- 要点Cを共有する

## 手順
1. 準備する
2. 実行する
3. 確認する

| 項目 | 内容 |
| --- | --- |
| 担当 | 山田 |
| 期限 | 来週 |
`;

function richTemplateBody(templateId: WordTemplateId): string {
  const rows = Array.from({ length: templateId === "comparison-table" ? 32 : 12 }, (_, i) => {
    const index = i + 1;
    return `| ${index} | 製品A-${String(index).padStart(3, "0")} | ${index * 1250}円 | 2026/07/${String((index % 28) + 1).padStart(2, "0")} | 記号 & < > " ' / A${index}B |`;
  });
  return `# ${templateId} 品質確認

## 概要
日本語、mixed Alpha-123、特殊文字 & < > " ' を含めてWord生成を確認します。

## 詳細
顧客名: 株式会社サンプル / 管理番号: ATLAS-${templateId}-20260727

## 比較表
| No | 名称 | 金額 | 日付 | 備考 |
| --- | --- | --- | --- | --- |
${rows.join("\n")}

## 手順
1. 内容を確認する
2. 関係者へ共有する
3. 次回改善案に反映する

## 注意事項
特殊文字はXMLとして安全に保存し、本文は削除しません。
`;
}

function largeMarkdownTable(rowCount: number): string {
  const rows = Array.from({ length: rowCount }, (_, i) => {
    const index = i + 1;
    return `| R${index} | 山田 ${index} | ABC-${index}-XYZ | ${index * 1000}円 | 行末SENTINEL_${index} |`;
  });
  return `# 複数ページ表

## 明細
| 行 | 担当 | 管理番号 | 金額 | メモ |
| --- | --- | --- | --- | --- |
${rows.join("\n")}
`;
}

function buildLongDocument(targetChars: number): string {
  const prefix = `# 長文${targetChars}\n\n## 本文\n`;
  const suffix = `\nEND_${targetChars}`;
  const fillerLength = Math.max(0, targetChars - prefix.length - suffix.length);
  return `${prefix}${"業務文書の確認。".repeat(Math.ceil(fillerLength / 8)).slice(0, fillerLength)}${suffix}`;
}

async function mockedAiContent(templateId: WordTemplateId, index: number): Promise<string> {
  return `${richTemplateBody(templateId)}

## AIモック
AIモック本文 ${index}: 実APIは呼ばず、決定的な入力から実DOCXを生成します。
`;
}

function findEndOfCentralDirectory(buffer: Buffer): number {
  const min = Math.max(0, buffer.byteLength - 65_536 - 22);
  for (let i = buffer.byteLength - 22; i >= min; i -= 1) {
    if (
      buffer[i] === 0x50 &&
      buffer[i + 1] === 0x4b &&
      buffer[i + 2] === 0x05 &&
      buffer[i + 3] === 0x06
    ) {
      return i;
    }
  }
  return -1;
}

function listZipEntries(buffer: Buffer): ZipEntry[] {
  const eocd = findEndOfCentralDirectory(buffer);
  if (eocd < 0) return [];

  const totalEntries = buffer.readUInt16LE(eocd + 10);
  let offset = buffer.readUInt32LE(eocd + 16);
  const entries: ZipEntry[] = [];

  for (let index = 0; index < totalEntries; index += 1) {
    if (offset + 46 > buffer.byteLength) break;
    if (
      buffer[offset] !== 0x50 ||
      buffer[offset + 1] !== 0x4b ||
      buffer[offset + 2] !== 0x01 ||
      buffer[offset + 3] !== 0x02
    ) {
      break;
    }
    const method = buffer.readUInt16LE(offset + 10);
    const compressedSize = buffer.readUInt32LE(offset + 20);
    const nameLength = buffer.readUInt16LE(offset + 28);
    const extraLength = buffer.readUInt16LE(offset + 30);
    const commentLength = buffer.readUInt16LE(offset + 32);
    const localOffset = buffer.readUInt32LE(offset + 42);
    const nameStart = offset + 46;
    const nameEnd = nameStart + nameLength;
    if (nameEnd > buffer.byteLength) break;
    entries.push({
      name: buffer.subarray(nameStart, nameEnd).toString("utf8"),
      method,
      compressedSize,
      localOffset,
    });
    offset = nameEnd + extraLength + commentLength;
  }

  return entries;
}

function readZipEntryText(buffer: Buffer, entryName: string): string {
  const entry = listZipEntries(buffer).find((item) => item.name === entryName);
  if (!entry) return "";
  const local = entry.localOffset;
  if (
    local + 30 > buffer.byteLength ||
    buffer[local] !== 0x50 ||
    buffer[local + 1] !== 0x4b ||
    buffer[local + 2] !== 0x03 ||
    buffer[local + 3] !== 0x04
  ) {
    return "";
  }
  const localNameLength = buffer.readUInt16LE(local + 26);
  const localExtraLength = buffer.readUInt16LE(local + 28);
  const dataStart = local + 30 + localNameLength + localExtraLength;
  const dataEnd = dataStart + entry.compressedSize;
  if (dataEnd > buffer.byteLength) return "";
  const payload = buffer.subarray(dataStart, dataEnd);
  const inflated =
    entry.method === 8
      ? inflateRawSync(payload)
      : entry.method === 0
        ? payload
        : Buffer.alloc(0);
  return inflated.toString("utf8");
}

function assertDocxCoreParts(buffer: Buffer): string[] {
  expect(buffer.subarray(0, 2).toString("latin1")).toBe("PK");
  expect(verifyOoxmlStructure(buffer).ok).toBe(true);
  const names = listZipEntryNames(buffer);
  expect(names).toContain("word/document.xml");
  expect(names).toContain("word/styles.xml");
  expect(names).toContain("word/numbering.xml");
  return names;
}

describe("Word Stage 4 templates / model / versions", () => {
  beforeEach(() => {
    resetDeliverableMemoryStoreForTests();
    resetDurableDeliverableStoreForTests();
    resetDeliverableVersionsForTests();
    resetWordCompanyBrandForTests();
    resetWordRateLimitsForTests();
    resetWordJobsForTests();
    mkdirSync(OUT, { recursive: true });
    mkdirSync(LOAD_OUT, { recursive: true });
  });

  it("lists all 10 word templates", () => {
    expect(listWordTemplates()).toHaveLength(10);
    expect(WORD_TEMPLATE_IDS).toEqual([
      "standard-document",
      "business-report",
      "meeting-minutes",
      "sales-report",
      "proposal",
      "comparison-table",
      "manual",
      "customer-letter",
      "contract",
      "estimate",
    ]);
  });

  it("detects purposes including ambiguous cases", () => {
    expect(
      detectWordPurpose({ assignment: "今日の訪問内容を営業報告書にして" })
        .templateId,
    ).toBe("sales-report");
    expect(
      detectWordPurpose({ assignment: "会議の内容を議事録にして" }).templateId,
    ).toBe("meeting-minutes");
    expect(
      detectWordPurpose({ assignment: "3社の価格を比較した資料を作って" })
        .templateId,
    ).toBe("comparison-table");
    expect(
      detectWordPurpose({
        assignment: "太陽光発電の提案書をWordで作って",
      }).templateId,
    ).toBe("proposal");
    expect(
      detectWordPurpose({ assignment: "作業の流れをマニュアルにして" })
        .templateId,
    ).toBe("manual");
    expect(
      detectWordPurpose({ assignment: "地権者向けの案内文を作って" })
        .templateId,
    ).toBe("customer-letter");
    expect(
      detectWordPurpose({ assignment: "何かいい感じの文書を作って" })
        .templateId,
    ).toBe("standard-document");
    expect(
      detectWordPurpose({
        assignment: "営業資料としてサービス紹介をまとめて",
      }),
    ).toMatchObject({
      templateId: "standard-document",
      confidence: "low",
    });
    expect(
      detectWordPurpose({
        assignment: "報告書にして。今日の訪問と商談報告を含める",
      }),
    ).toMatchObject({
      templateId: "sales-report",
      purpose: "sales_report",
    });
    expect(
      detectWordPurpose({
        assignment: "議事録と提案書の両方っぽいメモを整理して",
      }).templateId,
    ).toBe("meeting-minutes");
    // Explicit override wins
    expect(
      detectWordPurpose({
        assignment: "議事録にして",
        explicitTemplateId: "proposal",
      }).templateId,
    ).toBe("proposal");
  });

  it("validates DocumentModel and falls back from invalid structured JSON", () => {
    const ok = parseDocumentModel({
      title: "テスト",
      templateId: "sales-report",
      sections: [
        {
          id: "s1",
          level: 2,
          title: "概要",
          blocks: [{ type: "paragraph", text: "本文です。" }],
        },
      ],
    });
    expect(ok.ok).toBe(true);

    const invalid = parseDocumentModel({
      title: "",
      templateId: "unknown",
      sections: [{ id: "", blocks: [{ type: "made-up" }] }],
    });
    expect(invalid.ok).toBe(false);
    if (!invalid.ok) {
      expect(invalid.reason).toContain("title");
    }

    const normalized = resolveDocumentModel({
      content: LONG_BODY("構造化"),
      assignment: "3社の価格を比較した資料を作って",
      templateId: "comparison-table",
      structured: {
        title: " 構造化テスト ",
        templateId: "proposal",
        sections: [
          {
            id: "s1",
            level: 2,
            title: " 比較 ",
            blocks: [
              { type: "paragraph", text: " \u0000  " },
              {
                type: "table",
                headers: ["項目"],
                rows: [["A", "100円"], ["B"]],
              },
              { type: "bulletList", items: [" 確認 ", ""] },
            ],
          },
        ],
      },
    });
    expect(normalized.ok).toBe(true);
    expect(normalized.model.templateId).toBe("comparison-table");
    expect(normalized.model.sections[0]?.title).toBe("比較");
    const normalizedTable = normalized.model.sections[0]?.blocks.find(
      (block) => block.type === "table",
    );
    expect(normalizedTable).toMatchObject({
      type: "table",
      headers: ["項目", "列2"],
      rows: [
        ["A", "100円"],
        ["B", ""],
      ],
    });

    const fallback = resolveDocumentModel({
      content: LONG_BODY("フォールバック"),
      assignment: "今日の訪問内容を営業報告書にして",
      templateId: "sales-report",
      structured: { broken: true },
    });
    expect(fallback.model.title.length).toBeGreaterThan(0);
    expect(fallback.model.sections.length).toBeGreaterThan(0);
    expect(fallback.model.templateId).toBe("sales-report");
  });

  it("generates template-specific docx with company info and without", async () => {
    const tinyPng =
      "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==";
    const brand = await saveWordCompanyBrand(OWNER, {
      companyName: "株式会社テスト",
      contactName: "山田太郎",
      phone: "03-1234-5678",
      logoDataUrl: tinyPng,
      brandColorHex: "1F4E79",
      footerText: "機密 — 社外秘",
    });

    const withBrand = await new DocxDeliverableGenerator().generate(
      LONG_BODY("提案書"),
      "提案書",
      {
        assignment: "太陽光発電の提案書をWordで作って",
        templateId: "proposal",
        brand,
      },
    );
    expect(withBrand.buffer.subarray(0, 2).toString("latin1")).toBe("PK");
    expect(verifyOoxmlStructure(withBrand.buffer).ok).toBe(true);
    expect(readZipEntryText(withBrand.buffer, "word/document.xml")).toContain(
      "株式会社テスト",
    );

    const withoutBrand = await new DocxDeliverableGenerator().generate(
      LONG_BODY("標準"),
      "標準文書",
      { assignment: "一般的な文書", templateId: "standard-document" },
    );
    expect(withoutBrand.buffer.subarray(0, 2).toString("latin1")).toBe("PK");
    expect(readZipEntryText(withoutBrand.buffer, "word/document.xml")).not.toContain(
      "株式会社テスト",
    );
  });

  it("rejects unsafe logos and accepts png data urls", async () => {
    expect(validateWordLogoDataUrl("https://evil.example/logo.png").ok).toBe(
      false,
    );
    expect(validateWordLogoDataUrl("data:text/plain;base64,SGVsbG8=").ok).toBe(
      false,
    );
    expect(
      validateWordLogoDataUrl(
        `data:image/png;base64,${"A".repeat(700 * 1024)}`,
      ).ok,
    ).toBe(false);
    const tinyPng =
      "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==";
    expect(validateWordLogoDataUrl(tinyPng).ok).toBe(true);
    await expect(
      saveWordCompanyBrand(OWNER, {
        companyName: "株式会社ロゴ",
        logoDataUrl: "file:///tmp/logo.png",
      }),
    ).rejects.toThrow(/logo_unsupported_format/);
  });

  it("versions keep old deliverable ids stable", async () => {
    const v1file = await new DocxDeliverableGenerator().generate(
      LONG_BODY("v1"),
      "営業報告書",
      { templateId: "sales-report" },
    );
    const v1 = await saveDeliverableFileDurable(v1file, OWNER, {
      sourceContent: LONG_BODY("v1"),
      baseFileName: "営業報告書",
    });
    const group = createVersionGroup({
      deliverableId: v1.id,
      createdBy: OWNER,
      displayName: "営業報告書",
      internalFileName: v1.fileName,
      jobId: "job_v1",
    });

    const v2file = await new DocxDeliverableGenerator().generate(
      LONG_BODY("v2"),
      "営業報告書",
      { templateId: "sales-report" },
    );
    const v2 = await saveDeliverableFileDurable(v2file, OWNER, {
      sourceContent: LONG_BODY("v2"),
      baseFileName: "営業報告書",
    });
    addDeliverableVersion({
      groupId: group.groupId,
      newDeliverableId: v2.id,
      parentDeliverableId: v1.id,
      createdBy: OWNER,
      displayName: buildVersionedDisplayName("営業報告書", 2),
      internalFileName: "営業報告書_v2.docx",
      revisionReason: "タイトル修正",
      jobId: "job_v2",
      diffSummary: "title+body",
    });

    const versions = listDeliverableVersions(group.groupId);
    expect(versions).toHaveLength(2);
    expect(getLatestDeliverableVersion(group.groupId)?.deliverableId).toBe(v2.id);
    expect(versions.find((item) => item.version === 1)?.deliverableId).toBe(v1.id);

    // Old URL still resolves to v1 binary
    const old = await getStoredDeliverableForUser(v1.id, OWNER);
    expect(old?.id).toBe(v1.id);
  });

  it("engine attaches purpose template and linked version metadata", async () => {
    const first = await generateDeliverables(
      {
        assignment: "議事録にして",
        finalDeliverable: richTemplateBody("meeting-minutes"),
        title: "議事録",
        formats: ["docx"],
      },
      "http://localhost",
      {
        userId: OWNER,
        jobId: "stage4_engine_metadata_v1",
        templateId: "proposal",
      },
    );
    const firstDocx = first.deliverables.find((item) => item.format === "docx");
    expect(firstDocx?.metadata).toMatchObject({
      purpose: "proposal",
      templateId: "proposal",
      version: 1,
      parentDeliverableId: null,
    });
    expect(firstDocx?.metadata?.versionGroupId).toBeTruthy();
    const firstStored = firstDocx
      ? await getStoredDeliverableForUser(firstDocx.id, OWNER)
      : null;
    expect(firstStored?.metadata?.templateId).toBe("proposal");

    const versionGroupId = firstDocx?.metadata?.versionGroupId;
    expect(versionGroupId).toBeTruthy();
    if (!firstDocx || !versionGroupId) {
      throw new Error("missing first version metadata");
    }

    const second = await generateDeliverables(
      {
        assignment: "作業手順書として再生成",
        finalDeliverable: richTemplateBody("manual"),
        title: "議事録",
        formats: ["docx"],
      },
      "http://localhost",
      {
        userId: OWNER,
        jobId: "stage4_engine_metadata_v2",
        templateId: "manual",
        parentDeliverableId: firstDocx.id,
        versionGroupId,
        revisionReason: "テンプレート変更",
        cost: { regenerateCount: 1 },
      },
    );
    const secondDocx = second.deliverables.find((item) => item.format === "docx");
    expect(secondDocx?.metadata).toMatchObject({
      purpose: "manual",
      templateId: "manual",
      version: 2,
      parentDeliverableId: firstDocx.id,
      versionGroupId,
    });
    expect(listDeliverableVersions(versionGroupId)).toHaveLength(2);
  });

  it(
    "prevents edit regenerate double-submit with job idempotency, versions, and rate limit",
    async () => {
      expect(enforceWordGenerateRateLimit(`${OWNER}_regenerate`)).toBeNull();
      const limited = enforceWordGenerateRateLimit(`${OWNER}_regenerate`);
      expect(limited?.status).toBe(429);

      const jobId = "stage4_double_submit_job";
      const claim = await claimWordJob({
        jobId,
        userId: OWNER,
        assignment: "営業報告書をWordで作成してください",
        sourceContent: LONG_BODY("初版"),
        baseFileName: "営業報告書",
      });
      expect(claim.ok).toBe(true);

      const firstFile = await new DocxDeliverableGenerator().generate(
        LONG_BODY("初版"),
        "営業報告書",
        { templateId: "sales-report" },
      );
      const firstStored = await saveDeliverableFileDurable(firstFile, OWNER, {
        sourceContent: LONG_BODY("初版"),
        baseFileName: "営業報告書",
      });
      const groupRecord = createVersionGroup({
        deliverableId: firstStored.id,
        createdBy: OWNER,
        displayName: "営業報告書",
        internalFileName: firstStored.fileName,
        jobId,
      });
      await completeWordJob(jobId, firstStored.id);

      const secondClaim = await claimWordJob({
        jobId,
        userId: OWNER,
        assignment: "営業報告書をWordで作成してください",
        sourceContent: LONG_BODY("初版"),
        baseFileName: "営業報告書",
      });
      expect(secondClaim.ok).toBe(false);
      if (!secondClaim.ok) {
        expect(secondClaim.reason).toBe("already_completed");
        expect(secondClaim.job.deliverableId).toBe(firstStored.id);
      }

      const group = findVersionGroupByDeliverableId(firstStored.id);
      expect(group?.record.version).toBe(1);
      expect(group?.groupId).toBe(groupRecord.groupId);

      const revisedFile = await new DocxDeliverableGenerator().generate(
        LONG_BODY("編集後"),
        "営業報告書_v2",
        { templateId: "sales-report" },
      );
      const revised = await saveDeliverableFileDurable(revisedFile, OWNER, {
        sourceContent: LONG_BODY("編集後"),
        baseFileName: "営業報告書_v2",
      });
      expect(group).toBeTruthy();
      if (!group) return;

      const v2 = addDeliverableVersion({
        groupId: group.groupId,
        newDeliverableId: revised.id,
        parentDeliverableId: group.record.deliverableId,
        createdBy: OWNER,
        displayName: buildVersionedDisplayName("営業報告書", 2),
        internalFileName: "営業報告書_v2.docx",
        revisionReason: "編集再生成",
        jobId: "stage4_regenerate_v2",
      });
      expect(v2.parentDeliverableId).toBe(group.record.deliverableId);
      expect(getLatestDeliverableVersion(group.groupId)?.deliverableId).toBe(
        revised.id,
      );
      expect(listDeliverableVersions(group.groupId)).toHaveLength(2);
    },
    60_000,
  );

  it("preview model matches document model structure", () => {
    const resolved = resolveDocumentModel({
      content: LONG_BODY("プレビュー"),
      assignment: "会議の内容を議事録にして",
      templateId: "meeting-minutes",
    });
    const preview = buildWordPreviewModel({
      model: resolved.model,
      sizeBytes: 12345,
      version: 1,
      isLatest: true,
    });
    expect(preview.templateId).toBe("meeting-minutes");
    expect(preview.title).toBeTruthy();
    expect(preview.title).toBe(resolved.model.title);
    expect(preview.sections.length).toBe(resolved.model.sections.length);
    expect(preview.sections.map((section) => section.title)).toEqual(
      resolved.model.sections.map((section) => section.title),
    );
    expect(preview.estimatedPages).toBeGreaterThanOrEqual(1);
    expect("html" in preview).toBe(false);

    const unsafeText = "<script>alert('x')</script><b>太字ではなく本文</b>";
    const structured = resolveDocumentModel({
      content: unsafeText,
      structured: {
        title: "HTMLではないプレビュー",
        templateId: "standard-document",
        sections: [
          {
            id: "html_safety",
            level: 2,
            title: "本文",
            blocks: [{ type: "paragraph", text: unsafeText }],
          },
        ],
      },
    });
    const unsafePreview = buildWordPreviewModel({ model: structured.model });
    expect("html" in unsafePreview).toBe(false);
    expect(unsafePreview.sections[0]?.blocks[0]).toMatchObject({
      type: "paragraph",
      text: unsafeText,
    });
  });

  it("rate limit returns 429 after burst", () => {
    resetWordRateLimitsForTests();
    // First call ok
    expect(enforceWordGenerateRateLimit(OWNER)).toBeNull();
    // Immediate second call blocked by minInterval
    const limited = enforceWordGenerateRateLimit(OWNER);
    expect(limited?.status).toBe(429);
    expect(limited?.headers.get("Retry-After")).toBeTruthy();
  });

  it("enforces content max size and table max size before generation", async () => {
    expect(WORD_CONTENT_MAX_CHARS).toBe(100_000);
    expect(assertWordContentLimits(buildLongDocument(WORD_CONTENT_MAX_CHARS))).toBeNull();
    const tooLarge = assertWordContentLimits(
      buildLongDocument(WORD_CONTENT_MAX_CHARS + 1),
    );
    expect(tooLarge?.status).toBe(413);
    await expect(tooLarge?.json()).resolves.toMatchObject({
      code: "payload_too_large",
      maxChars: WORD_CONTENT_MAX_CHARS,
    });

    expect(assertWordTableLimits(largeMarkdownTable(198))).toBeNull();
    const oversizedTable = assertWordTableLimits(largeMarkdownTable(199));
    expect(oversizedTable?.status).toBe(413);
    await expect(oversizedTable?.json()).resolves.toMatchObject({
      code: "table_too_large",
    });
  });

  it(
    "renders tables, multi-page tables, Japanese, mixed alphanumerics, and special chars",
    async () => {
      const rows = Array.from({ length: 160 }, (_, index) => {
        const rowNumber = index + 1;
        return [
          `R${rowNumber}`,
          `山田 ${rowNumber}`,
          `ABC-${rowNumber}-XYZ`,
          `${rowNumber * 1000}円`,
          `特殊 & < > Alpha-123 SENTINEL_${rowNumber}`,
        ];
      });
      const content = largeMarkdownTable(160);
      expect(assertWordTableLimits(largeMarkdownTable(160))).toBeNull();

      const generated = await new DocxDeliverableGenerator().generate(
        content,
        "複数ページ表",
        {
          assignment: "3社の価格を比較した資料を作って",
          templateId: "comparison-table",
          structured: {
            title: "複数ページ表",
            templateId: "comparison-table",
            sections: [
              {
                id: "multi_page_table",
                level: 2,
                title: "日本語 Alpha-123 明細",
                blocks: [
                  {
                    type: "paragraph",
                    text: "日本語、Alpha-123、特殊文字 & < > を含みます。",
                  },
                  {
                    type: "table",
                    headers: ["行", "担当", "管理番号", "金額", "メモ"],
                    rows,
                  },
                ],
              },
            ],
          },
        },
      );
      const names = assertDocxCoreParts(generated.buffer);
      expect(names.some((name) => name.startsWith("word/footer"))).toBe(true);

      const xml = readZipEntryText(generated.buffer, "word/document.xml");
      expect(xml).toContain("日本語");
      expect(xml).toContain("Alpha-123");
      expect(xml).toContain("SENTINEL_160");
      expect(xml).toContain("&amp;");
      expect(xml).toContain("&lt;");
      expect(xml).toContain("&gt;");
      expect(xml).toContain("w:tblHeader");
    },
    60_000,
  );

  it(
    "handles long text sizes without truncation and safely rejects over-limit input",
    async () => {
      const outcomes: Array<{
        requestedChars: number;
        actualChars: number;
        outcome: "success" | "safe_reject";
        sizeBytes?: number;
        sha256?: string;
        reason?: string;
      }> = [];
      const generator = new DocxDeliverableGenerator();

      for (const requestedChars of [1_000, 5_000, 10_000, 30_000, 50_000]) {
        const content = buildLongDocument(requestedChars);
        expect(content.length).toBe(requestedChars);
        expect(assertWordContentLimits(content)).toBeNull();
        const generated = await generator.generate(content, `長文${requestedChars}`, {
          templateId: "standard-document",
        });
        assertDocxCoreParts(generated.buffer);
        expect(readZipEntryText(generated.buffer, "word/document.xml")).toContain(
          `END_${requestedChars}`,
        );
        outcomes.push({
          requestedChars,
          actualChars: content.length,
          outcome: "success",
          sizeBytes: generated.buffer.byteLength,
          sha256: createHash("sha256").update(generated.buffer).digest("hex"),
        });
      }

      const hundredThousand = buildLongDocument(100_000);
      expect(hundredThousand.length).toBe(100_000);
      const hundredThousandGuard = assertWordContentLimits(hundredThousand);
      if (hundredThousandGuard) {
        expect(hundredThousandGuard.status).toBe(413);
        outcomes.push({
          requestedChars: 100_000,
          actualChars: hundredThousand.length,
          outcome: "safe_reject",
          reason: "content_limit",
        });
      } else {
        const generated = await generator.generate(hundredThousand, "長文100000", {
          templateId: "standard-document",
        });
        assertDocxCoreParts(generated.buffer);
        expect(readZipEntryText(generated.buffer, "word/document.xml")).toContain(
          "END_100000",
        );
        outcomes.push({
          requestedChars: 100_000,
          actualChars: hundredThousand.length,
          outcome: "success",
          sizeBytes: generated.buffer.byteLength,
          sha256: createHash("sha256").update(generated.buffer).digest("hex"),
        });
      }

      const overLimit = assertWordContentLimits(buildLongDocument(100_001));
      expect(overLimit?.status).toBe(413);
      process.stdout.write(
        `${JSON.stringify({ type: "word-stage4-long-text-report", outcomes }, null, 2)}\n`,
      );
    },
    180_000,
  );

  it(
    "records concurrent load success and fail counts with AI mock and real docx paths",
    async () => {
      rmSync(LOAD_OUT, { recursive: true, force: true });
      mkdirSync(LOAD_OUT, { recursive: true });
      const loads = [1, 5, 10, 25, 50] as const;
      const report: Array<{
        load: number;
        success: number;
        fail: number;
        elapsedMs: number;
        samplePath: string | null;
        failures: string[];
      }> = [];

      for (const load of loads) {
        const started = Date.now();
        const results = await Promise.all(
          Array.from({ length: load }, async (_, index) => {
            const templateId = WORD_TEMPLATE_IDS[index % WORD_TEMPLATE_IDS.length];
            const path = join(LOAD_OUT, `load-${load}-${index + 1}.docx`);
            try {
              const content = await mockedAiContent(templateId, index + 1);
              const generated = await new DocxDeliverableGenerator().generate(
                content,
                `load-${load}-${index + 1}`,
                { templateId, assignment: templateId },
              );
              assertDocxCoreParts(generated.buffer);
              writeFileSync(path, generated.buffer);
              return { ok: true as const, path };
            } catch (error) {
              const message =
                error instanceof Error ? error.message : String(error ?? "unknown");
              return { ok: false as const, path, reason: message };
            }
          }),
        );
        const failures = results
          .filter((result) => !result.ok)
          .map((result) => ("reason" in result ? result.reason : "unknown"));
        const success = results.length - failures.length;
        report.push({
          load,
          success,
          fail: failures.length,
          elapsedMs: Date.now() - started,
          samplePath: results.find((result) => result.ok)?.path ?? null,
          failures,
        });
        expect(success).toBe(load);
        expect(failures).toHaveLength(0);
      }

      process.stdout.write(
        `${JSON.stringify({ type: "word-stage4-concurrent-load-report", report }, null, 2)}\n`,
      );
    },
    180_000,
  );

  it("keeps old docx placeholder export compatible with the production generator", async () => {
    const generated = await new DocxPlaceholderGenerator().generate(
      LONG_BODY("旧互換"),
      "legacy-docx",
      { templateId: "standard-document" },
    );
    expect(generated.isPlaceholder).toBe(false);
    assertDocxCoreParts(generated.buffer);
    const stored = await saveDeliverableFileDurable(generated, OWNER, {
      sourceContent: LONG_BODY("旧互換"),
      baseFileName: "legacy-docx",
    });
    const loaded = await getStoredDeliverableForUser(stored.id, OWNER);
    expect(loaded?.id).toBe(stored.id);
    expect(loaded?.buffer.subarray(0, 2).toString("latin1")).toBe("PK");
  });

  it(
    "regression smoke keeps pdf xlsx and pptx generators producing buffers",
    async () => {
      const content = `${LONG_BODY("回帰")}

| 製品 | 金額 | 備考 |
| --- | --- | --- |
| A | 1000 | PDF/XLSX/PPTX smoke |
| B | 2000 | 日本語も含める |
`;
      const pdf = await new PdfDeliverableGenerator().generate(content, "smoke-pdf");
      expect(pdf.buffer.byteLength).toBeGreaterThan(500);
      expect(pdf.buffer.subarray(0, 4).toString("latin1")).toBe("%PDF");

      const xlsx = await new XlsxDeliverableGenerator().generate(
        content,
        "smoke-xlsx",
      );
      expect(xlsx.buffer.byteLength).toBeGreaterThan(1_000);
      expect(xlsx.buffer.subarray(0, 2).toString("latin1")).toBe("PK");

      const pptx = await new PptxDeliverableGenerator().generate(
        content,
        "smoke-pptx",
      );
      expect(pptx.buffer.byteLength).toBeGreaterThan(1_000);
      expect(["pptx", "md"]).toContain(pptx.format);
      if (pptx.format === "pptx") {
        expect(pptx.buffer.subarray(0, 2).toString("latin1")).toBe("PK");
      } else {
        expect(pptx.buffer.subarray(0, 2).toString("utf8")).toBe("# ");
      }
    },
    120_000,
  );

  it(
    "generates 8 template real files with OOXML parts and prints a JSON report",
    async () => {
    rmSync(OUT, { recursive: true, force: true });
    mkdirSync(OUT, { recursive: true });
    const reports: TemplateArtifactReport[] = [];
    for (const templateId of WORD_TEMPLATE_IDS) {
      const started = Date.now();
      const content = richTemplateBody(templateId);
      const generated = await new DocxDeliverableGenerator().generate(
        content,
        templateId,
        {
          assignment: templateId,
          templateId,
        },
      );
      const genMs = Date.now() - started;
      const persistStarted = Date.now();
      const stored = await saveDeliverableFileDurable(generated, OWNER, {
        sourceContent: content,
        baseFileName: templateId,
      });
      const path = join(OUT, `${templateId}.docx`);
      writeFileSync(path, stored.buffer);
      const names = listZipEntryNames(stored.buffer);
      const template = getWordTemplate(templateId);
      const entriesPresent = {
        documentXml: names.includes("word/document.xml"),
        stylesXml: names.includes("word/styles.xml"),
        numberingXml: names.includes("word/numbering.xml"),
        headerXml: names.some((name) => /^word\/header\d+\.xml$/.test(name)),
        footerXml: names.some((name) => /^word\/footer\d+\.xml$/.test(name)),
      };
      reports.push({
        templateId,
        filename: `${templateId}.docx`,
        size: stored.buffer.byteLength,
        sha256: createHash("sha256").update(stored.buffer).digest("hex"),
        mime: stored.mimeType,
        PK: stored.buffer.subarray(0, 2).toString("latin1") === "PK",
        OOXML: verifyOoxmlStructure(stored.buffer).ok,
        entriesPresent,
        genTimeMs: genMs,
      });
      expect(Date.now() - persistStarted).toBeGreaterThanOrEqual(0);
      expect(entriesPresent.headerXml).toBe(template.showHeader);
      expect(entriesPresent.footerXml).toBe(
        template.showFooter || template.showPageNumbers,
      );
    }
    writeFileSync(
      join(OUT, "templates-report.json"),
      JSON.stringify(reports, null, 2),
    );
    process.stdout.write(
      `${JSON.stringify({ type: "word-stage4-template-report", reports }, null, 2)}\n`,
    );
    expect(reports).toHaveLength(10);
    for (const report of reports) {
      expect(report.PK).toBe(true);
      expect(report.OOXML).toBe(true);
      expect(report.entriesPresent.documentXml).toBe(true);
      expect(report.entriesPresent.stylesXml).toBe(true);
      expect(report.entriesPresent.numberingXml).toBe(true);
      expect(report.size).toBeGreaterThan(1_500);
    }
    },
    120_000,
  );
});
