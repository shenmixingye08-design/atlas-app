import type { DocumentModel } from "@/lib/documents/schema/document-model.zod";
import { DESIGN_TOKENS } from "@/lib/documents/tokens/design-tokens";

function escapeHtml(text: string): string {
  return text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

/** HTML preview from IR — no AI, no binary render. */
export function renderDocumentModelToHtml(model: DocumentModel): string {
  const accent = DESIGN_TOKENS.colors.accent;
  const parts: string[] = [
    `<article class="atlas-doc-preview" lang="${escapeHtml(model.language)}">`,
    `<header style="border-bottom:2px solid ${accent};padding-bottom:1rem;margin-bottom:1.5rem">`,
    `<h1 style="color:${accent};font-size:1.5rem;margin:0">${escapeHtml(model.title)}</h1>`,
  ];

  if (model.subtitle) {
    parts.push(`<p style="color:#666;margin:0.5rem 0 0">${escapeHtml(model.subtitle)}</p>`);
  }
  if (model.summary) {
    parts.push(
      `<p style="background:#f5f8fb;padding:0.75rem;border-radius:4px;margin-top:1rem">${escapeHtml(model.summary)}</p>`,
    );
  }
  parts.push("</header>");

  for (const section of model.sections) {
    const tag = section.level === 1 ? "h2" : section.level === 2 ? "h3" : "h4";
    parts.push(`<section style="margin-bottom:1.25rem">`);
    parts.push(
      `<${tag} style="color:${accent};margin:0 0 0.5rem">${escapeHtml(section.heading)}</${tag}>`,
    );

    for (const block of section.blocks) {
      switch (block.type) {
        case "paragraph":
          parts.push(
            `<p style="line-height:1.6;margin:0.25rem 0">${escapeHtml(block.text).replace(/\n/g, "<br>")}</p>`,
          );
          break;
        case "bullets":
          parts.push("<ul style=\"margin:0.25rem 0;padding-left:1.25rem\">");
          for (const item of block.items) {
            parts.push(`<li>${escapeHtml(item)}</li>`);
          }
          parts.push("</ul>");
          break;
        case "table":
          parts.push(
            '<table style="width:100%;border-collapse:collapse;margin:0.5rem 0;font-size:0.9rem">',
          );
          parts.push("<thead><tr>");
          for (const header of block.headers) {
            parts.push(
              `<th style="border:1px solid #ddd;padding:0.4rem;background:${accent};color:#fff">${escapeHtml(header)}</th>`,
            );
          }
          parts.push("</tr></thead><tbody>");
          for (const row of block.rows) {
            parts.push("<tr>");
            for (const cell of row) {
              parts.push(`<td style="border:1px solid #ddd;padding:0.4rem">${escapeHtml(cell)}</td>`);
            }
            parts.push("</tr>");
          }
          parts.push("</tbody></table>");
          break;
        case "callout":
          parts.push(
            `<aside style="background:${DESIGN_TOKENS.colors.callout[block.variant]};padding:0.75rem;border-left:3px solid ${accent};margin:0.5rem 0">${escapeHtml(block.text)}</aside>`,
          );
          break;
      }
    }
    parts.push("</section>");
  }

  if (model.actionItems?.length) {
    parts.push(`<section><h3 style="color:${accent}">アクションアイテム</h3><ul>`);
    for (const item of model.actionItems) {
      parts.push(
        `<li>${escapeHtml(item.text)}${item.dueDate ? ` <small>(${escapeHtml(item.dueDate)})</small>` : ""}</li>`,
      );
    }
    parts.push("</ul></section>");
  }

  parts.push("</article>");
  return parts.join("");
}
