import type {
  WorkflowIntegrationKind,
  WorkflowStepDefinition,
  WorkflowTemplateId,
} from "./types";

export type WorkflowTemplate = {
  id: WorkflowTemplateId;
  label: string;
  steps: WorkflowStepDefinition[];
};

/** Preset execution flows — extend by adding templates and integration kinds. */
export const WORKFLOW_TEMPLATES: Record<WorkflowTemplateId, WorkflowTemplate> = {
  sns_post: {
    id: "sns_post",
    label: "SNS投稿",
    steps: [
      { id: "copywriting", label: "文章作成", integration: "atlas" },
      { id: "image_generation", label: "画像生成", integration: "atlas" },
      { id: "schedule_post", label: "投稿予約", integration: "sns" },
      { id: "publish", label: "投稿", integration: "sns" },
      { id: "post_report", label: "投稿後レポート", integration: "atlas" },
    ],
  },
  blog: {
    id: "blog",
    label: "ブログ",
    steps: [
      { id: "outline", label: "構成作成", integration: "atlas" },
      { id: "body", label: "本文作成", integration: "atlas" },
      { id: "eyecatch", label: "アイキャッチ", integration: "atlas" },
      { id: "wordpress_publish", label: "WordPress投稿", integration: "wordpress" },
      { id: "sns_share", label: "SNS共有", integration: "sns" },
    ],
  },
  sales_material: {
    id: "sales_material",
    label: "営業資料",
    steps: [
      { id: "outline", label: "アウトライン", integration: "atlas" },
      { id: "powerpoint", label: "PowerPoint", integration: "atlas" },
      { id: "pdf", label: "PDF", integration: "atlas" },
      { id: "email_send", label: "メール送信", integration: "email" },
      { id: "gdrive_save", label: "Google Drive保存", integration: "google_drive" },
    ],
  },
  video: {
    id: "video",
    label: "動画",
    steps: [
      { id: "user_produces", label: "動画は自分で作る", integration: "manual" },
      { id: "upload_to_atlas", label: "MINERVOTへアップロード", integration: "atlas" },
      { id: "title", label: "タイトル作成", integration: "atlas" },
      { id: "description", label: "説明文作成", integration: "atlas" },
      { id: "sns_post", label: "SNS投稿", integration: "sns" },
      { id: "youtube_publish", label: "YouTube投稿", integration: "youtube" },
    ],
  },
  generic: {
    id: "generic",
    label: "カスタム",
    steps: [
      { id: "plan", label: "計画", integration: "atlas" },
      { id: "draft", label: "下書き作成", integration: "atlas" },
      { id: "review", label: "確認・修正", integration: "atlas" },
      { id: "deliver", label: "納品", integration: "atlas" },
    ],
  },
};

export const WORKFLOW_TEMPLATE_LIST: WorkflowTemplate[] = Object.values(
  WORKFLOW_TEMPLATES,
);

export function getWorkflowTemplate(
  templateId: WorkflowTemplateId,
): WorkflowTemplate {
  return WORKFLOW_TEMPLATES[templateId];
}

export function getStepDefinition(
  templateId: WorkflowTemplateId,
  stepId: string,
): WorkflowStepDefinition | undefined {
  return WORKFLOW_TEMPLATES[templateId]?.steps.find((step) => step.id === stepId);
}

export function isExternalIntegration(
  integration: WorkflowIntegrationKind,
): boolean {
  return integration !== "atlas" && integration !== "manual";
}
