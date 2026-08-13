/**
 * Internal model tier catalog — the only place OpenAI model ids and unit
 * prices are defined. Cost meter, usage ledger, and Owner reporting must
 * read prices from here (never hardcode in callers).
 */
export type ModelTier = "strong" | "cheap";

export type ModelTokenParamName = "max_output_tokens" | "max_tokens";

export type ModelCapabilities = {
  supportsTemperature: boolean;
  supportsReasoning: boolean;
  supportsTopP: boolean;
  tokenParamName: ModelTokenParamName;
};

export type ModelCatalogEntry = {
  tier: ModelTier;
  model: string;
  inputPricePerMillion: number;
  cachedInputPricePerMillion: number;
  outputPricePerMillion: number;
  capabilities: ModelCapabilities;
};

const GPT5_MINI_CAPABILITIES: ModelCapabilities = {
  supportsTemperature: false,
  supportsReasoning: true,
  supportsTopP: false,
  tokenParamName: "max_output_tokens",
};

const GPT5_CAPABILITIES: ModelCapabilities = {
  supportsTemperature: false,
  supportsReasoning: true,
  supportsTopP: false,
  tokenParamName: "max_output_tokens",
};

const LEGACY_CHAT_CAPABILITIES: ModelCapabilities = {
  supportsTemperature: true,
  supportsReasoning: false,
  supportsTopP: true,
  tokenParamName: "max_output_tokens",
};

export const MODEL_CATALOG: Record<ModelTier, ModelCatalogEntry> = {
  strong: {
    tier: "strong",
    model: "gpt-5.5",
    inputPricePerMillion: 5.0,
    cachedInputPricePerMillion: 0.5,
    outputPricePerMillion: 30.0,
    capabilities: GPT5_CAPABILITIES,
  },
  cheap: {
    tier: "cheap",
    model: "gpt-5-mini",
    inputPricePerMillion: 0.25,
    cachedInputPricePerMillion: 0.025,
    outputPricePerMillion: 2.0,
    capabilities: GPT5_MINI_CAPABILITIES,
  },
};

/** Version stamp for Owner cost reporting (token × catalog unit price). */
export const MODEL_PRICING_TABLE_VERSION = "2026-08-openai-gpt55-v2";
export const MODEL_PRICING_TABLE_UPDATED_AT = "2026-08-13T00:00:00.000Z";

const MODEL_CAPABILITY_BY_ID = new Map<string, ModelCapabilities>(
  Object.values(MODEL_CATALOG).map((entry) => [entry.model, entry.capabilities]),
);

const MODEL_ENTRY_BY_ID = new Map<string, ModelCatalogEntry>(
  Object.values(MODEL_CATALOG).map((entry) => [entry.model, entry]),
);

export function resolveModelFromTier(tier: ModelTier): ModelCatalogEntry {
  return MODEL_CATALOG[tier];
}

/** Capability metadata for a concrete OpenAI model id. */
export function getModelCapabilities(model: string): ModelCapabilities {
  const exact = MODEL_CAPABILITY_BY_ID.get(model);
  if (exact) return exact;

  const normalized = model.trim().toLowerCase();
  if (normalized.includes("gpt-5-mini") || normalized.includes("o4-mini")) {
    return GPT5_MINI_CAPABILITIES;
  }
  if (/gpt-5|o3|o4(?!-mini)/.test(normalized)) {
    return GPT5_CAPABILITIES;
  }

  return LEGACY_CHAT_CAPABILITIES;
}

export function resolveCatalogEntryForModel(model?: string): ModelCatalogEntry {
  if (model) {
    const exact = MODEL_ENTRY_BY_ID.get(model);
    if (exact) return exact;
    const normalized = model.trim().toLowerCase();
    if (normalized.includes("gpt-5-mini") || normalized.includes("o4-mini")) {
      return MODEL_CATALOG.cheap;
    }
    if (/gpt-5|o3|o4(?!-mini)/.test(normalized)) {
      return MODEL_CATALOG.strong;
    }
  }
  return MODEL_CATALOG.cheap;
}

/** Token × catalog unit price. Cached input uses cachedInputPricePerMillion. */
export function estimateTokenCostUsd(input: {
  inputTokens: number;
  outputTokens: number;
  cached?: boolean;
  model?: string;
}): number {
  const entry = resolveCatalogEntryForModel(input.model);
  const inputPrice = input.cached
    ? entry.cachedInputPricePerMillion
    : entry.inputPricePerMillion;
  return (
    (Math.max(0, input.inputTokens) / 1_000_000) * inputPrice +
    (Math.max(0, input.outputTokens) / 1_000_000) * entry.outputPricePerMillion
  );
}

/** @deprecated Use {@link resolveModelFromTier} via the policy engine. */
export const STRONG_MODEL = MODEL_CATALOG.strong.model;
/** @deprecated Use {@link resolveModelFromTier} via the policy engine. */
export const CHEAP_MODEL = MODEL_CATALOG.cheap.model;
