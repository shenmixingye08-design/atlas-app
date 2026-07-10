/**
 * Internal model tier catalog — the only place OpenAI model ids are defined.
 * Departments and orchestration code must not reference these strings directly.
 */
import type { ReasoningLevel } from "./model-policy";

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
    inputPricePerMillion: 8.0,
    outputPricePerMillion: 24.0,
    capabilities: GPT5_CAPABILITIES,
  },
  cheap: {
    tier: "cheap",
    model: "gpt-5-mini",
    inputPricePerMillion: 0.25,
    outputPricePerMillion: 2.0,
    capabilities: GPT5_MINI_CAPABILITIES,
  },
};

const MODEL_CAPABILITY_BY_ID = new Map<string, ModelCapabilities>(
  Object.values(MODEL_CATALOG).map((entry) => [entry.model, entry.capabilities]),
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

/** @deprecated Use {@link resolveModelFromTier} via the policy engine. */
export const STRONG_MODEL = MODEL_CATALOG.strong.model;
/** @deprecated Use {@link resolveModelFromTier} via the policy engine. */
export const CHEAP_MODEL = MODEL_CATALOG.cheap.model;
