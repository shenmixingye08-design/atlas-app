/**
 * Permanent CI guard: incomplete / max_output_tokens Responses must
 * fail closed with developerCode=output_token_limit — never complete
 * as a truncated deliverable.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

const createAtlasResponse = vi.hoisted(() => vi.fn());

vi.mock("@/lib/openai", () => ({
  createAtlasResponse,
  createAtlasResponseStream: vi.fn(),
}));

import { workerAgent } from "./worker";
import { runAgent } from "./runner";

describe("agent runner incomplete output (permanent)", () => {
  beforeEach(() => {
    createAtlasResponse.mockReset();
  });

  it("throws output_token_limit when Responses status is incomplete", async () => {
    createAtlasResponse.mockResolvedValue({
      id: "resp_incomplete",
      status: "incomplete",
      output_text: "途中まで書いた本文です",
      model: "gpt-test",
      incomplete_details: { reason: "max_output_tokens" },
    });

    await expect(
      runAgent(workerAgent, {
        task: "8000字のブログを書いて",
        aiTaskType: "worker_deliverable",
      }),
    ).rejects.toThrow(/output_token_limit|上限で途中終了/);
  });

  it("still fails empty output", async () => {
    createAtlasResponse.mockResolvedValue({
      id: "resp_empty",
      status: "completed",
      output_text: "   ",
      model: "gpt-test",
    });

    await expect(
      runAgent(workerAgent, { task: "空" }),
    ).rejects.toThrow(/AI応答が空/);
  });

  it("returns completed output when status is completed", async () => {
    createAtlasResponse.mockResolvedValue({
      id: "resp_ok",
      status: "completed",
      output_text: "完成した本文です。",
      model: "gpt-test",
    });

    const result = await runAgent(workerAgent, { task: "短文" });
    expect(result.outputText).toBe("完成した本文です。");
    expect(result.status).toBe("completed");
  });
});
