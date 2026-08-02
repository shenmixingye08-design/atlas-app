import {
  createEmptyWizardDraft,
  createStepFromCapability,
} from "@/lib/automation-platform/wizard/builders";
import type { AutomationWizardDraft } from "@/lib/automation-platform/wizard/types";
import type { WorkCategoryId } from "@/lib/automation-platform/wizard/categories";
import type { AutomationCapabilityId } from "@/lib/automation-platform/types";

/**
 * First-time templates — 「仕事を任せる」入口。
 * No jargon. Seeds draft without touching execution cores.
 */
export type JobTemplateId =
  | "sales_deck"
  | "sns_post"
  | "accounting"
  | "documents"
  | "vision"
  | "blog"
  | "report"
  | "email_digest"
  | "receipt"
  | "dropbox_organize"
  | "freeform";

export type JobTemplate = {
  id: JobTemplateId;
  label: string;
  description: string;
  group: "営業" | "SNS" | "経理" | "資料作成" | "画像解析" | "ブログ" | "レポート" | "メール" | "その他";
  categoryIds: WorkCategoryId[];
  capabilityIds: AutomationCapabilityId[];
  defaultNotes: string;
  defaultFrequency: AutomationWizardDraft["frequency"];
  defaultTrigger: AutomationWizardDraft["triggerType"];
  daysOfWeek?: number[];
  hour?: number;
  memoryEnabled?: boolean;
  notifyOnSuccess?: boolean;
  executionMode?: AutomationWizardDraft["executionMode"];
};

export const JOB_TEMPLATES: readonly JobTemplate[] = [
  {
    id: "sales_deck",
    label: "営業資料作成",
    description: "毎週の営業資料を Word / PDF で用意",
    group: "営業",
    categoryIds: ["document", "storage"],
    capabilityIds: ["word_generate", "pdf_generate", "dropbox", "notify"],
    defaultNotes: "営業資料なので箇条書きで、A4一枚、青系デザイン",
    defaultFrequency: "weekly",
    defaultTrigger: "schedule",
    daysOfWeek: [5],
    hour: 18,
    memoryEnabled: true,
  },
  {
    id: "sns_post",
    label: "X投稿",
    description: "投稿文を用意して X へ",
    group: "SNS",
    categoryIds: ["sns"],
    capabilityIds: ["x_post", "notify"],
    defaultNotes: "短く、絵文字は控えめ",
    defaultFrequency: "daily",
    defaultTrigger: "schedule",
    hour: 9,
    memoryEnabled: true,
    executionMode: "review_before_run",
  },
  {
    id: "accounting",
    label: "請求書整理",
    description: "請求まわりの書類を整理",
    group: "経理",
    categoryIds: ["spreadsheet", "storage"],
    capabilityIds: ["excel_generate", "dropbox", "notify"],
    defaultNotes: "請求書を月次で整理",
    defaultFrequency: "monthly",
    defaultTrigger: "schedule",
    hour: 10,
  },
  {
    id: "receipt",
    label: "レシート家計簿",
    description: "レシート写真から家計簿へ",
    group: "経理",
    categoryIds: ["vision", "spreadsheet"],
    capabilityIds: ["ocr", "excel_generate", "notify"],
    defaultNotes: "レシートを読み取り、家計簿シートへ追記",
    defaultFrequency: "weekly",
    defaultTrigger: "schedule",
    daysOfWeek: [0],
    hour: 20,
  },
  {
    id: "email_digest",
    label: "毎朝メール要約",
    description: "朝一番にメールの要点をまとめる",
    group: "メール",
    categoryIds: ["email"],
    capabilityIds: ["gmail", "notify"],
    defaultNotes: "重要メールだけ短く要約",
    defaultFrequency: "weekdays",
    defaultTrigger: "schedule",
    hour: 8,
    memoryEnabled: true,
  },
  {
    id: "dropbox_organize",
    label: "Dropbox整理",
    description: "フォルダへ振り分けて保存",
    group: "その他",
    categoryIds: ["storage"],
    capabilityIds: ["dropbox", "notify"],
    defaultNotes: "営業フォルダへ整理して保存",
    defaultFrequency: "weekly",
    defaultTrigger: "schedule",
    daysOfWeek: [1],
    hour: 17,
  },
  {
    id: "vision",
    label: "画像をExcel化",
    description: "写真・書類を表に変換",
    group: "画像解析",
    categoryIds: ["vision", "spreadsheet"],
    capabilityIds: ["vision_analysis", "excel_generate", "notify"],
    defaultNotes: "画像から表データを抜き出す",
    defaultTrigger: "manual",
    defaultFrequency: "weekly",
  },
  {
    id: "documents",
    label: "Word / PowerPoint作成",
    description: "文書やスライドを作成",
    group: "資料作成",
    categoryIds: ["document"],
    capabilityIds: ["word_generate", "powerpoint_generate", "pdf_generate", "notify"],
    defaultNotes: "分かりやすく、短めに",
    defaultTrigger: "manual",
    defaultFrequency: "weekly",
    memoryEnabled: true,
  },
  {
    id: "blog",
    label: "ブログ",
    description: "記事下書き〜投稿",
    group: "ブログ",
    categoryIds: ["blog"],
    capabilityIds: ["wordpress", "word_generate", "notify"],
    defaultNotes: "読みやすい文体で",
    defaultFrequency: "weekly",
    defaultTrigger: "schedule",
    daysOfWeek: [3],
    hour: 11,
    executionMode: "review_before_run",
  },
  {
    id: "report",
    label: "レポート",
    description: "週次・月次の報告資料",
    group: "レポート",
    categoryIds: ["document", "spreadsheet"],
    capabilityIds: ["word_generate", "excel_generate", "pdf_generate", "notify"],
    defaultNotes: "結論ファーストで1枚にまとめる",
    defaultFrequency: "weekly",
    defaultTrigger: "schedule",
    daysOfWeek: [5],
    hour: 16,
    memoryEnabled: true,
  },
  {
    id: "freeform",
    label: "自由入力",
    description: "希望を文章で書いて任せる",
    group: "その他",
    categoryIds: ["combine"],
    capabilityIds: ["orchestrate", "notify"],
    defaultNotes: "",
    defaultTrigger: "manual",
    defaultFrequency: "weekly",
  },
] as const;

export function applyJobTemplate(
  template: JobTemplate,
  base?: Partial<AutomationWizardDraft>,
): AutomationWizardDraft {
  const steps = template.capabilityIds.map((id) => createStepFromCapability(id));
  return createEmptyWizardDraft({
    ...base,
    name: template.label,
    description: template.description,
    categoryIds: [...template.categoryIds],
    steps,
    freeformNotes: template.defaultNotes,
    naturalLanguageSeed: template.defaultNotes,
    triggerType: template.defaultTrigger,
    frequency: template.defaultFrequency,
    daysOfWeek: template.daysOfWeek ?? [5],
    hour: template.hour ?? 18,
    minute: 0,
    memoryEnabled: template.memoryEnabled ?? false,
    memoryAllowedScopes: template.memoryEnabled
      ? ["writing_style", "document_design", "preferred_formats", "recurring_work_preferences"]
      : [],
    notifyOnSuccess: template.notifyOnSuccess ?? true,
    notifyOnFailure: true,
    executionMode: template.executionMode ?? "review_before_run",
    activateOnCreate: true,
    currentStepId: "timing",
  });
}

export const COMPOSER_STEP_ORDER = [
  "work",
  "timing",
  "steps",
  "notifications",
  "memory",
  "notes",
  "review",
] as const;

export const COMPOSER_STEP_LABELS: Record<
  (typeof COMPOSER_STEP_ORDER)[number],
  string
> = {
  work: "何を任せる",
  timing: "いつ",
  steps: "成果物",
  notifications: "知らせ方",
  memory: "覚え方",
  notes: "くわしく",
  review: "確認して任せる",
};
