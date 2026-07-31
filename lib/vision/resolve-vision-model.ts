import "server-only";

/**
 * Vision-only model resolver — independent from planner/worker chat routing.
 *
 * Allowlist prevents accidental OPENAI_VISION_MODEL typos / non-vision models.
 */

export const DEFAULT_VISION_MODEL = "gpt-5.5";

/** Models known to accept Responses API image inputs. */
export const VISION_MODEL_ALLOWLIST = [
  "gpt-5.5",
  "gpt-5.5-2026-04-23",
  "gpt-5-mini",
  "gpt-5-mini-2025-08-07",
  "gpt-4.1",
  "gpt-4.1-mini",
  "gpt-4.1-mini-2025-04-14",
  "gpt-4o",
  "gpt-4o-mini",
  "gpt-4o-2024-08-06",
] as const;

/** Ordered fallbacks when primary model fails with model/image capability errors. */
export const VISION_MODEL_FALLBACKS = [
  "gpt-5-mini",
  "gpt-4.1-mini",
  "gpt-4o-mini",
] as const;

const NON_VISION_BLOCKLIST = [
  /text-embedding/i,
  /whisper/i,
  /tts/i,
  /dall-e/i,
  /gpt-image/i,
  /codex/i,
  /^o1(?!-)/i,
];

export function isAllowedVisionModel(model: string): boolean {
  const trimmed = model.trim();
  if (!trimmed) return false;
  if (NON_VISION_BLOCKLIST.some((re) => re.test(trimmed))) return false;
  if (
    (VISION_MODEL_ALLOWLIST as readonly string[]).includes(trimmed)
  ) {
    return true;
  }
  // Allow dated snapshots of allowlisted families.
  return /^(gpt-5\.5|gpt-5-mini|gpt-4\.1|gpt-4o)(-\d{4}-\d{2}-\d{2})?$/i.test(
    trimmed,
  );
}

export function resolveVisionModel(): string {
  const fromEnv = process.env.OPENAI_VISION_MODEL?.trim();
  if (fromEnv && isAllowedVisionModel(fromEnv)) {
    return fromEnv;
  }
  if (fromEnv) {
    console.warn("[vision] OPENAI_VISION_MODEL rejected; using default", {
      rejected: fromEnv.slice(0, 80),
      fallback: DEFAULT_VISION_MODEL,
    });
  }
  return DEFAULT_VISION_MODEL;
}

export function resolveVisionFallbackModel(
  primary: string,
  attempt: number,
): string {
  if (attempt <= 2) return primary;
  const candidates = VISION_MODEL_FALLBACKS.filter(
    (model) => model !== primary && isAllowedVisionModel(model),
  );
  return candidates[0] ?? DEFAULT_VISION_MODEL;
}
