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
import { detectMemoryChannel } from "@/lib/memory-apply/channels";
import { parseXSocialPreferenceFromText } from "@/lib/memory-apply/x-social-preference";
import {
  classifyMemoryWriteIntent,
  isOneShotMemoryInstruction,
} from "@/lib/personal-memory/intent";
import { sanitizeUserFacingMemoryText } from "@/lib/personal-memory/security";
import {
  bumpCorrectionCounter,
  isRejectedFingerprint,
  readPersonalMemorySettings,
} from "@/lib/personal-memory/store";

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
  global: boolean;
  artifactTypes: string[];
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
    // N-05: short + bullets + conclusion-first as structured writing prefs
    re: /(?:今後|いつも|毎回|これから).*(?:短め|短く|簡潔).*(?:箇条書き)|(?:今後|いつも|毎回|これから).*(?:箇条書き).*(?:短め|短く|簡潔)|(?:今後|いつも|毎回|これから).*(?:結論を最初|結論を先|結論先)/,
    scope: "writing_style",
    key: "writing_preference",
    title: "文章の好み",
    map: (_m, text) => {
      const cleaned = sanitizeUserFacingMemoryText(text);
      const value: Record<string, unknown> = { text: cleaned };
      if (/短め|短く|簡潔/.test(cleaned)) value.length = "short";
      if (/箇条書き/.test(cleaned)) value.structure = "bullets";
      if (/結論を最初|結論を先|結論先|結論から/.test(cleaned)) {
        value.conclusion = "first";
      }
      return value;
    },
  },
  {
    re: /今後は?\s*(短く|短め|簡潔に|丁寧に|カジュアルに)/,
    scope: "writing_style",
    key: "tone",
    title: "文体",
    map: (_m, text) => {
      const cleaned = sanitizeUserFacingMemoryText(text);
      const value: Record<string, unknown> = { text: cleaned };
      if (/短く|短め|簡潔/.test(cleaned)) value.length = "short";
      return value;
    },
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
  map?: (text: string) => Record<string, unknown>;
}> = [
  {
    re: /もっと短く|短めに|簡潔に|文章は短め/,
    scope: "writing_style",
    key: "length",
    title: "文章の長さ",
    map: (text) => ({
      text: sanitizeUserFacingMemoryText(text),
      length: "short",
    }),
  },
  {
    re: /箇条書き|ポイントで整理/,
    scope: "writing_style",
    key: "structure",
    title: "文章構成",
    map: (text) => ({
      text: sanitizeUserFacingMemoryText(text),
      structure: "bullets",
    }),
  },
  {
    re: /結論を最初|結論を先|結論先|結論から書いて/,
    scope: "writing_style",
    key: "conclusion",
    title: "結論の位置",
    map: (text) => ({
      text: sanitizeUserFacingMemoryText(text),
      conclusion: "first",
    }),
  },
  { re: /もっと丁寧|敬語/, scope: "writing_style", key: "tone", title: "文体" },
  { re: /絵文字(なし|やめて)/, scope: "writing_style", key: "emoji", title: "絵文字" },
  { re: /青系|ブルー/, scope: "color_palette", key: "palette", title: "配色" },
  { re: /PDFも|pdfも/, scope: "preferred_formats", key: "formats", title: "成果物の形式" },
];

function withChannel(
  inferred: Omit<InferredPreference, "global" | "artifactTypes">,
  text: string,
): InferredPreference {
  const channel = detectMemoryChannel(text);
  return {
    ...inferred,
    global: channel.global,
    artifactTypes: channel.artifactTypes,
    value: {
      ...inferred.value,
      channel: channel.channel,
      global: channel.global,
    },
  };
}

export function inferPreferenceFromText(
  text: string,
): InferredPreference | null {
  const trimmed = text.trim();
  if (!trimmed) return null;
  if (isOneShotMemoryInstruction(trimmed)) return null;
  const cleaned = sanitizeUserFacingMemoryText(trimmed);
  const channel = detectMemoryChannel(trimmed);
  const writeIntent = classifyMemoryWriteIntent(trimmed);
  const channelScopedStanding =
    channel.channel !== "artifact" &&
    writeIntent !== "one_shot" &&
    writeIntent !== "automation_override";
  const explicit =
    writeIntent === "persist_global" ||
    writeIntent === "persist_channel" ||
    channelScopedStanding;

  const formatMatch = trimmed.match(
    /今後は?\s*(?:毎回)?\s*(PDF|pdf|Excel|Word|PowerPoint|パワポ)/i,
  );
  if (formatMatch && !/Xは|ブログ|WordPress/i.test(trimmed)) {
    return withChannel(
      {
        scope: "preferred_formats",
        key: "formats",
        title: "成果物の形式",
        summary: cleaned.slice(0, 120),
        value: {
          formats: [formatMatch[1]!.toLowerCase()],
          text: `今後は${formatMatch[1]}も作成`,
        },
        explicit: true,
      },
      trimmed,
    );
  }

  const paletteMatch = trimmed.match(/今後は?\s*(青系|赤系|緑系|モノクロ)|青系|ブルー/);
  const writing: Record<string, unknown> = { text: cleaned };
  let writingHit = false;
  if (/短め|短く|簡潔|短文/.test(trimmed)) {
    writing.length = "short";
    writingHit = true;
  }
  if (/長文|長くして/.test(trimmed) && writing.length !== "short") {
    writing.length = "long";
    writingHit = true;
  }
  if (/箇条書き|ポイントで整理/.test(trimmed)) {
    writing.structure = "bullets";
    writingHit = true;
  }
  if (/見出し/.test(trimmed)) {
    writing.headings = true;
    writing.structure = writing.structure ?? "headings";
    writingHit = true;
  }
  if (/結論を最初|結論を先|結論先|結論から/.test(trimmed)) {
    writing.conclusion = "first";
    writingHit = true;
  }
  const xPref = parseXSocialPreferenceFromText(trimmed);
  if (xPref.length) {
    writing.length = xPref.length;
    writingHit = true;
  }
  if (xPref.emoji) {
    writing.emoji = xPref.emoji;
    writingHit = true;
  }
  if (xPref.hashtagsMax != null) {
    writing.hashtagsMax = xPref.hashtagsMax;
    writing.hashtags = xPref.hashtags;
    writingHit = true;
  } else if (xPref.hashtags) {
    writing.hashtags = xPref.hashtags;
    writingHit = true;
  }
  if (xPref.promotional) {
    writing.promotional = xPref.promotional;
    writingHit = true;
  }
  if (xPref.lineBreaks) {
    writing.lineBreaks = xPref.lineBreaks;
    writingHit = true;
  }
  if (typeof xPref.cta === "boolean") {
    writing.cta = xPref.cta;
    writingHit = true;
  }
  if (xPref.tone) {
    writing.tone = xPref.tone;
    writingHit = true;
  }
  if (/\bCTA\b|行動喚起|最後に(CTA|誘導)/i.test(trimmed)) {
    writing.cta = true;
    writingHit = true;
  }
  if (/\bSEO\b|検索に強い|キーワード/i.test(trimmed)) {
    writing.seo = true;
    writingHit = true;
  }
  if (/丁寧|敬語/.test(trimmed)) {
    writing.tone = "polite";
    writingHit = true;
  }
  if (/カジュアル/.test(trimmed)) {
    writing.tone = "casual";
    writingHit = true;
  }
  if (/強い煽り|煽り禁止/.test(trimmed)) {
    writing.forbiddenExpressions = ["煽り"];
    writingHit = true;
  }
  if (/この言い回しは嫌|言い回しは嫌/.test(trimmed)) {
    writing.forbiddenExpressions = [
      ...((writing.forbiddenExpressions as string[]) ?? []),
      "嫌いな言い回し",
    ];
    writingHit = true;
  }

  if (xPref.approval && !writingHit) {
    return {
      scope: "approval_preferences",
      key: "x_approval",
      title: "X投稿の確認",
      summary: cleaned.slice(0, 120),
      value: {
        text: cleaned,
        approval: xPref.approval,
        executionLevel: xPref.approval,
        channel: channel.channel,
        global: writeIntent === "persist_global" || channel.global,
      },
      explicit,
      global: writeIntent === "persist_global" || channel.global,
      artifactTypes: channel.artifactTypes,
    };
  }

  if (writingHit) {
    if (xPref.approval) writing.approval = xPref.approval;
    writing.channel = channel.channel;
    writing.global = writeIntent === "persist_global" || channel.global;
    return {
      scope: "writing_style",
      key: "writing_preference",
      title: "文章の好み",
      summary: cleaned.slice(0, 120),
      value: writing,
      explicit,
      global: writeIntent === "persist_global" || channel.global,
      artifactTypes: channel.artifactTypes,
    };
  }

  if (paletteMatch) {
    return withChannel(
      {
        scope: "color_palette",
        key: "palette",
        title: "配色",
        summary: cleaned.slice(0, 120),
        value: { palette: paletteMatch[1] ?? "青系", text: paletteMatch[0] },
        explicit,
      },
      trimmed,
    );
  }

  for (const pattern of EXPLICIT_PATTERNS) {
    const match = trimmed.match(pattern.re);
    if (!match) continue;
    return withChannel(
      {
        scope: pattern.scope,
        key: pattern.key,
        title: pattern.title,
        summary: cleaned.slice(0, 120),
        value: pattern.map(match, trimmed),
        explicit: /今後|毎回|いつも|これから/.test(trimmed),
      },
      trimmed,
    );
  }

  for (const pattern of CORRECTION_PATTERNS) {
    if (!pattern.re.test(trimmed)) continue;
    return withChannel(
      {
        scope: pattern.scope,
        key: pattern.key,
        title: pattern.title,
        summary: cleaned.slice(0, 120),
        value: pattern.map
          ? pattern.map(trimmed)
          : { text: cleaned },
        explicit,
      },
      trimmed,
    );
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
): {
  action: "none" | "candidate" | "explicit_candidate" | "explicit_active";
  input?: CreatePersonalMemoryInput;
  fingerprint: string;
  count: number;
} {
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

  if (isOneShotMemoryInstruction(signal.text)) {
    return { action: "none", fingerprint: "", count: 0 };
  }

  const writeIntentEarly = classifyMemoryWriteIntent(signal.text);
  if (writeIntentEarly === "automation_override") {
    return { action: "none", fingerprint: "", count: 0 };
  }

  const inferred = inferPreferenceFromText(signal.text);
  if (!inferred) {
    return { action: "none", fingerprint: "", count: 0 };
  }

  const writeIntent = classifyMemoryWriteIntent(signal.text);
  if (writeIntent === "one_shot") {
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

  const channelTypes =
    signal.artifactType && signal.artifactType.trim()
      ? [signal.artifactType.trim()]
      : inferred.artifactTypes;
  const isGlobal = channelTypes.length === 0 && inferred.global;
  const fingerprint = fingerprintCorrection({
    text: `${inferred.scope}:${inferred.key}:${channelTypes.join(",")}:${String(inferred.value.length ?? "")}:${String(inferred.value.emoji ?? "")}`,
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

  const automationOnly =
    writeIntent === "automation_override" || Boolean(signal.automationId);
  const appliesTo = automationOnly
    ? {
        global: false,
        automationIds: signal.automationId ? [signal.automationId] : [],
        artifactTypes: channelTypes,
        capabilities: [],
      }
    : {
        global: writeIntent === "persist_global" || isGlobal,
        automationIds: [],
        artifactTypes: channelTypes,
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
    status: inferred.explicit ? "active" : "candidate",
    appliesTo,
    evidence: [
      {
        kind: inferred.explicit ? "user_message" : "correction",
        summary: sanitizeUserFacingMemoryText(signal.text).slice(0, 160),
        occurredAt: new Date().toISOString(),
        automationId: signal.automationId ?? null,
      },
    ],
  };

  if (inferred.explicit) {
    return { action: "explicit_active", input: base, fingerprint, count };
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
