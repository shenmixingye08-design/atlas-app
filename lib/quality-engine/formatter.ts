import type { Deliverable } from "@/lib/orchestration/deliverable-types";

/**
 * Deterministic Formatter — no LLM.
 * Normalizes headings, whitespace, and list markers for a polished finish.
 */
export function formatDeliverableContent(deliverable: Deliverable): {
  markdown: string;
  content: string;
  durationMs: number;
} {
  const started = Date.now();
  const source = (deliverable.markdown || deliverable.content || "").trim();

  let markdown = source
    .replace(/\r\n/g, "\n")
    .replace(/[ \t]+\n/g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .replace(/^(#{1,6})([^#\s])/gm, "$1 $2")
    .replace(/^[-*]{1}\s*/gm, "- ")
    .trim();

  if (markdown && !/^#\s+/m.test(markdown) && deliverable.title.trim()) {
    markdown = `# ${deliverable.title.trim()}\n\n${markdown}`;
  }

  const content = markdown
    .replace(/^#{1,6}\s+/gm, "")
    .replace(/\n{3,}/g, "\n\n")
    .trim();

  return {
    markdown,
    content: content || deliverable.content,
    durationMs: Date.now() - started,
  };
}

export function applyFormatterToDeliverable(deliverable: Deliverable): {
  deliverable: Deliverable;
  durationMs: number;
} {
  const formatted = formatDeliverableContent(deliverable);
  return {
    durationMs: formatted.durationMs,
    deliverable: {
      ...deliverable,
      markdown: formatted.markdown,
      content: formatted.content || deliverable.content,
      plainText: formatted.content || deliverable.plainText,
    },
  };
}
