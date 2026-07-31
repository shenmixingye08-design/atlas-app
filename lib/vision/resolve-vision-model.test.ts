import { afterEach, describe, expect, it } from "vitest";

import {
  DEFAULT_VISION_MODEL,
  isAllowedVisionModel,
  resolveVisionFallbackModel,
  resolveVisionModel,
} from "@/lib/vision/resolve-vision-model";

describe("resolveVisionModel", () => {
  afterEach(() => {
    delete process.env.OPENAI_VISION_MODEL;
  });

  it("defaults to vision-capable model", () => {
    expect(resolveVisionModel()).toBe(DEFAULT_VISION_MODEL);
    expect(isAllowedVisionModel(DEFAULT_VISION_MODEL)).toBe(true);
  });

  it("accepts OPENAI_VISION_MODEL when allowlisted", () => {
    process.env.OPENAI_VISION_MODEL = "gpt-4o-mini";
    expect(resolveVisionModel()).toBe("gpt-4o-mini");
  });

  it("rejects non-vision / unknown model env and falls back", () => {
    process.env.OPENAI_VISION_MODEL = "text-embedding-3-large";
    expect(resolveVisionModel()).toBe(DEFAULT_VISION_MODEL);
    process.env.OPENAI_VISION_MODEL = "totally-fake-model";
    expect(resolveVisionModel()).toBe(DEFAULT_VISION_MODEL);
  });

  it("switches to fallback model on later attempts", () => {
    expect(resolveVisionFallbackModel("gpt-5.5", 1)).toBe("gpt-5.5");
    expect(resolveVisionFallbackModel("gpt-5.5", 3)).not.toBe("gpt-5.5");
  });
});
