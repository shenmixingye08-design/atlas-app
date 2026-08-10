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
  ];
  return parts.filter(Boolean).join(" ");
}

export function detectWritingPreferenceStructure(
  values: readonly ResolvedMemoryValue[],
): WritingPreferenceStructure {
  let short = false;
  let bullets = false;
  let conclusionFirst = false;
  const keys = new Set<string>();

  for (const row of values) {
    const hay = haystackFromValue(row);
    const lengthFlag = String(row.value.length ?? "").toLowerCase();
    const structureFlag = String(row.value.structure ?? "").toLowerCase();
    const conclusionFlag = String(row.value.conclusion ?? "").toLowerCase();

    if (lengthFlag === "short" || SHORT_RE.test(hay)) {
      short = true;
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
  }

  return {
    short,
    bullets,
    conclusionFirst,
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
export function applyWritingPreferenceStructure(
  base: string,
  prefs: WritingPreferenceStructure,
): { text: string; appliedKeys: string[] } {
  if (!prefs.short && !prefs.bullets && !prefs.conclusionFirst) {
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

  if (prefs.short) {
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

  const parts: string[] = [];
  if (conclusion) {
    parts.push(`結論：${conclusion.replace(/^結論[は：:]\s*/, "")}`);
  }
  if (prefs.short || prefs.bullets || prefs.conclusionFirst) {
    parts.push(
      `【好み反映】${[...new Set(appliedKeys)].join(" / ") || prefs.keys.join(" / ")}`,
    );
  }
  parts.push(body);
  return {
    text: parts.filter(Boolean).join("\n\n").trim(),
    appliedKeys: [...new Set(appliedKeys)],
  };
}

/** Explicit preference payload for “短め・箇条書き・結論先” style saves. */
export function buildExplicitWritingPreferenceValue(text: string): {
  text: string;
  length?: "short";
  structure?: "bullets";
  conclusion?: "first";
} {
  const value: {
    text: string;
    length?: "short";
    structure?: "bullets";
    conclusion?: "first";
  } = { text };
  if (SHORT_RE.test(text)) value.length = "short";
  if (BULLET_RE.test(text)) value.structure = "bullets";
  if (CONCLUSION_RE.test(text)) value.conclusion = "first";
  return value;
}
