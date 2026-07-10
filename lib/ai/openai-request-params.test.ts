import { describe, expect, it } from "vitest";

import { getModelCapabilities } from "@/lib/ai/model-catalog";
import { sanitizeResponsesApiParams } from "@/lib/ai/openai-request-params";
import { resolvePlannerPolicy, resolveWorkerPolicy } from "@/lib/ai/policy-engine";

describe("OpenAI request param sanitization", () => {
  it("documents gpt-5-mini capability metadata", () => {
    const caps = getModelCapabilities("gpt-5-mini");
    expect(caps.supportsTemperature).toBe(false);
    expect(caps.supportsReasoning).toBe(true);
    expect(caps.tokenParamName).toBe("max_output_tokens");
  });

  it("planner call with gpt-5-mini omits temperature", () => {
    const decision = resolvePlannerPolicy({
      assignment: "建設会社へ太陽光発電の営業メールを作成してください。",
      deliverableType: "email",
    });
    expect(decision.model).toBe("gpt-5-mini");

    const sanitized = sanitizeResponsesApiParams(decision.model, {
      maxOutputTokens: decision.maxOutputTokens,
      temperature: decision.temperature,
      reasoningLevel: decision.reasoningLevel,
    });

    expect(sanitized.temperature).toBeUndefined();
    expect(Object.hasOwn(sanitized, "temperature")).toBe(false);
    expect(sanitized.max_output_tokens).toBe(decision.maxOutputTokens);
    expect(sanitized.reasoning).toEqual({ effort: "low" });
  });

  it("light worker call with gpt-5-mini omits temperature and top_p", () => {
    const decision = resolveWorkerPolicy({ deliverableType: "email" });
    expect(decision.model).toBe("gpt-5-mini");

    const sanitized = sanitizeResponsesApiParams(decision.model, {
      maxOutputTokens: decision.maxOutputTokens,
      temperature: decision.temperature,
      topP: 0.9,
      reasoningLevel: decision.reasoningLevel,
    });

    expect(sanitized.temperature).toBeUndefined();
    expect(sanitized.top_p).toBeUndefined();
  });

  it("uses max_output_tokens for gpt-5 family models", () => {
    const sanitized = sanitizeResponsesApiParams("gpt-5.5", {
      maxOutputTokens: 4096,
      temperature: 0.7,
      reasoningLevel: "medium",
    });

    expect(sanitized.max_output_tokens).toBe(4096);
    expect(sanitized.max_tokens).toBeUndefined();
    expect(sanitized.temperature).toBeUndefined();
    expect(sanitized.reasoning).toEqual({ effort: "medium" });
  });
});
