/**
 * Reference Engine — Phase2
 * Treat attachments (image / PDF / Word / Excel) as 参考資料, not sources to copy.
 * Extracts structure / design / chapter / layout / flow hints for quality uplift.
 */

export type ReferenceAttachmentKind =
  | "image"
  | "pdf"
  | "word"
  | "excel"
  | "other";

export type ReferenceInsights = {
  hasReferences: boolean;
  attachmentCount: number;
  kinds: readonly ReferenceAttachmentKind[];
  structureHints: string;
  designHints: string;
  chapterHints: string;
  layoutHints: string;
  flowHints: string;
  /** Compact prompt block — copy forbidden. */
  summary: string;
};

type AttachmentMeta = {
  name?: unknown;
  kind?: unknown;
  mimeType?: unknown;
  note?: unknown;
  extractedText?: unknown;
  structureHints?: unknown;
  designHints?: unknown;
  layoutHints?: unknown;
};

function asString(value: unknown, max = 800): string {
  if (typeof value !== "string") return "";
  const t = value.trim();
  if (!t) return "";
  return t.length > max ? `${t.slice(0, max)}\n[...truncated]` : t;
}

function detectKind(item: AttachmentMeta): ReferenceAttachmentKind {
  const mime = asString(item.mimeType, 80).toLowerCase();
  const name = asString(item.name, 200).toLowerCase();
  const kind = asString(item.kind, 40).toLowerCase();

  if (
    kind.includes("image") ||
    mime.startsWith("image/") ||
    /\.(png|jpe?g|webp|gif)$/i.test(name)
  ) {
    return "image";
  }
  if (kind.includes("pdf") || mime.includes("pdf") || name.endsWith(".pdf")) {
    return "pdf";
  }
  if (
    kind.includes("word") ||
    mime.includes("word") ||
    /\.(docx?|rtf)$/i.test(name)
  ) {
    return "word";
  }
  if (
    kind.includes("excel") ||
    kind.includes("sheet") ||
    mime.includes("sheet") ||
    /\.(xlsx?|csv)$/i.test(name)
  ) {
    return "excel";
  }
  return "other";
}

function inferHintsFromName(
  kind: ReferenceAttachmentKind,
  name: string,
): {
  structure: string;
  design: string;
  chapter: string;
  layout: string;
  flow: string;
} {
  const base = name || "添付資料";
  switch (kind) {
    case "image":
      return {
        structure: `${base}: ビジュアルの情報階層（主役・補足）を参考に。`,
        design: `${base}: 色味・余白・コントラストの印象を参考に（複製禁止）。`,
        chapter: `${base}: 図解のストーリー順を章立てのヒントに。`,
        layout: `${base}: 視線誘導（左上→右下）をページ配置の参考に。`,
        flow: `${base}: 画像が伝える導入→本論の流れを文章構成へ反映。`,
      };
    case "pdf":
      return {
        structure: `${base}: ページ区切りと見出し階層を参考に。`,
        design: `${base}: 余白・段組み・図版配置の印象を参考に。`,
        chapter: `${base}: 目次・章タイトルの粒度を参考に。`,
        layout: `${base}: 印刷時の読みやすさ・1ページ密度を参考に。`,
        flow: `${base}: 表紙→本文→まとめの進行を参考に。`,
      };
    case "word":
      return {
        structure: `${base}: 見出し階層と段落の切り方を参考に。`,
        design: `${base}: 箇条書き・表の使い方を参考に。`,
        chapter: `${base}: 章・節の分け方を参考に。`,
        layout: `${base}: 改ページ・余白の感覚を参考に。`,
        flow: `${base}: 導入→本論→結語の文章の流れを参考に。`,
      };
    case "excel":
      return {
        structure: `${base}: 列構成・シート分割を参考に。`,
        design: `${base}: ヘッダ色分け・テーブル化の方針を参考に。`,
        chapter: `${base}: 集計単位（月別など）を章/セクションのヒントに。`,
        layout: `${base}: 見やすい表幅・結合セル方針を参考に。`,
        flow: `${base}: 入力→集計→要約の流れを参考に。`,
      };
    default:
      return {
        structure: `${base}: 全体構成のヒントとして利用。`,
        design: `${base}: 体裁のヒントとして利用。`,
        chapter: `${base}: 章立てのヒントとして利用。`,
        layout: `${base}: レイアウトのヒントとして利用。`,
        flow: `${base}: 情報の流れのヒントとして利用。`,
      };
  }
}

/**
 * Build reference insights from metadata attachments + optional vision/extracts.
 * No LLM. Copying source text into the deliverable is forbidden by prompt rules.
 */
export function buildReferenceInsights(
  metadata?: Readonly<Record<string, unknown>> | null,
): ReferenceInsights {
  const meta = (metadata ?? {}) as Record<string, unknown>;
  const rawAttachments = Array.isArray(meta.attachments)
    ? (meta.attachments as AttachmentMeta[])
    : [];
  const referenceDocs = Array.isArray(meta.referenceDocuments)
    ? (meta.referenceDocuments as AttachmentMeta[])
    : [];
  const items = [...rawAttachments, ...referenceDocs];

  const kinds: ReferenceAttachmentKind[] = [];
  const structure: string[] = [];
  const design: string[] = [];
  const chapter: string[] = [];
  const layout: string[] = [];
  const flow: string[] = [];

  for (const item of items.slice(0, 12)) {
    const kind = detectKind(item);
    kinds.push(kind);
    const name = asString(item.name, 120) || "添付ファイル";
    const inferred = inferHintsFromName(kind, name);
    structure.push(asString(item.structureHints) || inferred.structure);
    design.push(asString(item.designHints) || inferred.design);
    chapter.push(inferred.chapter);
    layout.push(asString(item.layoutHints) || inferred.layout);
    flow.push(inferred.flow);

    const extracted = asString(item.extractedText, 400);
    if (extracted) {
      structure.push(
        `${name}: 抽出テキストから構成キーワードのみ参考（本文コピー禁止）。`,
      );
    }
  }

  const vision =
    asString(meta.visionAnalysis, 600) ||
    asString(meta.visionResult, 600) ||
    (meta.vision && typeof meta.vision === "object"
      ? asString(JSON.stringify(meta.vision), 600)
      : "");
  if (vision) {
    design.push(`Vision解析の視覚ヒント（矛盾禁止）: ${vision.slice(0, 300)}`);
    flow.push("Visionが示す情報の優先順位を文章の流れへ反映。");
  }

  const explicitRef = asString(meta.referenceInsights, 1_000);
  if (explicitRef) {
    structure.push(explicitRef);
  }

  const hasReferences = items.length > 0 || Boolean(vision) || Boolean(explicitRef);
  const structureHints = structure.join("\n").slice(0, 1_200);
  const designHints = design.join("\n").slice(0, 1_200);
  const chapterHints = chapter.join("\n").slice(0, 800);
  const layoutHints = layout.join("\n").slice(0, 800);
  const flowHints = flow.join("\n").slice(0, 800);

  const summary = hasReferences
    ? [
        "参考資料（Reference Engine）— コピー禁止。品質向上の参考のみ。",
        structureHints ? `構成:\n${structureHints}` : "",
        designHints ? `デザイン:\n${designHints}` : "",
        chapterHints ? `章立て:\n${chapterHints}` : "",
        layoutHints ? `レイアウト:\n${layoutHints}` : "",
        flowHints ? `文章の流れ:\n${flowHints}` : "",
      ]
        .filter(Boolean)
        .join("\n\n")
        .slice(0, 2_800)
    : "";

  return {
    hasReferences,
    attachmentCount: items.length,
    kinds,
    structureHints,
    designHints,
    chapterHints,
    layoutHints,
    flowHints,
    summary,
  };
}
