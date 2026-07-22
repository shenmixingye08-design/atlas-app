import type { DeliverableFormat } from "@/lib/deliverables/types";

/** Workspace deliverable categories produced by the Deliverable Builder. */
export type DeliverableType =
  | "blog"
  | "report"
  | "proposal"
  | "presentation"
  | "research"
  | "email"
  | "social_post"
  | "short_document"
  | "document";

export type DeliverableSeo = {
  title: string;
  description: string;
  keywords: string[];
};

/** Type-specific fields preserved alongside the core deliverable body. */
export type DeliverableMetadata = {
  tags: string[];
  seo: DeliverableSeo;
  snsPost: string;
  topic: string;
  audience: string;
  /** Email subject line (件名). */
  subject?: string;
  /** Email purpose / intent. */
  purpose?: string;
  /** Email call-to-action. */
  cta?: string;
  /** Social post variants (3–5 items for social_post deliverables). */
  posts?: string[];
  sourceTaskId: number | null;
  workerCount: number;
};

/** Export formats the workspace exposes for this deliverable. */
export type DeliverableDownload = {
  format: DeliverableFormat | "html";
  label: string;
  ready: boolean;
};

/**
 * Structured workspace deliverable attached to OrchestrationResult.
 * Never replace this object with a collapsed string.
 */
export type Deliverable = {
  type: DeliverableType;
  title: string;
  summary: string;
  /** Primary body content (article, report body, email body, etc.). */
  content: string;
  markdown: string;
  html: string;
  plainText: string;
  metadata: DeliverableMetadata;
  downloads: DeliverableDownload[];
};

/** Worker JSON shape — maps 1:1 into {@link Deliverable}. */
export type WorkerDeliverablePayload = {
  type?: DeliverableType;
  title: string;
  summary: string;
  content: string;
  markdown: string;
  html: string;
  plainText: string;
  tags?: string[];
  seo?: Partial<DeliverableSeo>;
  snsPost?: string;
  topic?: string;
  audience?: string;
  subject?: string;
  purpose?: string;
  cta?: string;
  posts?: string[];
};

const EMPTY_METADATA: DeliverableMetadata = {
  tags: [],
  seo: { title: "", description: "", keywords: [] },
  snsPost: "",
  topic: "",
  audience: "",
  sourceTaskId: null,
  workerCount: 0,
};

export function emptyDeliverable(type: DeliverableType = "document"): Deliverable {
  return {
    type,
    title: "",
    summary: "",
    content: "",
    markdown: "",
    html: "",
    plainText: "",
    metadata: { ...EMPTY_METADATA },
    downloads: defaultDownloads(type),
  };
}

export function defaultDownloads(type: DeliverableType): DeliverableDownload[] {
  switch (type) {
    case "blog":
      return downloadsFor(["md", "docx", "pdf"]);
    case "presentation":
      return downloadsFor(["pptx", "pdf", "md"]);
    case "report":
    case "proposal":
    case "research":
      return downloadsFor(["pdf", "docx", "md"]);
    case "email":
      return downloadsFor(["md", "docx", "pdf"]);
    case "social_post":
    case "short_document":
      return downloadsFor(["md", "txt", "pdf"]);
    default:
      return downloadsFor(["md", "pdf", "docx", "txt"]);
  }
}

function downloadsFor(formats: (DeliverableFormat | "html")[]): DeliverableDownload[] {
  const labels: Record<string, string> = {
    md: "Markdown",
    pdf: "PDF",
    docx: "Word",
    pptx: "PowerPoint",
    txt: "Text",
    html: "HTML",
    xlsx: "Excel",
    csv: "CSV",
  };

  return formats.map((format) => ({
    format,
    label: labels[format] ?? format.toUpperCase(),
    ready: false,
  }));
}

/** Best text for preview/export from a structured or legacy deliverable value. */
export function getDeliverablePreviewText(deliverable: unknown): string {
  if (typeof deliverable === "string") {
    return deliverable.trim();
  }

  if (deliverable && typeof deliverable === "object") {
    const record = deliverable as Partial<Deliverable>;
    return (
      record.markdown?.trim() ||
      record.content?.trim() ||
      record.plainText?.trim() ||
      ""
    );
  }

  return "";
}

export function deliverableHasContent(deliverable: Deliverable | unknown): boolean {
  return Boolean(getDeliverablePreviewText(deliverable));
}

/** @deprecated Use {@link Deliverable} */
export type WorkflowDeliverable = Deliverable;

/** @deprecated Use {@link emptyDeliverable} */
export const emptyWorkflowDeliverable = emptyDeliverable;

/** @deprecated Use {@link WorkerDeliverablePayload} */
export type WorkerStructuredOutput = WorkerDeliverablePayload;

export function isBlogRelatedRequest(assignment: string): boolean {
  const haystack = assignment.toLowerCase();
  return /ブログ|blog|記事|コラム|投稿|wordpress/.test(haystack);
}
