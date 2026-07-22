import "server-only";

import OpenAI from "openai";
import type {
  Response,
  ResponseCreateParamsNonStreaming,
  ResponseCreateParamsStreaming,
  ResponseInput,
  ResponseStreamEvent,
} from "openai/resources/responses/responses";

import type { Stream } from "openai/streaming";

import type { AiTaskType } from "@/lib/ai/model-policy";
import {
  decisionToModelPolicy,
  resolveTaskPolicy,
  type AiPolicyDecision,
} from "@/lib/ai/policy-engine";
import { sanitizeResponsesApiParams } from "@/lib/ai/openai-request-params";
import { isMockLlmEnabled, resolveMockLlmOutput } from "@/lib/ai/mock-responses";
import { summarizeInputAsText } from "@/lib/attachments/to-response-input";
import { getAiBillingUsageContext } from "@/lib/billing/usage/request-context";
import { recordUserAiUsageFromTexts } from "@/lib/billing/usage/meter";

/** @deprecated Use resolveTaskPolicy('chat').model — kept for chat backward compatibility. */
export const ATLAS_MODEL = decisionToModelPolicy(resolveTaskPolicy("chat")).model;

import { ATLAS_CHAT_INSTRUCTIONS } from "@/lib/atlas-personality";

/** Base system instructions for chat and default Responses API calls. */
export const DEFAULT_INSTRUCTIONS = ATLAS_CHAT_INSTRUCTIONS;

let client: OpenAI | null = null;

function getApiKey(): string {
  const apiKey = process.env.OPENAI_API_KEY;

  if (!apiKey?.trim()) {
    throw new Error("OPENAI_API_KEY is not configured");
  }

  return apiKey;
}

/** Returns whether the OpenAI API key is present (for startup checks). */
export function isOpenAIConfigured(): boolean {
  return Boolean(process.env.OPENAI_API_KEY?.trim());
}

/**
 * Returns a singleton OpenAI client.
 * Must only be imported from server-side code (API routes, server actions).
 */
export function getOpenAIClient(): OpenAI {
  if (!client) {
    client = new OpenAI({ apiKey: getApiKey(), maxRetries: 0 });
  }

  return client;
}

export type AtlasResponseRequest = {
  /**
   * User message or multimodal Responses API input.
   * Use `ResponseInput` with `input_image` parts when images are attached.
   */
  input: string | ResponseInput;
  /** Optional system-level instructions for this request. */
  instructions?: string;
  /** Continue a prior Responses API conversation. */
  previousResponseId?: string;
  /** Route to model policy when set. */
  aiTaskType?: AiTaskType;
  /** Override model (used by chat when no task type). */
  model?: string;
  maxOutputTokens?: number;
  temperature?: number;
};

function resolveRequestParams(params: AtlasResponseRequest): {
  model: string;
  max_output_tokens?: number;
  temperature?: number;
  reasoningLevel?: AiPolicyDecision["reasoningLevel"];
} {
  if (params.aiTaskType) {
    const decision = resolveTaskPolicy(params.aiTaskType);
    return {
      model: decision.model,
      max_output_tokens: decision.maxOutputTokens,
      temperature: decision.temperature,
      reasoningLevel: decision.reasoningLevel,
    };
  }

  const chatDecision = resolveTaskPolicy("chat");
  return {
    model: params.model ?? chatDecision.model,
    ...(params.maxOutputTokens !== undefined && {
      max_output_tokens: params.maxOutputTokens,
    }),
    ...(params.temperature !== undefined && { temperature: params.temperature }),
    reasoningLevel: chatDecision.reasoningLevel,
  };
}

function buildResponseCreateParams(
  params: AtlasResponseRequest,
  stream: boolean,
): ResponseCreateParamsNonStreaming | ResponseCreateParamsStreaming {
  const { input, instructions, previousResponseId } = params;
  const resolved = resolveRequestParams(params);
  const sanitized = sanitizeResponsesApiParams(resolved.model, {
    maxOutputTokens: resolved.max_output_tokens,
    temperature: resolved.temperature,
    reasoningLevel: resolved.reasoningLevel,
  });

  return {
    model: resolved.model,
    input,
    instructions: instructions ?? DEFAULT_INSTRUCTIONS,
    ...(previousResponseId && { previous_response_id: previousResponseId }),
    ...sanitized,
    stream,
  } as ResponseCreateParamsNonStreaming | ResponseCreateParamsStreaming;
}

function buildNonStreamingParams(
  params: AtlasResponseRequest,
): ResponseCreateParamsNonStreaming {
  return buildResponseCreateParams(params, false) as ResponseCreateParamsNonStreaming;
}

function buildStreamingParams(
  params: AtlasResponseRequest,
): ResponseCreateParamsStreaming {
  return buildResponseCreateParams(params, true) as ResponseCreateParamsStreaming;
}

function maybeRecordBillingUsage(input: {
  params: AtlasResponseRequest;
  model: string;
  outputText: string;
}): void {
  const context = getAiBillingUsageContext();
  if (!context || context.suppressAutoRecord) return;

  try {
    recordUserAiUsageFromTexts({
      userId: context.userId,
      api: context.api,
      feature: context.feature,
      model: input.model,
      inputText: summarizeInputAsText(input.params.input),
      outputText: input.outputText,
      instructions: input.params.instructions,
      aiTaskType: input.params.aiTaskType,
    });
  } catch (error) {
    console.error("[billing] Failed to record AI usage:", error);
  }
}

/** Creates a non-streaming response via the OpenAI Responses API. */
export async function createAtlasResponse(
  params: AtlasResponseRequest,
): Promise<Response> {
  if (isMockLlmEnabled()) {
    const outputText = resolveMockLlmOutput(
      params.aiTaskType,
      summarizeInputAsText(params.input),
    );
    const mock = {
      id: `resp_mock_${params.aiTaskType ?? "chat"}_${crypto.randomUUID()}`,
      output_text: outputText,
      status: "completed",
      model: "atlas-mock",
    } as Response;
    maybeRecordBillingUsage({
      params,
      model: mock.model ?? "atlas-mock",
      outputText,
    });
    return mock;
  }

  const response = await getOpenAIClient().responses.create(
    buildNonStreamingParams(params),
  );
  maybeRecordBillingUsage({
    params,
    model: response.model ?? resolveRequestParams(params).model,
    outputText: response.output_text ?? "",
  });
  return response;
}

/** Creates a streaming response via the OpenAI Responses API. */
export async function createAtlasResponseStream(
  params: AtlasResponseRequest,
): Promise<Stream<ResponseStreamEvent>> {
  if (isMockLlmEnabled()) {
    throw new Error("Streaming is disabled while ATLAS_MOCK_LLM=true");
  }

  // Count the stream request up front (output tokens unknown until completion).
  maybeRecordBillingUsage({
    params,
    model: resolveRequestParams(params).model,
    outputText: "",
  });

  return getOpenAIClient().responses.create(buildStreamingParams(params));
}
