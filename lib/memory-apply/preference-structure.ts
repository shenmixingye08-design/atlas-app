/**
 * N-05: Structural writing preference apply (no AI).
 * Turns saved preferences into deterministic transforms so Production
 * can prove short / bullets / conclusion-first without re-prompting.
 */

import type { ResolvedMemoryValue } from "@/lib/personal-memory/types";

export type WritingPreferenceStructure = {
  short: boolean;
  bullets: boolean;
  conclusionFirst: boolean;
  noEmoji: boolean;
  headings: boolean;
  headingCount: number | null;
  polite: boolean;
  long: boolean;
  preferredFormat: "docx" | "xlsx" | "pptx" | "pdf" | null;
  cta: boolean;
  seo: boolean;
  keys: string[];
};

const SHORT_RE = /短め|短く|簡潔|短文|短くして|短めに/;
const BULLET_RE = /箇条書き|ブレット|bullet|点で整理|ポイントで/;
const CONCLUSION_RE = /結論を最初|結論を先|結論先|結論から|結論を先頭/;

function haystackFromValue(row: ResolvedMemoryValue): string {
  const parts = [
    row.key,
    row.summary,
    typeof row.value.text === "string" ? row.value.text : "",
    typeof row.value.writing_style === "string" ? row.value.writing_style : "",
    typeof row.value.length === "string" ? row.value.length : "",
    typeof row.value.structure === "string" ? row.value.structure : "",
    typeof row.value.conclusion === "string" ? row.value.conclusion : "",
    typeof row.value.emoji === "string" ? row.value.emoji : "",
    typeof row.value.tone === "string" ? row.value.tone : "",
    Array.isArray(row.value.formats)
      ? row.value.formats.map(String).join(" ")
      : "",
  ];
  return parts.filter(Boolean).join(" ");
}

export function detectWritingPreferenceStructure(
  values: readonly ResolvedMemoryValue[],
): WritingPreferenceStructure {
  let short = false;
  let bullets = false;
  let conclusionFirst = false;
  let noEmoji = false;
  let headings = false;
  let headingCount: number | null = null;
  let polite = false;
  let long = false;
  let preferredFormat: WritingPreferenceStructure["preferredFormat"] = null;
  let cta = false;
  let seo = false;
  const keys = new Set<string>();

  for (const row of values) {
    const hay = haystackFromValue(row);
    const lengthFlag = String(row.value.length ?? "").toLowerCase();
    const structureFlag = String(row.value.structure ?? "").toLowerCase();
    const conclusionFlag = String(row.value.conclusion ?? "").toLowerCase();
    const emojiFlag = String(row.value.emoji ?? "").toLowerCase();

    if (lengthFlag === "long" || (/長文|詳しく|詳細に/.test(hay) && !SHORT_RE.test(hay))) {
      long = true;
      keys.add("length:long");
    }
    if (lengthFlag === "short" || SHORT_RE.test(hay)) {
      short = true;
      long = false;
      keys.add("length:short");
    }
    if (
      structureFlag === "bullets" ||
      structureFlag === "bullet" ||
      BULLET_RE.test(hay)
    ) {
      bullets = true;
      keys.add("structure:bullets");
    }
    if (
      conclusionFlag === "first" ||
      conclusionFlag === "先行" ||
      CONCLUSION_RE.test(hay)
    ) {
      conclusionFirst = true;
      keys.add("conclusion:first");
    }
    if (
      emojiFlag === "none" ||
      emojiFlag === "off" ||
      /絵文字(なし|無し|やめて)/.test(hay)
    ) {
      noEmoji = true;
      keys.add("emoji:none");
    }
    if (
      row.value.headings === true ||
      structureFlag === "headings" ||
      /見出し/.test(hay)
    ) {
      headings = true;
      keys.add("structure:headings");
    }
    const countFromValue =
      typeof row.value.headingCount === "number" && row.value.headingCount > 0
        ? Math.round(row.value.headingCount)
        : null;
    const countMatch = hay.match(/見出し\s*(?:は|を)?\s*(\d+)\s*つ/);
    const parsedCount = countFromValue ??
      (countMatch ? Number.parseInt(countMatch[1]!, 10) : null);
    if (parsedCount && parsedCount > 0) {
      headingCount = parsedCount;
      headings = true;
      keys.add("headingCount");
      keys.add("structure:headings");
    }
    if (
      String(row.value.tone ?? "").toLowerCase() === "polite" ||
      /丁寧|敬語/.test(hay)
    ) {
      polite = true;
      keys.add("tone:polite");
    }
    const formats = Array.isArray(row.value.formats)
      ? row.value.formats.map((item) => String(item).toLowerCase())
      : [];
    if (formats.some((item) => item === "docx" || item === "word") || /word|ワード/.test(hay)) {
      preferredFormat = preferredFormat ?? "docx";
      keys.add("format:docx");
    }
    if (formats.some((item) => item === "xlsx" || item === "excel") || /excel|エクセル/.test(hay)) {
      preferredFormat = preferredFormat ?? "xlsx";
      keys.add("format:xlsx");
    }
    if (
      formats.some((item) => item === "pptx" || item === "powerpoint") ||
      /パワポ|powerpoint/.test(hay)
    ) {
      preferredFormat = preferredFormat ?? "pptx";
      keys.add("format:pptx");
    }
    if (row.value.cta === true || /\bcta\b/i.test(hay) || /行動喚起/.test(hay)) {
      cta = true;
      keys.add("cta");
    }
    if (row.value.seo === true || /\bseo\b/i.test(hay)) {
      seo = true;
      keys.add("seo");
    }
  }

  return {
    short,
    bullets,
    conclusionFirst,
    noEmoji,
    headings,
    headingCount,
    polite,
    long,
    preferredFormat,
    cta,
    seo,
    keys: [...keys],
  };
}

function splitSentences(text: string): string[] {
  return text
    .split(/(?<=[。！？\n])/)
    .map((s) => s.trim())
    .filter(Boolean);
}

function extractConclusion(sentences: string[]): {
  conclusion: string | null;
  rest: string[];
} {
  const idx = sentences.findIndex((s) => /結論/.test(s));
  if (idx < 0) return { conclusion: null, rest: sentences };
  const conclusion = sentences[idx]!;
  const rest = [...sentences.slice(0, idx), ...sentences.slice(idx + 1)];
  return { conclusion, rest };
}

/**
 * Deterministic body transform proving preference keys were applied.
 * Never invents user content beyond reordering / formatting the baseline.
 */
export function applyHeadingCount(
  text: string,
  count: number,
  options?: { titles?: readonly string[] },
): { text: string; applied: boolean } {
  const target = Math.max(1, Math.min(8, Math.round(count)));
  const existing = text.match(/^#{1,3}\s+.+$/gm) ?? [];
  if (existing.length === target) {
    return { text, applied: false };
  }

  if (existing.length > target) {
    const lines = text.replace(/\r\n/g, "\n").split("\n");
    const kept: string[] = [];
    let seen = 0;
    for (const line of lines) {
      if (/^#{1,3}\s+/.test(line)) {
        seen += 1;
        if (seen > target) continue;
      }
      if (seen > target && /^#{1,3}\s+/.test(line)) continue;
      kept.push(line);
    }
    return { text: kept.join("\n").trim(), applied: true };
  }

  const cleaned = text.replace(/^#{1,6}\s+/gm, "").trim();
  const paras = cleaned
    .split(/\n\n+/)
    .map((p) => p.trim())
    .filter(Boolean);
  const units =
    paras.length >= target
      ? paras
      : splitSentences(cleaned).filter(Boolean);
  if (units.length === 0) return { text, applied: false };

  const titles =
    options?.titles && options.titles.length >= target
      ? options.titles.slice(0, target)
      : defaultHeadingTitles(target, cleaned);
  const bucketSize = Math.max(1, Math.ceil(units.length / target));
  const sections: string[] = [];
  for (let i = 0; i < target; i += 1) {
    const chunk = units.slice(i * bucketSize, (i + 1) * bucketSize);
    const body = chunk.join(paras.length >= target ? "\n\n" : "");
    const title = titles[i] ?? `要点${i + 1}`;
    sections.push(body ? `## ${title}\n\n${body}` : `## ${title}`);
  }
  return { text: sections.join("\n\n").trim(), applied: true };
}

function defaultHeadingTitles(count: number, sample: string): string[] {
  if (count === 3) {
    return ["背景", "課題", "実施方法"];
  }
  return Array.from({ length: count }, (_, i) => `要点${i + 1}`);
}

export function applyWritingPreferenceStructure(
  base: string,
  prefs: WritingPreferenceStructure,
  options?: { includeMarkers?: boolean },
): { text: string; appliedKeys: string[] } {
  const shouldTransform =
    prefs.short ||
    prefs.bullets ||
    prefs.conclusionFirst ||
    Boolean(prefs.headingCount) ||
    prefs.headings;
  if (!shouldTransform) {
    return { text: base, appliedKeys: [] };
  }

  let sentences = splitSentences(base.replace(/\r\n/g, "\n"));
  const appliedKeys: string[] = [];

  let conclusion: string | null = null;
  if (prefs.conclusionFirst) {
    const extracted = extractConclusion(sentences);
    conclusion = extracted.conclusion;
    sentences = extracted.rest;
    if (conclusion) appliedKeys.push("conclusion:first");
  }

  if (prefs.short && !prefs.long) {
    sentences = sentences.slice(0, Math.min(3, sentences.length));
    appliedKeys.push("length:short");
  }

  let body: string;
  if (prefs.bullets) {
    const lines = sentences.map((s) => `- ${s.replace(/^[-*・]\s*/, "")}`);
    body = lines.join("\n");
    appliedKeys.push("structure:bullets");
  } else {
    body = sentences.join("");
  }

  const includeMarkers = options?.includeMarkers !== false;
  const parts: string[] = [];
  if (conclusion) {
    parts.push(`結論：${conclusion.replace(/^結論[は：:]\s*/, "")}`);
  }
  if (
    includeMarkers &&
    (prefs.short || prefs.bullets || prefs.conclusionFirst)
  ) {
    parts.push(
      `【好み反映】${[...new Set(appliedKeys)].join(" / ") || prefs.keys.join(" / ")}`,
    );
  }
  parts.push(body);
  let text = parts.filter(Boolean).join("\n\n").trim();

  if (prefs.headingCount && prefs.headingCount > 0) {
    const headed = applyHeadingCount(text, prefs.headingCount);
    if (headed.applied || (text.match(/^#{1,3}\s+/gm) ?? []).length === prefs.headingCount) {
      appliedKeys.push("headingCount");
      appliedKeys.push("structure:headings");
    }
    text = headed.text;
  } else if (prefs.headings && !/^#{1,3}\s+/m.test(text)) {
    const headed = applyHeadingCount(text, 2);
    if (headed.applied) appliedKeys.push("structure:headings");
    text = headed.text;
  }

  return {
    text,
    appliedKeys: [...new Set(appliedKeys)],
  };
}

/** Explicit preference payload for “短め・箇条書き・結論先” style saves. */
export function buildExplicitWritingPreferenceValue(text: string): {
  text: string;
  length?: "short" | "long";
  structure?: "bullets" | "headings";
  conclusion?: "first";
  headings?: boolean;
  headingCount?: number;
  tone?: "polite" | "casual";
  formats?: string[];
} {
  const value: {
    text: string;
    length?: "short" | "long";
    structure?: "bullets" | "headings";
    conclusion?: "first";
    headings?: boolean;
    headingCount?: number;
    tone?: "polite" | "casual";
    formats?: string[];
  } = { text };
  if (SHORT_RE.test(text)) value.length = "short";
  if (/長文|詳しく|詳細に/.test(text) && value.length !== "short") {
    value.length = "long";
  }
  if (BULLET_RE.test(text)) value.structure = "bullets";
  if (CONCLUSION_RE.test(text)) value.conclusion = "first";
  const headingMatch = text.match(/見出し\s*(?:は|を)?\s*(\d+)\s*つ/);
  if (headingMatch) {
    value.headingCount = Number.parseInt(headingMatch[1]!, 10);
    value.headings = true;
    value.structure = value.structure ?? "headings";
  } else if (/見出し/.test(text)) {
    value.headings = true;
    value.structure = value.structure ?? "headings";
  }
  if (/丁寧|敬語/.test(text)) value.tone = "polite";
  if (/カジュアル/.test(text)) value.tone = "casual";
  if (/word|ワード|docx/i.test(text)) value.formats = ["docx"];
  else if (/excel|エクセル|xlsx/i.test(text)) value.formats = ["xlsx"];
  else if (/powerpoint|パワポ|pptx/i.test(text)) value.formats = ["pptx"];
  else if (/pdf/i.test(text)) value.formats = ["pdf"];
  return value;
}
