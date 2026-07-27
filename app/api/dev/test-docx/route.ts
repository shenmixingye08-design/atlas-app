import { auth } from "@clerk/nextjs/server";
import { mkdirSync, writeFileSync, readFileSync, existsSync } from "fs";
import { join } from "path";
import { execFileSync } from "child_process";

import { checkAtlasOwner } from "@/lib/auth/require-atlas-owner";
import { DocxDeliverableGenerator } from "@/lib/deliverables/generators/docx-generator";
import {
  listDocxStageLogs,
  logDocxStage,
  resetDocxStageLogsForTests,
} from "@/lib/deliverables/docx-stage-log";
import { verifyGeneratedExport } from "@/lib/deliverables/export-verify";
import { parseDeliverableContent } from "@/lib/deliverables/parse-content";
import {
  getStoredDeliverableForUser,
  resetDeliverableMemoryStoreForTests,
  saveDeliverableFileDurable,
  toDeliverableMetadata,
} from "@/lib/deliverables/store";
import { DELIVERABLE_MIME_TYPES } from "@/lib/deliverables/types";
import { buildAttachmentContentDisposition } from "@/lib/http/content-disposition";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const SAMPLE_BODY = `# 営業報告書

## 概要

本日は栃木県内の太陽光発電予定地を訪問しました。

## 対応内容

・地権者への説明
・現地写真撮影
・測量範囲確認

## 今後

1.見積作成
2.関係者連絡
3.次回訪問
`;

type StageResult = {
  ok: boolean;
  detail?: string;
  error?: string;
};

/**
 * Owner-only diagnostic: fixed sample → parse → pack → verify → store → download.
 */
export async function POST(): Promise<Response> {
  const { userId } = await auth();
  if (!userId) {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }
  const isOwner = await checkAtlasOwner();
  if (!isOwner) {
    return Response.json({ error: "Forbidden" }, { status: 403 });
  }

  resetDocxStageLogsForTests();
  const stages: Record<string, StageResult> = {
    parse: { ok: false },
    pack: { ok: false },
    verify: { ok: false },
    store: { ok: false },
    download: { ok: false },
  };

  const outDir = "/opt/cursor/artifacts/test-docx";
  mkdirSync(outDir, { recursive: true });

  try {
    const parsed = parseDeliverableContent(SAMPLE_BODY);
    const hasHeading = parsed.sections.some((s) => s.level >= 1);
    const hasBullet = parsed.sections.some((s) =>
      s.blocks.some((b) => b.type === "bulletList"),
    );
    const hasNumbered = parsed.sections.some((s) =>
      s.blocks.some((b) => b.type === "numberedList"),
    );
    stages.parse = {
      ok: hasHeading && hasBullet && hasNumbered,
      detail: `sections=${parsed.sections.length} bullet=${hasBullet} numbered=${hasNumbered}`,
    };
    if (!stages.parse.ok) {
      stages.parse.error =
        "見出し・箇条書き・番号付きリストの解析に失敗しました";
    }

    const generated = await new DocxDeliverableGenerator().generate(
      SAMPLE_BODY,
      "営業報告書",
    );
    const pk =
      generated.buffer[0] === 0x50 && generated.buffer[1] === 0x4b;
    stages.pack = {
      ok:
        pk &&
        generated.buffer.byteLength >= 1_500 &&
        generated.fileName.endsWith(".docx"),
      detail: `size=${generated.buffer.byteLength} pk=${pk}`,
    };

    const verified = verifyGeneratedExport(generated);
    stages.verify = {
      ok: verified.ok,
      detail: verified.reasons.join(",") || "ok",
      error: verified.ok ? undefined : verified.reasons.join(","),
    };

    const stored = await saveDeliverableFileDurable(generated, userId, {
      sourceContent: SAMPLE_BODY,
      baseFileName: "営業報告書",
    });
    const meta = toDeliverableMetadata(stored);
    logDocxStage(
      "DOCX_DOWNLOAD_READY",
      { userId },
      { deliverableId: stored.id, downloadUrl: meta.downloadUrl },
    );
    stages.store = {
      ok: Boolean(stored.id) && stored.buffer.byteLength >= 1_500,
      detail: `id=${stored.id} downloadUrl=${meta.downloadUrl}`,
    };

    // Simulate authenticated download response (same headers as /api/deliverables/[id]).
    const contentType = DELIVERABLE_MIME_TYPES.docx;
    const disposition = buildAttachmentContentDisposition(stored.fileName);
    const body = Buffer.from(stored.buffer);
    const downloadResponse = new Response(body, {
      status: 200,
      headers: {
        "Content-Type": contentType,
        "Content-Disposition": disposition,
        "Content-Length": String(body.byteLength),
      },
    });

    const downloadOk =
      downloadResponse.status === 200 &&
      contentType ===
        "application/vnd.openxmlformats-officedocument.wordprocessingml.document" &&
      body.byteLength >= 1_500 &&
      body[0] === 0x50 &&
      body[1] === 0x4b &&
      !contentType.includes("json") &&
      !contentType.includes("html");

    const filePath = join(outDir, "diagnostic.docx");
    writeFileSync(filePath, body);
    let wordOpenable = false;
    let japaneseOk = false;
    try {
      const listing = execFileSync("unzip", ["-l", filePath]).toString();
      wordOpenable =
        listing.includes("word/document.xml") &&
        listing.includes("[Content_Types].xml");
      execFileSync("unzip", ["-o", filePath, "-d", join(outDir, "unzipped")]);
      const docXmlPath = join(outDir, "unzipped", "word", "document.xml");
      if (existsSync(docXmlPath)) {
        const docXml = readFileSync(docXmlPath, "utf8");
        japaneseOk =
          docXml.includes("営業報告書") ||
          docXml.includes("栃木") ||
          docXml.includes("太陽光発電");
      }
    } catch {
      wordOpenable = false;
    }

    // Ensure hydrate works after memory clear (disk/durable fallback).
    resetDeliverableMemoryStoreForTests();
    const hydrated = await getStoredDeliverableForUser(stored.id, userId);

    stages.download = {
      ok: downloadOk && wordOpenable && japaneseOk && Boolean(hydrated),
      detail: `status=200 type=${contentType} size=${body.byteLength} openable=${wordOpenable} ja=${japaneseOk} hydrated=${Boolean(hydrated)}`,
      error:
        downloadOk && wordOpenable && japaneseOk
          ? hydrated
            ? undefined
            : "hydrate after memory clear failed"
          : "download/open validation failed",
    };

    return Response.json({
      ok: Object.values(stages).every((s) => s.ok),
      stages,
      disposition,
      stageLogs: listDocxStageLogs(20),
      sampleTitle: parsed.title,
      filePath,
    });
  } catch (error) {
    const message =
      error instanceof Error ? error.message : String(error ?? "unknown");
    return Response.json(
      {
        ok: false,
        stages,
        error: message,
        stageLogs: listDocxStageLogs(20),
      },
      { status: 500 },
    );
  }
}

export async function GET(): Promise<Response> {
  return POST();
}
