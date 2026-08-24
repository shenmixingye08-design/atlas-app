/**
 * Structured preference catalog — style / structure / content / automation.
 * Values are deterministic records, never free-form chat history.
 */

export const MEMORY_PREFERENCE_GROUPS = [
  "style",
  "structure",
  "content",
  "automation",
] as const;

export type MemoryPreferenceGroup = (typeof MEMORY_PREFERENCE_GROUPS)[number];

export const STYLE_PREFERENCE_KEYS = [
  "tone",
  "firstPerson",
  "sentenceEnding",
  "emoji",
  "length",
  "lineBreaks",
  "bullets",
  "jargon",
] as const;

export const STRUCTURE_PREFERENCE_KEYS = [
  "opening",
  "bodyStructure",
  "cta",
  "hashtagsMax",
  "urlPosition",
  "title",
  "postLength",
  "artifactFormat",
] as const;

export const CONTENT_PREFERENCE_KEYS = [
  "preferredThemes",
  "avoidedThemes",
  "forbiddenWords",
  "requiredPhrases",
  "forbiddenFacts",
  "companyFacts",
  "audience",
  "purpose",
] as const;

export const AUTOMATION_PREFERENCE_KEYS = [
  "frequency",
  "weekdays",
  "runHour",
  "timezone",
  "approval",
  "notification",
  "destination",
  "onFailure",
] as const;

export const ALL_PREFERENCE_KEYS = [
  ...STYLE_PREFERENCE_KEYS,
  ...STRUCTURE_PREFERENCE_KEYS,
  ...CONTENT_PREFERENCE_KEYS,
  ...AUTOMATION_PREFERENCE_KEYS,
] as const;

export type PreferenceKey = (typeof ALL_PREFERENCE_KEYS)[number];

export const FORBIDDEN_PREFERENCE_KEYS = [
  "forbiddenWords",
  "forbiddenFacts",
  "avoidedThemes",
] as const;

export type StructuredPreferences = {
  tone: "polite" | "casual" | null;
  firstPerson: string | null;
  sentenceEnding: string | null;
  emoji: "none" | "few" | "many" | null;
  length: "short" | "medium" | "long" | null;
  lineBreaks: "compact" | "spaced" | null;
  bullets: boolean | null;
  jargon: "none" | "few" | "many" | null;
  opening: string | null;
  bodyStructure: string | null;
  cta: boolean | null;
  hashtagsMax: number | null;
  urlPosition: "none" | "inline" | "end" | null;
  title: boolean | null;
  postLength: "short" | "medium" | "long" | null;
  artifactFormat: string | null;
  preferredThemes: string[];
  avoidedThemes: string[];
  forbiddenWords: string[];
  requiredPhrases: string[];
  forbiddenFacts: string[];
  companyFacts: string[];
  audience: string | null;
  purpose: string | null;
  frequency: string | null;
  weekdays: string[];
  runHour: number | null;
  timezone: string | null;
  approval: "approve_then_run" | "full_auto" | null;
  notification: string | null;
  destination: string | null;
  onFailure: string | null;
};

export const EMPTY_STRUCTURED_PREFERENCES: StructuredPreferences = {
  tone: null,
  firstPerson: null,
  sentenceEnding: null,
  emoji: null,
  length: null,
  lineBreaks: null,
  bullets: null,
  jargon: null,
  opening: null,
  bodyStructure: null,
  cta: null,
  hashtagsMax: null,
  urlPosition: null,
  title: null,
  postLength: null,
  artifactFormat: null,
  preferredThemes: [],
  avoidedThemes: [],
  forbiddenWords: [],
  requiredPhrases: [],
  forbiddenFacts: [],
  companyFacts: [],
  audience: null,
  purpose: null,
  frequency: null,
  weekdays: [],
  runHour: null,
  timezone: null,
  approval: null,
  notification: null,
  destination: null,
  onFailure: null,
};

const LIST_KEYS = new Set<keyof StructuredPreferences>([
  "preferredThemes",
  "avoidedThemes",
  "forbiddenWords",
  "requiredPhrases",
  "forbiddenFacts",
  "companyFacts",
  "weekdays",
]);

const FORBIDDEN_LIST_KEYS = new Set<keyof StructuredPreferences>([
  "avoidedThemes",
  "forbiddenWords",
  "forbiddenFacts",
]);

function uniqueStrings(values: readonly unknown[]): string[] {
  return [
    ...new Set(
      values
        .map((item) => (typeof item === "string" ? item.trim() : ""))
        .filter(Boolean),
    ),
  ].slice(0, 30);
}

export function readStructuredPreferences(
  value: Record<string, unknown> | null | undefined,
): Partial<StructuredPreferences> {
  if (!value) return {};
  const out: Partial<StructuredPreferences> = {};
  if (value.tone === "polite" || value.tone === "casual") out.tone = value.tone;
  if (typeof value.firstPerson === "string") out.firstPerson = value.firstPerson;
  if (typeof value.sentenceEnding === "string") {
    out.sentenceEnding = value.sentenceEnding;
  }
  if (value.emoji === "none" || value.emoji === "few" || value.emoji === "many") {
    out.emoji = value.emoji;
  }
  if (value.length === "short" || value.length === "medium" || value.length === "long") {
    out.length = value.length;
    out.postLength = value.length;
  }
  if (value.lineBreaks === "compact" || value.lineBreaks === "spaced") {
    out.lineBreaks = value.lineBreaks;
  }
  if (typeof value.bullets === "boolean") out.bullets = value.bullets;
  if (value.structure === "bullets") out.bullets = true;
  if (value.jargon === "none" || value.jargon === "few" || value.jargon === "many") {
    out.jargon = value.jargon;
  }
  if (typeof value.opening === "string") out.opening = value.opening;
  if (typeof value.bodyStructure === "string") {
    out.bodyStructure = value.bodyStructure;
  }
  if (typeof value.cta === "boolean") out.cta = value.cta;
  if (typeof value.hashtagsMax === "number") {
    out.hashtagsMax = Math.min(8, Math.max(0, value.hashtagsMax));
  }
  if (
    value.urlPosition === "none" ||
    value.urlPosition === "inline" ||
    value.urlPosition === "end"
  ) {
    out.urlPosition = value.urlPosition;
  }
  if (typeof value.title === "boolean") out.title = value.title;
  if (typeof value.artifactFormat === "string") {
    out.artifactFormat = value.artifactFormat;
  }
  if (Array.isArray(value.formats) && value.formats[0]) {
    out.artifactFormat = String(value.formats[0]);
  }
  if (Array.isArray(value.preferredThemes)) {
    out.preferredThemes = uniqueStrings(value.preferredThemes);
  }
  if (Array.isArray(value.avoidedThemes)) {
    out.avoidedThemes = uniqueStrings(value.avoidedThemes);
  }
  if (Array.isArray(value.forbiddenWords) || Array.isArray(value.forbiddenExpressions)) {
    out.forbiddenWords = uniqueStrings([
      ...((value.forbiddenWords as unknown[]) ?? []),
      ...((value.forbiddenExpressions as unknown[]) ?? []),
    ]);
  }
  if (Array.isArray(value.requiredPhrases)) {
    out.requiredPhrases = uniqueStrings(value.requiredPhrases);
  }
  if (Array.isArray(value.forbiddenFacts)) {
    out.forbiddenFacts = uniqueStrings(value.forbiddenFacts);
  }
  if (Array.isArray(value.companyFacts)) {
    out.companyFacts = uniqueStrings(value.companyFacts);
  }
  if (typeof value.audience === "string") out.audience = value.audience;
  if (typeof value.purpose === "string") out.purpose = value.purpose;
  if (typeof value.theme === "string") {
    out.preferredThemes = uniqueStrings([
      ...(out.preferredThemes ?? []),
      value.theme,
    ]);
  }
  if (typeof value.frequency === "string") out.frequency = value.frequency;
  if (Array.isArray(value.weekdays)) out.weekdays = uniqueStrings(value.weekdays);
  if (typeof value.runHour === "number") {
    out.runHour = Math.min(23, Math.max(0, value.runHour));
  }
  if (typeof value.postingHour === "number") {
    out.runHour = Math.min(23, Math.max(0, value.postingHour));
  }
  if (typeof value.timezone === "string") out.timezone = value.timezone;
  if (value.approval === "approve_then_run" || value.approval === "full_auto") {
    out.approval = value.approval;
  }
  if (typeof value.notification === "string") out.notification = value.notification;
  if (typeof value.destination === "string") out.destination = value.destination;
  if (typeof value.onFailure === "string") out.onFailure = value.onFailure;
  return out;
}

function overlayScalar<T>(
  current: T,
  next: T,
  options?: { keepIfEmptyList?: boolean },
): T {
  if (next === undefined || next === null) return current;
  if (Array.isArray(next) && next.length === 0 && options?.keepIfEmptyList) {
    return current;
  }
  return next;
}

/**
 * Higher layer overwrites lower, except forbidden lists which always union.
 * Empty forbidden from a newer layer never clears older forbidden.
 */
export function mergeStructuredPreferences(
  layers: readonly Partial<StructuredPreferences>[],
): {
  merged: StructuredPreferences;
  overridden: string[];
  excluded: string[];
} {
  const merged = { ...EMPTY_STRUCTURED_PREFERENCES };
  const overridden: string[] = [];
  const excluded: string[] = [];

  for (const layer of layers) {
    for (const key of ALL_PREFERENCE_KEYS) {
      const incoming = layer[key];
      if (incoming === undefined || incoming === null) continue;
      if (LIST_KEYS.has(key)) {
        const incomingList = uniqueStrings(incoming as unknown[]);
        const currentList = merged[key] as string[];
        if (FORBIDDEN_LIST_KEYS.has(key)) {
          const next = uniqueStrings([...currentList, ...incomingList]);
          if (incomingList.length === 0) {
            excluded.push(key);
            continue;
          }
          if (currentList.length > 0 && incomingList.some((item) => !currentList.includes(item))) {
            overridden.push(key);
          }
          (merged as Record<string, unknown>)[key] = next;
          continue;
        }
        if (incomingList.length === 0) continue;
        if (currentList.length > 0 && JSON.stringify(currentList) !== JSON.stringify(incomingList)) {
          overridden.push(key);
        }
        (merged as Record<string, unknown>)[key] = incomingList;
        continue;
      }
      const current = merged[key];
      if (current != null && current !== incoming) overridden.push(key);
      (merged as Record<string, unknown>)[key] = overlayScalar(current, incoming);
    }
  }

  return { merged, overridden: [...new Set(overridden)], excluded: [...new Set(excluded)] };
}

export function describeStructuredPreferences(prefs: StructuredPreferences): string[] {
  const labels: string[] = [];
  if (prefs.tone === "polite") labels.push("丁寧な文体");
  if (prefs.tone === "casual") labels.push("カジュアルな文体");
  if (prefs.firstPerson) labels.push(`一人称は「${prefs.firstPerson}」`);
  if (prefs.sentenceEnding) labels.push(`語尾は「${prefs.sentenceEnding}」`);
  if (prefs.emoji === "none") labels.push("絵文字なし");
  if (prefs.emoji === "few") labels.push("絵文字少なめ");
  if (prefs.emoji === "many") labels.push("絵文字多め");
  if (prefs.length === "short") labels.push("文章は短め");
  if (prefs.length === "long") labels.push("文章は長め");
  if (prefs.lineBreaks === "compact") labels.push("改行少なめ");
  if (prefs.lineBreaks === "spaced") labels.push("改行多め");
  if (prefs.bullets === true) labels.push("箇条書きを使う");
  if (prefs.jargon === "none") labels.push("専門用語は少なめ");
  if (prefs.cta === true) labels.push("CTAあり");
  if (prefs.cta === false) labels.push("CTAなし");
  if (prefs.hashtagsMax != null) labels.push(`ハッシュタグ最大${prefs.hashtagsMax}個`);
  if (prefs.forbiddenWords.length > 0) {
    labels.push(`使わない言葉: ${prefs.forbiddenWords.slice(0, 3).join("、")}`);
  }
  if (prefs.preferredThemes.length > 0) {
    labels.push(`優先テーマ: ${prefs.preferredThemes.slice(0, 3).join("、")}`);
  }
  if (prefs.approval === "approve_then_run") labels.push("実行前に確認");
  if (prefs.approval === "full_auto") labels.push("自動実行");
  return labels;
}

export function preferenceLayerRank(layer: string | null | undefined): number {
  switch (layer) {
    case "explicit_instruction":
      return 100;
    case "automation_job":
      return 80;
    case "x_post":
      return 70;
    case "channel":
      return 60;
    case "artifact_format":
      return 50;
    case "user_global":
      return 30;
    case "system_default":
      return 10;
    default:
      return 20;
  }
}
