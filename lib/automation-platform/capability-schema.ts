import type { AutomationCapabilityId } from "@/lib/automation-platform/types";

export type CapabilityFieldType =
  | "text"
  | "textarea"
  | "select"
  | "boolean"
  | "number";

export type CapabilityFieldSchema = {
  key: string;
  label: string;
  type: CapabilityFieldType;
  required?: boolean;
  options?: readonly { value: string; label: string }[];
  placeholder?: string;
  helpText?: string;
  /** High-risk fields must be explicit — never filled from memory alone */
  sensitive?: boolean;
};

export type CapabilityFormSchema = {
  capabilityId: AutomationCapabilityId;
  fields: readonly CapabilityFieldSchema[];
};

const SCHEMAS: Record<AutomationCapabilityId, readonly CapabilityFieldSchema[]> = {
  word_generate: [
    {
      key: "documentType",
      label: "文書の種類",
      type: "select",
      options: [
        { value: "report", label: "報告書" },
        { value: "proposal", label: "提案書" },
        { value: "minutes", label: "議事録" },
        { value: "other", label: "その他" },
      ],
    },
    { key: "title", label: "タイトル", type: "text", placeholder: "例: 週次報告書" },
    { key: "tone", label: "文体", type: "select", options: [
      { value: "formal", label: "丁寧・フォーマル" },
      { value: "concise", label: "簡潔" },
      { value: "friendly", label: "やわらかい" },
    ]},
    { key: "pageHint", label: "ページ数目安", type: "number" },
    { key: "useImages", label: "画像を使う", type: "boolean" },
  ],
  excel_generate: [
    {
      key: "tableType",
      label: "表の種類",
      type: "select",
      options: [
        { value: "summary", label: "集計表" },
        { value: "list", label: "一覧" },
        { value: "comparison", label: "比較表" },
      ],
    },
    { key: "includeChart", label: "グラフを含める", type: "boolean" },
    { key: "sheetPlan", label: "シート構成の希望", type: "textarea" },
  ],
  pdf_generate: [
    {
      key: "source",
      label: "元になる成果物",
      type: "select",
      options: [
        { value: "word", label: "Wordから" },
        { value: "powerpoint", label: "PowerPointから" },
        { value: "auto", label: "自動判定" },
      ],
    },
  ],
  powerpoint_generate: [
    { key: "slideCountHint", label: "枚数目安", type: "number" },
    {
      key: "theme",
      label: "配色の傾向",
      type: "select",
      options: [
        { value: "blue", label: "青系" },
        { value: "neutral", label: "落ち着いた色" },
        { value: "brand", label: "ブランド色" },
      ],
    },
  ],
  vision_analysis: [
    { key: "analysisGoal", label: "読み取りたい内容", type: "textarea", required: true },
  ],
  ocr: [
    { key: "language", label: "言語", type: "select", options: [
      { value: "ja", label: "日本語" },
      { value: "en", label: "英語" },
      { value: "auto", label: "自動" },
    ]},
  ],
  file_convert: [
    {
      key: "targetFormat",
      label: "変換後の形式",
      type: "select",
      required: true,
      options: [
        { value: "pdf", label: "PDF" },
        { value: "docx", label: "Word" },
        { value: "xlsx", label: "Excel" },
      ],
    },
  ],
  data_extract: [
    { key: "extractTarget", label: "抽出したい項目", type: "textarea", required: true },
  ],
  gmail: [
    {
      key: "mode",
      label: "メールの扱い",
      type: "select",
      required: true,
      options: [
        { value: "draft", label: "下書きのみ作る" },
        { value: "send", label: "送信する（要確認）" },
        { value: "reply", label: "返信する（要確認）" },
      ],
    },
    { key: "to", label: "宛先", type: "text", sensitive: true, helpText: "記憶だけで自動入力しません" },
    { key: "cc", label: "CC", type: "text", sensitive: true },
    { key: "bcc", label: "BCC", type: "text", sensitive: true },
    { key: "subject", label: "件名", type: "text" },
    { key: "textBody", label: "本文（テキスト）", type: "textarea" },
    { key: "htmlBody", label: "本文（HTML）", type: "textarea" },
    {
      key: "approvalRequired",
      label: "送信前に承認する",
      type: "boolean",
      helpText: "送信・返信は原則ON。下書きのみなら不要です",
    },
  ],
  x_post: [
    { key: "includeImage", label: "画像を付ける", type: "boolean" },
    { key: "hashtags", label: "ハッシュタグ", type: "text", placeholder: "#例" },
  ],
  google_calendar: [
    { key: "eventTitle", label: "予定タイトル", type: "text", required: true },
    {
      key: "action",
      label: "操作",
      type: "select",
      options: [
        { value: "create", label: "新規登録" },
        { value: "update", label: "更新（要確認）" },
        { value: "delete", label: "削除（要確認）" },
      ],
    },
  ],
  wordpress: [
    {
      key: "publishMode",
      label: "公開方法",
      type: "select",
      options: [
        { value: "draft", label: "下書き保存" },
        { value: "publish", label: "公開（要確認）" },
      ],
    },
  ],
  dropbox: [
    { key: "folderPath", label: "保存先フォルダ", type: "text", sensitive: true },
    { key: "fileNamePattern", label: "ファイル名の付け方", type: "text", placeholder: "例: 日付_タイトル" },
    {
      key: "onConflict",
      label: "同名ファイルの扱い",
      type: "select",
      options: [
        { value: "rename", label: "名前を変えて保存" },
        { value: "overwrite", label: "上書き（要確認）" },
        { value: "skip", label: "スキップ" },
      ],
    },
  ],
  notify: [
    { key: "message", label: "通知メッセージの要点", type: "textarea" },
  ],
  await_approval: [],
  condition: [
    { key: "expression", label: "条件の説明", type: "textarea", required: true },
  ],
  wait: [
    { key: "waitMinutes", label: "待機（分）", type: "number", required: true },
  ],
  orchestrate: [
    { key: "assignment", label: "依頼内容", type: "textarea", required: true },
  ],
  deliverable_generate: [
    {
      key: "formats",
      label: "成果物形式",
      type: "select",
      options: [
        { value: "auto", label: "自動" },
        { value: "word", label: "Word" },
        { value: "excel", label: "Excel" },
        { value: "pdf", label: "PDF" },
        { value: "powerpoint", label: "PowerPoint" },
      ],
    },
  ],
};

export function getCapabilityFormSchema(
  capabilityId: AutomationCapabilityId,
): CapabilityFormSchema {
  return {
    capabilityId,
    fields: SCHEMAS[capabilityId] ?? [],
  };
}
