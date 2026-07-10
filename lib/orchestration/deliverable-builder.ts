import type {
  AgentPhaseResult,
  ResearchStageResult,
  TaskExecutionResult,
} from "./types";
import type {
  Deliverable,
  DeliverableMetadata,
  DeliverableType,
  WorkerDeliverablePayload,
} from "./deliverable-types";
import {
  defaultDownloads,
  emptyDeliverable,
} from "./deliverable-types";
import { classifyDeliverableType } from "./deliverable-classification";
import {
  normalizeEmailDeliverable,
  normalizeEmailPayload,
} from "./email-deliverable";
import { parseWorkerDeliverablePayload, tryParseStoredDeliverable } from "./worker-output";

type BuildDeliverableParams = {
  assignment: string;
  executions: readonly TaskExecutionResult[];
  research?: ResearchStageResult;
  plannerPlan?: AgentPhaseResult | null;
  expectedType?: DeliverableType;
};

function pickPrimaryPayload(
  payloads: Array<{ payload: WorkerDeliverablePayload; taskId: number }>,
  executions: readonly TaskExecutionResult[],
  expectedType?: DeliverableType,
): { payload: WorkerDeliverablePayload; taskId: number } | null {
  if (payloads.length === 0) return null;

  if (expectedType) {
    const typed = payloads.find((item) => item.payload.type === expectedType);
    if (typed) return typed;
  }

  const preferredIndex = executions.findIndex((exec) =>
    /ブログ|blog|記事|投稿|article|report|提案|proposal|メール|email|営業|slide|プレゼン/i.test(
      `${exec.task.title} ${exec.task.description}`,
    ),
  );

  if (preferredIndex >= 0) {
    const match = payloads.find((item) => item.taskId === executions[preferredIndex]?.task.id);
    if (match) return match;
  }

  return payloads.reduce((best, current) =>
    current.payload.content.length > best.payload.content.length ? current : best,
  );
}

function markdownToHtml(markdown: string): string {
  return markdown
    .split("\n\n")
    .map((block) => {
      const trimmed = block.trim();
      if (!trimmed) return "";
      if (trimmed.startsWith("### ")) return `<h3>${trimmed.slice(4)}</h3>`;
      if (trimmed.startsWith("## ")) return `<h2>${trimmed.slice(3)}</h2>`;
      if (trimmed.startsWith("# ")) return `<h1>${trimmed.slice(2)}</h1>`;
      if (trimmed.startsWith("- ")) {
        const items = trimmed
          .split("\n")
          .filter((line) => line.startsWith("- "))
          .map((line) => `<li>${line.slice(2)}</li>`)
          .join("");
        return `<ul>${items}</ul>`;
      }
      return `<p>${trimmed}</p>`;
    })
    .filter(Boolean)
    .join("\n");
}

function buildMetadata(
  payload: WorkerDeliverablePayload,
  taskId: number,
  workerCount: number,
): DeliverableMetadata {
  return {
    tags: payload.tags ?? [],
    seo: {
      title: payload.seo?.title || payload.title,
      description: payload.seo?.description || payload.summary,
      keywords: payload.seo?.keywords ?? payload.tags ?? [],
    },
    snsPost: payload.snsPost ?? "",
    topic: payload.topic || payload.title,
    audience: payload.audience ?? "",
    subject: payload.subject ?? "",
    purpose: payload.purpose ?? "",
    cta: payload.cta ?? "",
    posts: payload.posts ?? [],
    sourceTaskId: taskId,
    workerCount,
  };
}

function composeMarkdown(deliverable: Omit<Deliverable, "markdown" | "html" | "plainText" | "downloads">): string {
  const { type, title, summary, content, metadata } = deliverable;
  const sections: string[] = [`# ${title}`, ""];

  if (summary) {
    sections.push("## 概要", summary, "");
  }

  switch (type) {
    case "blog":
      sections.push(
        "## SEO",
        `Title: ${metadata.seo.title}`,
        `Description: ${metadata.seo.description}`,
        metadata.seo.keywords.length > 0
          ? `Keywords: ${metadata.seo.keywords.join(", ")}`
          : "",
        "",
        "## 推奨タグ",
        metadata.tags.join(", ") || "—",
        "",
        "## 記事本文",
        content,
      );
      if (metadata.snsPost) {
        sections.push("", "## SNS投稿文", metadata.snsPost);
      }
      break;
    case "email":
      sections.push("## メール本文", content);
      if (metadata.audience) sections.push("", "## 宛先/想定読者", metadata.audience);
      break;
    case "social_post":
      if ((metadata.posts?.length ?? 0) > 0) {
        metadata.posts!.forEach((post, index) => {
          sections.push("", `## 投稿 ${index + 1}`, post);
        });
      } else {
        sections.push("## 投稿", content);
      }
      break;
    case "short_document":
      sections.push("## 本文", content);
      break;
    case "presentation":
      sections.push("## スライド内容", content);
      break;
    case "research":
      sections.push("## 調査結果", content);
      if (metadata.topic) sections.push("", "## トピック", metadata.topic);
      break;
    default:
      sections.push("## 本文", content);
      break;
  }

  return sections.filter(Boolean).join("\n");
}

function payloadToDeliverable(
  payload: WorkerDeliverablePayload,
  taskId: number,
  workerCount: number,
  assignment = "",
): Deliverable {
  const normalizedPayload =
    payload.type === "email" ? normalizeEmailPayload(payload, assignment) : payload;
  const type = normalizedPayload.type ?? "document";
  const metadata = buildMetadata(normalizedPayload, taskId, workerCount);

  const base = {
    type,
    title: normalizedPayload.title,
    summary: normalizedPayload.summary,
    content: normalizedPayload.content,
    metadata,
  };

  const markdown = normalizedPayload.markdown.trim() || composeMarkdown(base);
  const html = normalizedPayload.html.trim() || markdownToHtml(markdown);
  const plainText =
    normalizedPayload.plainText.trim() ||
    normalizedPayload.content.replace(/[#*_`>-]/g, " ").replace(/\s+/g, " ").trim();

  const deliverable: Deliverable = {
    ...base,
    markdown,
    html,
    plainText,
    downloads: defaultDownloads(type).map((item) => ({ ...item, ready: true })),
  };

  return type === "email" ? normalizeEmailDeliverable(deliverable, assignment) : deliverable;
}

/** Build a structured deliverable directly from worker output — no string collapse. */
export function buildDeliverable(params: BuildDeliverableParams): Deliverable {
  const expectedType =
    params.expectedType ?? classifyDeliverableType(params.assignment);
  const completed = params.executions.filter(
    (exec) => exec.workerStatus === "completed" && exec.worker,
  );

  const payloads = completed
    .map((exec) => {
      const raw = exec.worker!.result.outputText;
      const stored = tryParseStoredDeliverable(raw);
      if (stored) {
        if (expectedType && stored.type !== expectedType) {
          stored.type = expectedType;
        }
        return {
          payload: {
            type: stored.type,
            title: stored.title,
            summary: stored.summary,
            content: stored.content,
            markdown: stored.markdown,
            html: stored.html,
            plainText: stored.plainText,
            tags: stored.metadata.tags,
            seo: stored.metadata.seo,
            snsPost: stored.metadata.snsPost,
            topic: stored.metadata.topic,
            subject: stored.metadata.subject,
            purpose: stored.metadata.purpose,
            cta: stored.metadata.cta,
          },
          taskId: exec.task.id,
        };
      }

      const payload = parseWorkerDeliverablePayload(
        raw,
        params.assignment,
        `${exec.task.title} ${exec.task.description}`,
        expectedType,
      );
      return payload ? { payload, taskId: exec.task.id } : null;
    })
    .filter((item): item is { payload: WorkerDeliverablePayload; taskId: number } => item !== null);

  const primary = pickPrimaryPayload(payloads, params.executions, expectedType);
  if (primary) {
    const deliverable = payloadToDeliverable(
      primary.payload,
      primary.taskId,
      completed.length,
      params.assignment,
    );
    if (expectedType && deliverable.type !== expectedType) {
      deliverable.type = expectedType;
    }
    return deliverable;
  }

  return emptyDeliverable(expectedType);
}

/** Human-readable summary for finalResponse — not the deliverable body. */
export function buildFinalResponseSummary(deliverable: Deliverable): string {
  if (!deliverable.title.trim() && !deliverable.summary.trim()) {
    return "";
  }

  const typeLabel: Record<DeliverableType, string> = {
    blog: "ブログ記事",
    report: "レポート",
    proposal: "提案書",
    presentation: "プレゼン資料",
    research: "調査結果",
    email: "メール",
    social_post: "SNS投稿",
    short_document: "短文ドキュメント",
    document: "成果物",
  };

  const parts = [
    `${typeLabel[deliverable.type]}「${deliverable.title || "成果物"}」を作成しました。`,
  ];

  if (deliverable.summary.trim()) {
    parts.push("", deliverable.summary.trim());
  }

  return parts.join("\n");
}

/** QA / CEO review input — primary worker body only. */
export function buildDeliverableReviewText(params: BuildDeliverableParams): string {
  const deliverable = buildDeliverable(params);
  return deliverable.markdown || deliverable.content || deliverable.plainText;
}

/** @deprecated Use {@link buildDeliverable} */
export const buildWorkflowDeliverable = buildDeliverable;
