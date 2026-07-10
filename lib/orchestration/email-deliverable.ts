import type { Deliverable, WorkerDeliverablePayload } from "./deliverable-types";

export type EmailParts = {
  subject: string;
  body: string;
};

/** Extract 件名 / subject and body from email text (plain or structured). */
export function extractEmailParts(text: string): EmailParts {
  const trimmed = text.trim();
  if (!trimmed) return { subject: "", body: "" };

  const subjectLine = trimmed.match(/^(?:件名|subject)[:：]\s*(.+?)(?:\n|$)/im);
  if (subjectLine) {
    const subject = subjectLine[1]?.trim() ?? "";
    const body = trimmed
      .replace(/^(?:件名|subject)[:：].+?(?:\n|$)/im, "")
      .replace(/^(?:本文|body)[:：]\s*/im, "")
      .trim();
    return { subject, body };
  }

  const markdownSubject = trimmed.match(/^##\s*件名\s*\n+(.+?)(?:\n\n|$)/im);
  if (markdownSubject) {
    const subject = markdownSubject[1]?.trim() ?? "";
    const body = trimmed.replace(/^##\s*件名\s*\n+.+?(?:\n\n|$)/im, "").trim();
    const bodyOnly = body.replace(/^##\s*本文\s*\n+/im, "").trim();
    return { subject, body: bodyOnly };
  }

  return { subject: "", body: trimmed };
}

export function buildEmailMarkdown(subject: string, body: string): string {
  const sections = ["## 件名", subject || "（件名なし）", "", "## 本文", body || ""];
  return sections.join("\n").trim();
}

/** Normalize worker payload fields for email deliverables. */
export function normalizeEmailPayload(
  payload: WorkerDeliverablePayload,
  assignment = "",
): WorkerDeliverablePayload {
  let subject =
    payload.subject?.trim() ||
    extractEmailParts(payload.content).subject ||
    extractEmailParts(payload.markdown).subject ||
    extractEmailParts(payload.plainText).subject;

  let body =
    extractEmailParts(payload.content).body ||
    payload.content.trim() ||
    extractEmailParts(payload.markdown).body ||
    payload.markdown.trim();

  if (!body && payload.plainText.trim()) {
    body = extractEmailParts(payload.plainText).body || payload.plainText.trim();
  }

  if (!subject && payload.title.trim() && !/営業メール|メール|email/i.test(payload.title)) {
    subject = payload.title;
  }

  if (!subject && assignment) {
    const hint = assignment.split("\n")[0]?.trim() ?? "";
    if (hint.length <= 80) subject = hint.slice(0, 80);
  }

  const summary =
    payload.summary.trim() ||
    `建設会社向けの営業メール${subject ? ` — ${subject}` : ""}`.slice(0, 200);

  const markdown =
    payload.markdown.trim() && /^##\s*件名/m.test(payload.markdown)
      ? payload.markdown.trim()
      : buildEmailMarkdown(subject, body);

  const content =
    payload.content.trim() && /(?:件名|subject)[:：]/i.test(payload.content)
      ? payload.content.trim()
      : subject
        ? `件名：${subject}\n\n${body}`
        : body;

  const plainText =
    payload.plainText.trim() ||
    (subject ? `件名：${subject}\n\n${body}` : body).replace(/[#*_`>-]/g, " ").trim();

  return {
    ...payload,
    type: "email",
    title: payload.title.trim() || "営業メール",
    summary,
    subject,
    content,
    markdown,
    plainText,
    audience: payload.audience?.trim() || "建設会社",
    purpose: payload.purpose?.trim() || inferEmailPurpose(assignment),
    cta: payload.cta?.trim() || "お問い合わせ・商談設定",
    tags: payload.tags ?? [],
    seo: payload.seo ?? { title: subject || payload.title, description: summary, keywords: [] },
    snsPost: "",
  };
}

function inferEmailPurpose(assignment: string): string {
  if (/太陽光|ソーラー|solar/i.test(assignment)) return "太陽光発電の営業";
  if (/営業|sales/i.test(assignment)) return "営業提案";
  return "ビジネスメール";
}

/** Apply email normalization to a built deliverable. */
export function normalizeEmailDeliverable(
  deliverable: Deliverable,
  assignment = "",
): Deliverable {
  if (deliverable.type !== "email") return deliverable;

  const payload = normalizeEmailPayload(
    {
      type: "email",
      title: deliverable.title,
      summary: deliverable.summary,
      content: deliverable.content,
      markdown: deliverable.markdown,
      html: deliverable.html,
      plainText: deliverable.plainText,
      tags: deliverable.metadata.tags,
      seo: deliverable.metadata.seo,
      audience: deliverable.metadata.audience,
      topic: deliverable.metadata.topic,
      subject: deliverable.metadata.subject,
      purpose: deliverable.metadata.purpose,
      cta: deliverable.metadata.cta,
    },
    assignment,
  );

  return {
    ...deliverable,
    type: "email",
    title: payload.title,
    summary: payload.summary,
    content: payload.content,
    markdown: payload.markdown,
    plainText: payload.plainText,
    metadata: {
      ...deliverable.metadata,
      tags: payload.tags ?? [],
      seo: {
        title: payload.seo?.title || payload.subject || payload.title,
        description: payload.seo?.description || payload.summary,
        keywords: payload.seo?.keywords ?? [],
      },
      snsPost: "",
      topic: payload.topic || payload.title,
      audience: payload.audience ?? deliverable.metadata.audience,
      subject: payload.subject ?? "",
      purpose: payload.purpose ?? "",
      cta: payload.cta ?? "",
    },
  };
}

export function detectEmailSubject(deliverable: Deliverable): string {
  if (deliverable.type !== "email") return "";
  return (
    deliverable.metadata.subject?.trim() ||
    extractEmailParts(deliverable.content).subject ||
    extractEmailParts(deliverable.markdown).subject ||
    ""
  );
}
