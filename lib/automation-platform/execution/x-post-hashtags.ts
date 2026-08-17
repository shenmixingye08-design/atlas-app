/**
 * X automation hashtag selection — regular code, no extra AI call.
 * Attaches 0–2 related tags after the existing body generation.
 * Does not post, schedule, or change approval.
 */

import type { XAutomationPostAngle } from "@/lib/automation-platform/execution/x-post-copy-quality";

export const X_POST_HASHTAG_MAX = 2;

const HASHTAG_TOKEN = /[#＃]([\p{L}\p{N}_]+)/gu;

export type XPostHashtagThemeId =
  | "side_job"
  | "freelance"
  | "ai"
  | "efficiency"
  | "sns"
  | "automation"
  | "minervot";

type ThemeRule = {
  id: XPostHashtagThemeId;
  tag: string;
  patterns: readonly RegExp[];
  weight: number;
  brand?: boolean;
};

const THEME_RULES: readonly ThemeRule[] = [
  { id: "side_job", tag: "#副業", patterns: [/副業/], weight: 3 },
  {
    id: "freelance",
    tag: "#フリーランス",
    patterns: [/フリーランス/, /一人で(仕事|回|事業)/, /個人で(仕事|事業)/],
    weight: 2,
  },
  {
    id: "ai",
    tag: "#AI活用",
    patterns: [/AI秘書/, /AIに任/, /AI活用/, /AIで/, /AIの/],
    weight: 3,
  },
  {
    id: "efficiency",
    tag: "#業務効率化",
    patterns: [/業務効率/, /効率化/, /事務作業/],
    weight: 2,
  },
  {
    id: "sns",
    tag: "#SNS運用",
    patterns: [/SNS/, /X投稿/, /ツイート/, /投稿自動化/, /投稿文/, /何を書こう/],
    weight: 3,
  },
  {
    id: "automation",
    tag: "#自動化",
    patterns: [/自動化/, /自動(で|投稿|実行)/],
    weight: 2,
  },
  {
    id: "minervot",
    tag: "#MINERVOT",
    patterns: [/MINERVOT/, /ミネルボット/],
    weight: 1,
    brand: true,
  },
];

const ALLOWED_TAGS = new Set(THEME_RULES.map((rule) => rule.tag));

const UNRELATED_TAG_PATTERN =
  /ニュース|芸能|スポーツ|イベント|トレンド|速報|炎上|オリンピック|選挙|天気|フォロー|相互/;

const MINERVOT_BRAND_PATTERN = /新機能|開発|改善|使い方|利用例|紹介|AI秘書/;

const MINERVOT_BRAND_ANGLES = new Set<XAutomationPostAngle>([
  "product_improvement",
  "secretary_usage",
  "handy_tip",
]);

export type XPostHashtagMemory = {
  disabled: boolean;
  max: number | null;
  preferred: string[];
  banned: string[];
  preferBrand: boolean;
};

export type XPostHashtagApplyResult = {
  text: string;
  hashtags: string[];
  themes: XPostHashtagThemeId[];
};

export function normalizeXPostHashtag(raw: string): string {
  const token = raw.trim().replace(/^[#＃]/, "");
  if (!token) return "";
  return `#${token}`;
}

export function extractXPostHashtags(text: string): string[] {
  const tags: string[] = [];
  for (const match of text.matchAll(HASHTAG_TOKEN)) {
    const tag = normalizeXPostHashtag(match[1] ?? "");
    if (tag && !tags.includes(tag)) tags.push(tag);
  }
  return tags;
}

export function stripXPostHashtags(text: string): string {
  return text
    .replace(HASHTAG_TOKEN, " ")
    .replace(/[ \t]{2,}/g, " ")
    .replace(/[ \t]+\n/g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

export function isUnrelatedXPostHashtag(tag: string): boolean {
  const normalized = normalizeXPostHashtag(tag);
  if (!normalized) return true;
  if (UNRELATED_TAG_PATTERN.test(normalized)) return true;
  if (ALLOWED_TAGS.has(normalized)) return false;
  return true;
}

export function parseXPostHashtagMemory(
  memoryInjection?: string | null,
): XPostHashtagMemory {
  const text = memoryInjection?.trim() ?? "";
  if (!text) {
    return {
      disabled: false,
      max: null,
      preferred: [],
      banned: [],
      preferBrand: false,
    };
  }

  const count = text.match(/ハッシュタグ\s*(?:最大)?\s*(\d+)\s*個/);
  const disabled =
    /ハッシュタグ(なし|無し|不要|やめて|を使わない|なしで)/.test(text) ||
    (count ? Number.parseInt(count[1]!, 10) === 0 : false);
  const max = count
    ? Math.min(X_POST_HASHTAG_MAX, Math.max(0, Number.parseInt(count[1]!, 10)))
    : disabled
      ? 0
      : null;

  const preferred = collectListedTags(
    text,
    /よく使う(?:タグ|ハッシュタグ)?[:：]?\s*([^\n]+)/,
  );
  const banned = collectListedTags(
    text,
    /使いたくない(?:タグ|ハッシュタグ)?[:：]?\s*([^\n]+)/,
  );
  const preferBrand =
    /ブランドタグ|MINERVOTタグを付け|#MINERVOTを付け/.test(text);

  return { disabled, max, preferred, banned, preferBrand };
}

function collectListedTags(text: string, pattern: RegExp): string[] {
  const match = text.match(pattern);
  if (!match?.[1]) return [];
  return extractXPostHashtags(match[1]);
}

export function scoreXPostHashtagThemes(input: {
  body: string;
  topic?: string;
}): { id: XPostHashtagThemeId; tag: string; score: number }[] {
  const hay = `${input.body}\n${input.topic ?? ""}`;
  const scored: { id: XPostHashtagThemeId; tag: string; score: number }[] = [];
  for (const rule of THEME_RULES) {
    let score = 0;
    for (const pattern of rule.patterns) {
      if (pattern.test(hay)) score += rule.weight;
    }
    if (score > 0) scored.push({ id: rule.id, tag: rule.tag, score });
  }
  return scored.sort((a, b) => b.score - a.score);
}

function shouldUseMinervotTag(input: {
  body: string;
  angle?: XAutomationPostAngle;
  memory: XPostHashtagMemory;
}): boolean {
  if (!/MINERVOT|ミネルボット/.test(input.body)) return false;
  if (input.memory.preferBrand) return true;
  if (MINERVOT_BRAND_PATTERN.test(input.body)) return true;
  if (input.angle && MINERVOT_BRAND_ANGLES.has(input.angle)) return true;
  return false;
}

function sameTagSet(a: string[], b: string[]): boolean {
  if (a.length === 0 || b.length === 0 || a.length !== b.length) return false;
  const left = [...a].sort().join(" ");
  const right = [...b].sort().join(" ");
  return left === right;
}

export function selectXPostHashtags(input: {
  body: string;
  angle?: XAutomationPostAngle;
  topic?: string;
  memoryInjection?: string | null;
  recentTexts?: string[];
  seed?: number;
}): { hashtags: string[]; themes: XPostHashtagThemeId[] } {
  const memory = parseXPostHashtagMemory(input.memoryInjection);
  if (memory.disabled || memory.max === 0) {
    return { hashtags: [], themes: [] };
  }

  const max = Math.min(X_POST_HASHTAG_MAX, memory.max ?? X_POST_HASHTAG_MAX);
  const scored = scoreXPostHashtagThemes({
    body: input.body,
    topic: input.topic,
  });
  const themes = scored.map((item) => item.id);
  let candidates = scored.map((item) => item.tag);

  if (
    !shouldUseMinervotTag({
      body: input.body,
      angle: input.angle,
      memory,
    })
  ) {
    candidates = candidates.filter((tag) => tag !== "#MINERVOT");
  } else if (!candidates.includes("#MINERVOT")) {
    candidates.push("#MINERVOT");
  }

  for (const preferred of memory.preferred) {
    if (candidates.includes(preferred)) continue;
    if (scored.some((item) => item.tag === preferred)) {
      candidates.push(preferred);
    }
  }

  candidates = candidates.filter(
    (tag) => !memory.banned.includes(tag) && !isUnrelatedXPostHashtag(tag),
  );
  candidates = [...new Set(candidates)];
  if (candidates.length === 0) return { hashtags: [], themes };

  const seed = Number.isFinite(input.seed) ? Math.trunc(input.seed!) : 0;
  let count = 0;
  if (seed % 5 === 0) {
    count = 0;
  } else if (candidates.length === 1 || seed % 2 === 1) {
    count = 1;
  } else {
    count = Math.min(2, max, candidates.length);
  }
  count = Math.min(count, max, candidates.length);

  let picked = candidates.slice(0, count);
  const last = extractXPostHashtags(input.recentTexts?.[0] ?? "");
  if (sameTagSet(picked, last) && candidates.length > picked.length) {
    const alternative = candidates.find((tag) => !picked.includes(tag));
    if (alternative) {
      picked = [...picked.slice(0, -1), alternative];
    }
  } else if (sameTagSet(picked, last) && picked.length > 1) {
    picked = picked.slice(0, 1);
  }

  return { hashtags: picked.slice(0, max), themes };
}

export function attachXPostHashtags(body: string, hashtags: string[]): string {
  const clean = stripXPostHashtags(body);
  const tags = hashtags
    .map(normalizeXPostHashtag)
    .filter((tag) => tag && !isUnrelatedXPostHashtag(tag))
    .slice(0, X_POST_HASHTAG_MAX);
  const unique = [...new Set(tags)];
  if (!clean) return unique.join(" ");
  if (unique.length === 0) return clean;
  return `${clean}\n${unique.join(" ")}`;
}

export function applyXAutomationPostHashtags(input: {
  text: string;
  angle?: XAutomationPostAngle;
  topic?: string;
  memoryInjection?: string | null;
  recentTexts?: string[];
  seed?: number;
  skipAutoHashtags?: boolean;
}): XPostHashtagApplyResult {
  const body = stripXPostHashtags(input.text);
  if (!body) {
    return { text: "", hashtags: [], themes: [] };
  }
  if (input.skipAutoHashtags) {
    return { text: body, hashtags: [], themes: [] };
  }

  const selected = selectXPostHashtags({
    body,
    angle: input.angle,
    topic: input.topic,
    memoryInjection: input.memoryInjection,
    recentTexts: input.recentTexts,
    seed: input.seed,
  });
  return {
    text: attachXPostHashtags(body, selected.hashtags),
    hashtags: selected.hashtags,
    themes: selected.themes,
  };
}

export function allowsFixedTextHashtagAuto(input: {
  configuration?: Readonly<Record<string, unknown>> | null;
  notes?: string | null;
}): boolean {
  const configuration = input.configuration ?? {};
  if (
    configuration.autoHashtags === true ||
    configuration.hashtagAuto === true
  ) {
    return true;
  }
  const notes = [
    input.notes ?? "",
    typeof configuration.generateInstruction === "string"
      ? configuration.generateInstruction
      : "",
  ].join("\n");
  return /ハッシュタグ(も|を)?(自動)?(で)?(付け|追加|選定|つけて)/.test(notes);
}
