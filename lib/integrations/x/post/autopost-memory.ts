/**
 * Apply Personal Memory to dedicated X auto-post.
 * Fail-open: Memory errors never block posting.
 * Priority: current explicit settings / one-shot text > Memory > default.
 */

import "server-only";

import {
  EMPTY_X_SOCIAL_PREFERENCE,
  X_MEMORY_ALLOWED_SCOPES,
  X_MEMORY_DENIED_SCOPES,
  describeXSocialPreference,
  mergeXSocialPreference,
  parseXSocialPreferenceFromText,
  xSocialPreferenceFromResolved,
  type XSocialPreference,
} from "@/lib/memory-apply/x-social-preference";
import { ingestCorrectionSignal, resolveForContext } from "@/lib/personal-memory/service";

import type { XAutoPostSettings } from "./autopost-types";

export type AutoPostMemoryApply = {
  settings: XAutoPostSettings;
  preference: XSocialPreference;
  applied: boolean;
  labels: string[];
  memoryFailed: boolean;
  explicitOverride: boolean;
  guidance: string[];
};

function definedKeys(pref: Partial<XSocialPreference>): string[] {
  return Object.entries(pref)
    .filter(([, value]) => value !== undefined && value !== null)
    .map(([key]) => key);
}

function memoryContributed(
  memory: XSocialPreference,
  explicit: Partial<XSocialPreference>,
): boolean {
  for (const key of definedKeys(memory)) {
    const memoryValue = memory[key as keyof XSocialPreference];
    const explicitValue = explicit[key as keyof XSocialPreference];
    if (memoryValue != null && (explicitValue === undefined || explicitValue === null)) {
      return true;
    }
  }
  return false;
}

export function settingsToExplicitPreference(
  settings: XAutoPostSettings,
): Partial<XSocialPreference> {
  const fromText = parseXSocialPreferenceFromText(
    [settings.purpose, settings.tone, settings.audience, ...settings.themes].join(
      " ",
    ),
  );
  return {
    ...fromText,
    theme: settings.themes[0] ?? fromText.theme ?? null,
    tone: fromText.tone ?? (settings.tone ? settings.tone : null),
    hashtags: settings.includeHashtags ? (fromText.hashtags ?? "limited") : "none",
    hashtagsMax: settings.includeHashtags ? (fromText.hashtagsMax ?? 2) : 0,
  };
}

export function buildAutoPostMemoryGuidance(pref: XSocialPreference): string[] {
  const lines: string[] = [];
  if (pref.length === "short") lines.push("文章は短め・簡潔に。");
  if (pref.length === "long") lines.push("今回の明示指示に従い、詳しく書く。");
  if (pref.tone === "polite") lines.push("丁寧な敬語で書く。");
  if (pref.tone === "casual") lines.push("カジュアルな口調で書く。");
  if (pref.emoji === "none") lines.push("絵文字は使わない。");
  if (pref.emoji === "few") lines.push("絵文字は控えめ。");
  if (pref.emoji === "many") lines.push("絵文字を多めに使ってよい。");
  if (pref.hashtags === "none" || pref.hashtagsMax === 0) {
    lines.push("ハッシュタグは付けない。");
  } else if (pref.hashtagsMax != null) {
    lines.push(`ハッシュタグは最大${pref.hashtagsMax}個、末尾に付ける。`);
  }
  if (pref.promotional === "none") lines.push("強い営業文は書かない。");
  if (pref.promotional === "weak") lines.push("宣伝は控えめにする。");
  if (pref.cta === false) lines.push("行動喚起（CTA）は付けない。");
  if (pref.cta === true) lines.push("自然なCTAを1つ付けてよい。");
  if (pref.lineBreaks === "compact") lines.push("改行は少なめ。");
  if (pref.lineBreaks === "spaced") lines.push("読みやすいよう改行を多めに。");
  return lines;
}

function overlaySettings(
  settings: XAutoPostSettings,
  merged: XSocialPreference,
  explicit: Partial<XSocialPreference>,
): XAutoPostSettings {
  const toneFromMemory =
    !explicit.tone && merged.tone === "polite"
      ? "丁寧"
      : !explicit.tone && merged.tone === "casual"
        ? "親しみやすい"
        : settings.tone;
  const includeHashtags =
    explicit.hashtags != null
      ? settings.includeHashtags
      : merged.hashtags !== "none";
  const themes =
    settings.themes.length > 0
      ? settings.themes
      : merged.theme
        ? [merged.theme]
        : settings.themes;

  return {
    ...settings,
    tone: toneFromMemory,
    includeHashtags,
    themes,
  };
}

export async function applyMemoryToDedicatedAutoPost(input: {
  userId: string;
  settings: XAutoPostSettings;
  oneShotText?: string | null;
}): Promise<AutoPostMemoryApply> {
  const explicitFromSettings = settingsToExplicitPreference(input.settings);
  const oneShot = input.oneShotText?.trim()
    ? parseXSocialPreferenceFromText(input.oneShotText)
    : {};
  const explicit = { ...explicitFromSettings, ...oneShot };

  let memoryPref: XSocialPreference = { ...EMPTY_X_SOCIAL_PREFERENCE };
  let memoryFailed = false;

  try {
    const { result } = await resolveForContext({
      userId: input.userId,
      allowedScopes: [...X_MEMORY_ALLOWED_SCOPES],
      deniedScopes: [...X_MEMORY_DENIED_SCOPES],
      artifactTypes: ["x_post"],
      capabilities: ["x_post", "sns"],
      currentInstruction: explicit as Record<string, unknown>,
    });
    memoryPref = xSocialPreferenceFromResolved(result.used);
  } catch {
    memoryFailed = true;
    memoryPref = { ...EMPTY_X_SOCIAL_PREFERENCE };
  }

  const merged = mergeXSocialPreference({
    memory: memoryPref,
    explicit,
  });
  const applied =
    !memoryFailed && memoryContributed(memoryPref, explicit);
  const labels = applied ? describeXSocialPreference(memoryPref) : [];

  return {
    settings: overlaySettings(input.settings, merged, explicit),
    preference: merged,
    applied,
    labels,
    memoryFailed,
    explicitOverride: definedKeys(oneShot).length > 0,
    guidance: buildAutoPostMemoryGuidance(merged),
  };
}

/** Persist saved style so the next run can reuse it. Fail-open. */
export async function rememberDedicatedAutoPostSettings(input: {
  userId: string;
  settings: XAutoPostSettings;
}): Promise<boolean> {
  const { settings } = input;
  const theme = settings.themes.join("、") || "（指定なし）";
  const hash = settings.includeHashtags
    ? "ハッシュタグは2個まで付ける"
    : "ハッシュタグなし";
  const text = [
    "今後のX投稿の好みとして覚えて。",
    `テーマは${theme}。`,
    `トーンは${settings.tone || "丁寧"}。`,
    hash,
    /短/.test(settings.tone) ? "短め。" : "",
    /丁寧/.test(settings.tone) ? "丁寧。" : "",
  ]
    .filter(Boolean)
    .join(" ");

  try {
    await ingestCorrectionSignal({
      userId: input.userId,
      text,
      artifactType: "x_post",
      source: "user_explicit",
    });
    return true;
  } catch {
    return false;
  }
}
