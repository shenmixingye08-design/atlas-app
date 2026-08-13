/**
 * Apply Memory to published bodies (X / WordPress / email).
 * Transforms the actual post/article — never prepends planner labels.
 */

import type { MemoryArtifactChannel } from "@/lib/memory-apply/channels";
import { applyWritingPreferenceStructure } from "@/lib/memory-apply/preference-structure";
import type { MemoryContentOverlay } from "@/lib/memory-apply/types";

const EMOJI_RE = /\p{Extended_Pictographic}/gu;
const CTA_HINT_RE = /詳しくは|お問い合わせ|今すぐ|こちらから|購読|申込|CTA/i;
const HEADING_RE = /^#{1,3}\s|<h[1-3][\s>]/im;
const X_MAX_CHARS = 280;

function stripEmojis(text: string): string {
  return text
    .replace(EMOJI_RE, "")
    .replace(/\uFE0F/g, "")
    .replace(/[ \t]{2,}/g, " ")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

function firstLine(block: string): { title: string; rest: string } {
  const trimmed = block.trim();
  const match = trimmed.match(/^(.+?)([。！？\n]|$)/);
  const title = (match?.[1] ?? trimmed).trim() || trimmed.slice(0, 40);
  const rest = trimmed.slice(title.length).replace(/^[。！？\n]+/, "").trim();
  return { title, rest };
}

function ensureHeadings(body: string): string {
  if (HEADING_RE.test(body)) return body;
  const paras = body
    .split(/\n\n+/)
    .map((p) => p.trim())
    .filter(Boolean);
  if (paras.length === 0) return body;
  if (paras.length === 1) {
    const { title, rest } = firstLine(paras[0]!);
    return rest ? `## ${title}\n\n${rest}` : `## ${title}`;
  }
  return paras
    .map((para, index) => {
      const { title, rest } = firstLine(para);
      const mark = index === 0 ? "##" : "###";
      return rest ? `${mark} ${title}\n\n${rest}` : `${mark} ${title}`;
    })
    .join("\n\n");
}

function usableCtaText(raw: string | null): string | null {
  if (!raw) return null;
  const trimmed = raw.trim();
  if (!trimmed || /^(true|false|1|0|yes|no|on|off)$/i.test(trimmed)) {
    return null;
  }
  return trimmed;
}

function ensureCta(body: string, ctaText: string | null): string {
  if (CTA_HINT_RE.test(body)) return body;
  const line = usableCtaText(ctaText) || "詳しくはこちらをご覧ください。";
  return `${body.trim()}\n\n${line}`;
}

function capXLength(body: string): string {
  if (body.length <= X_MAX_CHARS) return body;
  const sliced = body.slice(0, X_MAX_CHARS);
  const atSentence = sliced.search(/[。！？]/);
  if (atSentence >= 20) return sliced.slice(0, atSentence + 1);
  return sliced.trim();
}

/** X + length:short: keep the first complete clause, not a 280-char cap. */
function shortenXPost(body: string): string {
  const units = body
    .split(/(?<=[。！？])|(?<=です|ます|ください)/u)
    .map((s) => s.trim())
    .filter(Boolean);
  const first = units[0] ?? body.trim();
  return first || body.trim();
}

export function applyPublishedBodyOverlay(
  base: string,
  overlay: MemoryContentOverlay,
  channel: MemoryArtifactChannel,
): { text: string; appliedKeys: string[] } {
  let body = (base ?? "").trim();
  if (!body) return { text: "", appliedKeys: [] };

  const appliedKeys: string[] = [];

  for (const forbidden of overlay.forbiddenExpressions) {
    if (!forbidden) continue;
    if (body.includes(forbidden)) {
      body = body.split(forbidden).join("");
      appliedKeys.push("forbidden");
    }
  }

  if (overlay.preferNoEmoji) {
    const stripped = stripEmojis(body);
    if (stripped !== body) appliedKeys.push("emoji:none");
    body = stripped;
  }

  const structured = applyWritingPreferenceStructure(
    body,
    {
      short: overlay.preferShort,
      bullets: overlay.preferBullets,
      conclusionFirst: overlay.preferConclusionFirst,
      noEmoji: overlay.preferNoEmoji,
      headings: overlay.preferHeadings,
      cta: overlay.preferCta,
      seo: overlay.preferSeo,
      keys: overlay.preferenceKeys,
    },
    { includeMarkers: false },
  );
  body = structured.text;
  appliedKeys.push(...structured.appliedKeys);

  if (channel === "wordpress") {
    if (overlay.preferHeadings) {
      const next = ensureHeadings(body);
      if (next !== body) appliedKeys.push("structure:headings");
      body = next;
    }
    if (overlay.preferSeo) {
      body = body.replace(/\b(Key points|Overview|Thank you)\b/gi, "");
      appliedKeys.push("seo");
    }
    if (overlay.preferCta) {
      const next = ensureCta(body, overlay.ctaText);
      if (next !== body) appliedKeys.push("cta");
      body = next;
    }
  }

  if (channel === "x_post") {
    body = body.replace(/\n{3,}/g, "\n\n").trim();
    if (overlay.preferShort) {
      const shortened = shortenXPost(body);
      if (shortened !== body) appliedKeys.push("length:short");
      body = shortened;
    }
    const capped = capXLength(body);
    if (capped !== body) appliedKeys.push("length:short");
    body = capped;
  }

  body = body.replace(/[ \t]{2,}/g, " ").trim();
  return { text: body, appliedKeys: [...new Set(appliedKeys)] };
}
