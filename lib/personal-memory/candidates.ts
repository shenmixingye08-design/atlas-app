import { createHash } from "crypto";

import type {
  CorrectionSignal,
  CreatePersonalMemoryInput,
  PersonalMemoryScope,
} from "@/lib/personal-memory/types";
import {
  BLOCKED_CANDIDATE_SOURCES,
  CORRECTION_REPEAT_THRESHOLD,
} from "@/lib/personal-memory/types";
import {
  bumpCorrectionCounter,
  isRejectedFingerprint,
  readPersonalMemorySettings,
} from "@/lib/personal-memory/store";
import { sanitizeUserFacingMemoryText } from "@/lib/personal-memory/security";

export function fingerprintCorrection(input: {
  text: string;
  scope?: string | null;
  automationId?: string | null;
}): string {
  const raw = [
    input.scope ?? "",
    input.automationId ?? "",
    input.text.trim().toLowerCase().replace(/\s+/g, " "),
  ].join("|");
  return createHash("sha256").update(raw).digest("hex").slice(0, 24);
}

type InferredPreference = {
  scope: PersonalMemoryScope;
  key: string;
  title: string;
  summary: string;
  value: Record<string, unknown>;
  explicit: boolean;
};

const EXPLICIT_PATTERNS: Array<{
  re: RegExp;
  scope: PersonalMemoryScope;
  key: string;
  title: string;
  map: (match: RegExpMatchArray, text: string) => Record<string, unknown>;
}> = [
  {
    re: /今後は?\s*(?:毎回)?\s*(PDF|pdf|Excel|Word|PowerPoint|パワポ)/i,
    scope: "preferred_formats",
    key: "formats",
    title: "成果物の形式",
    map: (m) => ({ formats: [m[1]!.toLowerCase()], text: `今後は${m[1]}も作成` }),
  },
  {
    re: /今後は?\s*(短く|簡潔に|丁寧に|カジュアルに)/,
    scope: "writing_style",
    key: "tone",
    title: "文体",
    map: (_m, text) => ({ text: sanitizeUserFacingMemoryText(text) }),
  },
  {
    re: /今後は?\s*(青系|赤系|緑系|モノクロ)/,
    scope: "color_palette",
    key: "palette",
    title: "配色",
    map: (m) => ({ palette: m[1], text: m[1]! }),
  },
];

const CORRECTION_PATTERNS: Array<{
  re: RegExp;
  scope: PersonalMemoryScope;
  key: string;
  title: string;
}> = [
  { re: /もっと短く|短めに|簡潔に/, scope: "writing_style", key: "length", title: "文章の長さ" },
  { re: /もっと丁寧|敬語/, scope: "writing_style", key: "tone", title: "文体" },
  { re: /改行(を増|多め)|読みやすく/, scope: "writing_style", key: "line_breaks", title: "改行" },
  { re: /箇条書き|リスト形式/, scope: "bullet_style", key: "bullets", title: "箇条書き" },
  { re: /絵文字(なし|やめて)/, scope: "writing_style", key: "emoji", title: "絵文字" },
  { re: /青系|ブルー/, scope: "color_palette", key: "palette", title: "配色" },
  { re: /A4|ワード.*レイアウト|Word.*A4/i, scope: "word_template", key: "page", title: "Wordレイアウト" },
  { re: /PowerPoint|パワポ.*(青|テーマ)/i, scope: "powerpoint_theme", key: "theme", title: "PowerPointデザイン" },
  { re: /Excel.*(構成|シート)/i, scope: "excel_template", key: "layout", title: "Excel構成" },
  { re: /PDFも|PDF同時/, scope: "preferred_formats", key: "pdf", title: "PDF有無" },
  { re: /Dropbox|Google.?Drive|保存先/, scope: "default_storage_locations", key: "storage", title: "保存場所" },
  { re: /ファイル名/, scope: "file_naming", key: "pattern", title: "ファイル名" },
  { re: /OCR.*(整形|後処理)/i, scope: "ocr_postprocess", key: "cleanup", title: "OCR後処理" },
  { re: /画像.*(サイズ|解像度)/, scope: "image_output", key: "size", title: "画像サイズ" },
  { re: /承認(不要|してから)/, scope: "approval_preferences", key: "mode", title: "承認フロー" },
  { re: /通知(は|を)/, scope: "notification_preferences", key: "timing", title: "通知タイミング" },
  { re: /PDFも|pdfも/, scope: "preferred_formats", key: "formats", title: "成果物の形式" },
];

export function inferPreferenceFromText(
  text: string,
): InferredPreference | null {
  const trimmed = text.trim();
  if (!trimmed) return null;

  for (const pattern of EXPLICIT_PATTERNS) {
    const match = trimmed.match(pattern.re);
    if (!match) continue;
    return {
      scope: pattern.scope,
      key: pattern.key,
      title: pattern.title,
      summary: sanitizeUserFacingMemoryText(trimmed).slice(0, 120),
      value: pattern.map(match, trimmed),
      explicit: /今後|毎回|いつも|これから/.test(trimmed),
    };
  }

  for (const pattern of CORRECTION_PATTERNS) {
    if (!pattern.re.test(trimmed)) continue;
    return {
      scope: pattern.scope,
      key: pattern.key,
      title: pattern.title,
      summary: sanitizeUserFacingMemoryText(trimmed).slice(0, 120),
      value: { text: sanitizeUserFacingMemoryText(trimmed) },
      explicit: /今後|毎回|いつも|これから/.test(trimmed),
    };
  }

  return null;
}

/**
 * Process a correction/signal into at most one candidate create input.
 * Never returns active memories. Never learns from external_content.
 * One-off corrections do not create candidates until repeat threshold.
 */
export function evaluateCorrectionForCandidate(
  signal: CorrectionSignal,
): { action: "none" | "candidate" | "explicit_candidate"; input?: CreatePersonalMemoryInput; fingerprint: string; count: number } {
  if (
    (BLOCKED_CANDIDATE_SOURCES as readonly string[]).includes(signal.source)
  ) {
    return { action: "none", fingerprint: "", count: 0 };
  }

  const settings = readPersonalMemorySettings(signal.userId);
  if (!settings.enabled) {
    return { action: "none", fingerprint: "", count: 0 };
  }
  if (!settings.proposeFromCorrections && !/今後|毎回|いつも/.test(signal.text)) {
    return { action: "none", fingerprint: "", count: 0 };
  }

  const inferred = inferPreferenceFromText(signal.text);
  if (!inferred) {
    return { action: "none", fingerprint: "", count: 0 };
  }

  if (
    settings.blockSensitiveStorage &&
    (inferred.scope === "default_recipients" ||
      inferred.scope === "default_storage_locations" ||
      inferred.scope === "contact_info")
  ) {
    return { action: "none", fingerprint: "", count: 0 };
  }

  const fingerprint = fingerprintCorrection({
    text: `${inferred.scope}:${inferred.key}:${JSON.stringify(inferred.value)}`,
    scope: inferred.scope,
    automationId: signal.automationId,
  });

  if (isRejectedFingerprint(signal.userId, fingerprint)) {
    return { action: "none", fingerprint, count: 0 };
  }

  const count = bumpCorrectionCounter({
    userId: signal.userId,
    fingerprint,
    scopeHint: inferred.scope,
    automationId: signal.automationId,
  });

  const appliesTo = signal.automationId
    ? {
        global: false,
        automationIds: [signal.automationId],
        artifactTypes: signal.artifactType ? [signal.artifactType] : [],
        capabilities: [],
      }
    : {
        global: true,
        automationIds: [],
        artifactTypes: signal.artifactType ? [signal.artifactType] : [],
        capabilities: [],
      };

  const base: CreatePersonalMemoryInput = {
    kind:
      inferred.scope === "default_recipients" ||
      inferred.scope === "default_storage_locations"
        ? "sensitive"
        : inferred.scope === "work_content_style"
          ? "work_preference"
          : "user_preference",
    scope: inferred.scope,
    key: inferred.key,
    value: inferred.value,
    title: inferred.title,
    summary: inferred.summary,
    source: inferred.explicit ? "user_explicit" : "user_correction",
    confidence: inferred.explicit ? 0.9 : Math.min(0.85, 0.5 + count * 0.1),
    status: "candidate",
    appliesTo,
    evidence: [
      {
        kind: "correction",
        summary: sanitizeUserFacingMemoryText(signal.text).slice(0, 160),
        occurredAt: new Date().toISOString(),
        automationId: signal.automationId ?? null,
      },
    ],
  };

  if (inferred.explicit) {
    return { action: "explicit_candidate", input: base, fingerprint, count };
  }

  if (settings.explicitOnly) {
    return { action: "none", fingerprint, count };
  }

  if (count < CORRECTION_REPEAT_THRESHOLD) {
    return { action: "none", fingerprint, count };
  }

  return { action: "candidate", input: base, fingerprint, count };
}

export function buildCandidatePrompt(memory: {
  title: string;
  summary: string;
}): string {
  return `「${memory.title}」について、今後も「${memory.summary}」としますか？`;
}
