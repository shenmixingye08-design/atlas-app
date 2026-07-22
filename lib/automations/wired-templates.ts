import type { WorkflowTemplateId } from "./types";

export type WiredAutomationTemplate = {
  id: string;
  templateId: WorkflowTemplateId;
  name: string;
  description: string;
  category: string;
  requiredConnections: Array<"x" | "wordpress" | "google">;
  defaultAssignment: string;
  defaultFormats: Array<"pdf" | "docx" | "xlsx">;
};

/**
 * Only templates with real integrations behind them.
 * Unimplemented flows are omitted — never shown as available.
 */
export const WIRED_AUTOMATION_TEMPLATES: WiredAutomationTemplate[] = [
  {
    id: "sns-x-weekly",
    templateId: "sns_post",
    name: "Xへ週次投稿",
    description: "文案を作成し、確認後にXへ投稿します",
    category: "SNS",
    requiredConnections: ["x"],
    defaultAssignment: "今週の活動をまとめたX投稿文案を作成し、確認後に投稿してください。",
    defaultFormats: ["pdf"],
  },
  {
    id: "blog-wordpress",
    templateId: "blog",
    name: "WordPress記事",
    description: "記事を作成し、下書きとしてWordPressへ保存します",
    category: "ブログ",
    requiredConnections: ["wordpress"],
    defaultAssignment: "テーマに沿ったブログ記事を作成し、WordPressの下書きとして保存してください。",
    defaultFormats: ["docx", "pdf"],
  },
  {
    id: "sales-material",
    templateId: "sales_material",
    name: "営業資料",
    description: "提案資料をPDF/Wordで作成します（外部投稿なし）",
    category: "資料",
    requiredConnections: [],
    defaultAssignment: "クライアント向けの営業提案資料を作成してください。",
    defaultFormats: ["pdf", "docx"],
  },
  {
    id: "generic-report",
    templateId: "generic",
    name: "定期レポート",
    description: "指定内容をまとめて資料化します",
    category: "レポート",
    requiredConnections: [],
    defaultAssignment: "今週の進捗をまとめたレポートを作成してください。",
    defaultFormats: ["pdf", "xlsx"],
  },
];

export function filterWiredTemplates(query: string): WiredAutomationTemplate[] {
  const q = query.trim().toLowerCase();
  if (!q) return WIRED_AUTOMATION_TEMPLATES;
  return WIRED_AUTOMATION_TEMPLATES.filter(
    (t) =>
      t.name.toLowerCase().includes(q) ||
      t.description.toLowerCase().includes(q) ||
      t.category.toLowerCase().includes(q),
  );
}

export function findWiredTemplate(id: string): WiredAutomationTemplate | null {
  return WIRED_AUTOMATION_TEMPLATES.find((t) => t.id === id) ?? null;
}
