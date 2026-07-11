import { classifyDeliverableType } from "@/lib/orchestration/deliverable-classification";
import { inferWorkflowTemplate } from "@/lib/automations/execution-flow";
import { getWorkflowTemplate } from "@/lib/automations/workflow-templates";
import type { WorkflowTemplateId } from "@/lib/automations/types";
import type { ExternalServiceId } from "@/lib/integrations/external-services/types";
import type { DeliverableType } from "@/lib/orchestration/deliverable-types";

import type { CommanderClassification } from "./types";

export type InferredExternalNeed = {
  serviceId: ExternalServiceId | "line" | "stripe";
  label: string;
  required: boolean;
  reason: string;
};

const DELIVERABLE_LABELS: Record<DeliverableType, string> = {
  email: "メール",
  blog: "ブログ",
  report: "レポート",
  proposal: "提案書",
  presentation: "プレゼン資料",
  research: "調査",
  document: "ドキュメント",
  social_post: "SNS投稿",
  short_document: "短文ドキュメント",
};

export function classifyCommanderWork(assignment: string): CommanderClassification {
  const deliverableType = classifyDeliverableType(assignment);
  const templateId = inferWorkflowTemplate(assignment);
  const keywords = extractKeywords(assignment);

  return {
    deliverableType,
    templateId,
    summary: `${DELIVERABLE_LABELS[deliverableType]}（テンプレート: ${getWorkflowTemplate(templateId).label}）`,
    keywords,
  };
}

function extractKeywords(assignment: string): string[] {
  const patterns: Array<{ re: RegExp; key: string }> = [
    { re: /gmail|メール|mail/i, key: "mail" },
    { re: /calendar|予定|カレンダー/i, key: "calendar" },
    { re: /drive|ドライブ/i, key: "drive" },
    { re: /dropbox/i, key: "dropbox" },
    { re: /line/i, key: "line" },
    { re: /stripe|決済|請求/i, key: "stripe" },
    { re: /sns|x投稿|twitter|instagram|投稿/i, key: "sns" },
    { re: /wordpress|ブログ|記事/i, key: "blog" },
    { re: /youtube|動画/i, key: "video" },
    { re: /notion/i, key: "notion" },
    { re: /調査|リサーチ|research/i, key: "research" },
    { re: /毎日|毎週|毎月|定期/i, key: "recurring" },
  ];

  const found: string[] = [];
  for (const { re, key } of patterns) {
    if (re.test(assignment)) found.push(key);
  }
  return found;
}

/** Map template integrations + keywords → required external services. */
export function inferRequiredExternalServices(
  assignment: string,
  templateId: WorkflowTemplateId,
): InferredExternalNeed[] {
  const needs = new Map<string, InferredExternalNeed>();
  const template = getWorkflowTemplate(templateId);

  const add = (need: InferredExternalNeed) => {
    const existing = needs.get(need.serviceId);
    if (!existing || (need.required && !existing.required)) {
      needs.set(need.serviceId, need);
    }
  };

  for (const step of template.steps) {
    switch (step.integration) {
      case "google_drive":
        add({
          serviceId: "google",
          label: "Google Drive",
          required: false,
          reason: `テンプレート「${template.label}」の ${step.label}`,
        });
        break;
      case "dropbox":
        add({
          serviceId: "dropbox",
          label: "Dropbox",
          required: false,
          reason: `テンプレート「${template.label}」の ${step.label}`,
        });
        break;
      case "sns":
        add({
          serviceId: "x",
          label: "X (SNS)",
          required: false,
          reason: `テンプレート「${template.label}」の ${step.label}`,
        });
        break;
      case "wordpress":
        add({
          serviceId: "wordpress",
          label: "WordPress",
          required: false,
          reason: `テンプレート「${template.label}」の ${step.label}`,
        });
        break;
      case "youtube":
        add({
          serviceId: "youtube",
          label: "YouTube",
          required: false,
          reason: `テンプレート「${template.label}」の ${step.label}`,
        });
        break;
      case "email":
        add({
          serviceId: "google",
          label: "Gmail",
          required: false,
          reason: `テンプレート「${template.label}」の ${step.label}`,
        });
        break;
      default:
        break;
    }
  }

  if (/gmail|メール|mail/i.test(assignment)) {
    add({
      serviceId: "google",
      label: "Gmail / Google",
      required: true,
      reason: "依頼文にメール関連の要件があります",
    });
  }
  if (/calendar|予定|カレンダー/i.test(assignment)) {
    add({
      serviceId: "google",
      label: "Google Calendar",
      required: true,
      reason: "依頼文にカレンダー関連の要件があります",
    });
  }
  if (/drive|ドライブに保存|Google Drive/i.test(assignment)) {
    add({
      serviceId: "google",
      label: "Google Drive",
      required: true,
      reason: "依頼文に Drive 保存の要件があります",
    });
  }
  if (/dropbox/i.test(assignment)) {
    add({
      serviceId: "dropbox",
      label: "Dropbox",
      required: true,
      reason: "依頼文に Dropbox の要件があります",
    });
  }
  if (/line/i.test(assignment)) {
    add({
      serviceId: "line",
      label: "LINE",
      required: true,
      reason: "依頼文に LINE 通知の要件があります",
    });
  }
  if (/stripe|決済|請求/i.test(assignment)) {
    add({
      serviceId: "stripe",
      label: "Stripe",
      required: false,
      reason: "依頼文に決済関連の言及があります",
    });
  }
  if (/notion/i.test(assignment)) {
    add({
      serviceId: "notion",
      label: "Notion",
      required: false,
      reason: "依頼文に Notion の言及があります",
    });
  }

  return Array.from(needs.values());
}

export function isRecurringAssignment(assignment: string): boolean {
  return /毎日|毎週|毎月|定期|習慣|任せ/i.test(assignment);
}
