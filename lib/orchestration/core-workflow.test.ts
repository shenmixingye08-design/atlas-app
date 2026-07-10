import { afterEach, describe, expect, it, vi } from "vitest";

import {
  canRenderCoreFinalOutput,
  classifyCoreDeliverableType,
  extractSocialPosts,
  validateCoreDeliverable,
} from "@/lib/orchestration/core-workflow";
import { deliverableHasContent } from "@/lib/orchestration/deliverable-types";
import { detectEmailSubject } from "@/lib/orchestration/email-deliverable";

const EMAIL_PROMPT =
  "建設会社へ太陽光発電の営業メールを作成してください。500文字程度。";
const SOCIAL_PROMPT = "ATLASのX投稿を5件作成してください。";
const SHORT_DOC_PROMPT = "ATLASのサービス紹介文を300文字で作成してください。";

describe("core workflow lockdown", () => {
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it("classifies the three core deliverable types", () => {
    expect(classifyCoreDeliverableType(EMAIL_PROMPT)).toBe("email");
    expect(classifyCoreDeliverableType(SOCIAL_PROMPT)).toBe("social_post");
    expect(classifyCoreDeliverableType(SHORT_DOC_PROMPT)).toBe("short_document");
  });

  it("runs all three core prompts end-to-end with ATLAS_CORE_TEST", async () => {
    vi.mock("server-only", () => ({}));
    vi.stubEnv("ATLAS_CORE_TEST", "true");
    vi.stubEnv("ATLAS_MOCK_LLM", "true");

    const { orchestrate } = await import("@/lib/orchestration/orchestrator");

    const emailResult = await orchestrate({ assignment: EMAIL_PROMPT });
    expect(emailResult.status).toBe("completed");
    expect(emailResult.approved).toBe(true);
    expect(emailResult.deliverable.type).toBe("email");
    expect(canRenderCoreFinalOutput(emailResult.deliverable)).toBe(true);
    expect(detectEmailSubject(emailResult.deliverable)).toBeTruthy();
    expect(emailResult.deliverable.content).toMatch(/件名|本文|お世話/i);
    expect(emailResult.research).toBeUndefined();
    expect(emailResult.isolationDebug?.cacheKey).toBe("core-disabled");

    const socialResult = await orchestrate({ assignment: SOCIAL_PROMPT });
    expect(socialResult.status).toBe("completed");
    expect(socialResult.approved).toBe(true);
    expect(socialResult.deliverable.type).toBe("social_post");
    const posts = extractSocialPosts(socialResult.deliverable);
    expect(posts.length).toBeGreaterThanOrEqual(3);
    expect(posts.length).toBeLessThanOrEqual(5);
    expect(validateCoreDeliverable(socialResult.deliverable).valid).toBe(true);

    const docResult = await orchestrate({ assignment: SHORT_DOC_PROMPT });
    expect(docResult.status).toBe("completed");
    expect(docResult.approved).toBe(true);
    expect(docResult.deliverable.type).toBe("short_document");
    expect(docResult.deliverable.title.trim()).toBeTruthy();
    expect(deliverableHasContent(docResult.deliverable)).toBe(true);
    expect(validateCoreDeliverable(docResult.deliverable).valid).toBe(true);
  });
});
