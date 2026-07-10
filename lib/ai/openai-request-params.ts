import type { ReasoningLevel } from "./model-policy";
import { getModelCapabilities, type ModelTokenParamName } from "./model-catalog";

export type ResponsesApiParamInput = {
  maxOutputTokens?: number;
  temperature?: number;
  topP?: number;
  reasoningLevel?: ReasoningLevel;
};

export type SanitizedResponsesApiParams = {
  max_output_tokens?: number;
  max_tokens?: number;
  temperature?: number;
  top_p?: number;
  reasoning?: { effort: "low" | "medium" | "high" };
};

function mapReasoningLevel(
  level: ReasoningLevel | undefined,
): SanitizedResponsesApiParams["reasoning"] | undefined {
  if (!level || level === "none") return undefined;
  return { effort: level };
}

/** Strip unsupported OpenAI Responses API params for the target model. */
export function sanitizeResponsesApiParams(
  model: string,
  params: ResponsesApiParamInput,
): SanitizedResponsesApiParams {
  const capabilities = getModelCapabilities(model);
  const sanitized: SanitizedResponsesApiParams = {};

  if (params.maxOutputTokens !== undefined) {
    const tokenKey: ModelTokenParamName = capabilities.tokenParamName;
    if (tokenKey === "max_output_tokens") {
      sanitized.max_output_tokens = params.maxOutputTokens;
    } else {
      sanitized.max_tokens = params.maxOutputTokens;
    }
  }

  if (capabilities.supportsTemperature && params.temperature !== undefined) {
    sanitized.temperature = params.temperature;
  }

  if (capabilities.supportsTopP && params.topP !== undefined) {
    sanitized.top_p = params.topP;
  }

  if (capabilities.supportsReasoning) {
    const reasoning = mapReasoningLevel(params.reasoningLevel);
    if (reasoning) {
      sanitized.reasoning = reasoning;
    }
  }

  return sanitized;
}
