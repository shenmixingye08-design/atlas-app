import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));
vi.mock("@/lib/persistence/durable-domain", () => ({
  persistDurableDomain: vi.fn(async () => "supabase"),
  loadDurableDomain: vi.fn(async () => null),
}));

import { resetPersonalMemoryDurableForTests } from "@/lib/personal-memory/durable";
import {
  createPersonalMemory,
  resolveForContext,
} from "@/lib/personal-memory/service";
import { resetPersonalMemoryStoreForTests } from "@/lib/personal-memory/store";
import { applyMemoryToDedicatedAutoPost } from "@/lib/integrations/x/post/autopost-memory";
import { applyMemoryForRegenerate } from "@/lib/memory-apply/regenerate";
import {
  getMemoryQualityIndicators,
  recordMemoryQualityEvent,
  resetMemoryQualityMetricsForTests,
} from "@/lib/memory-apply/quality-metrics";
import { resolveGenerationMemory } from "@/lib/memory-apply/resolve-preference";

const USER = "user_resolve_pref";

beforeEach(() => {
  resetPersonalMemoryStoreForTests();
  resetPersonalMemoryDurableForTests();
  resetMemoryQualityMetricsForTests();
});

describe("unified generation memory resolve", () => {
  it("applies the same X preference to regular and batch channels", async () => {
    await createPersonalMemory(USER, {
      kind: "user_preference",
      scope: "writing_style",
      key: "writing_preference",
      value: { tone: "polite", emoji: "none", length: "short", channel: "x_post" },
      title: "X文体",
      summary: "短く丁寧、絵文字なし",
      source: "explicit",
      status: "active",
      appliesTo: {
        global: false,
        automationIds: [],
        artifactTypes: ["x_post"],
        capabilities: ["x_post"],
      },
    });

    const single = await resolveGenerationMemory({
      userId: USER,
      channel: "x_post",
    });
    const batch = await resolveGenerationMemory({
      userId: USER,
      channel: "x_post_batch",
    });
    const regen = await resolveGenerationMemory({
      userId: USER,
      channel: "x_post_regenerate",
    });

    expect(single.applied).toBe(true);
    expect(batch.applied).toBe(true);
    expect(regen.applied).toBe(true);
    expect(single.xPreference.emoji).toBe("none");
    expect(batch.xPreference.emoji).toBe(single.xPreference.emoji);
    expect(single.memoryIds).toEqual(batch.memoryIds);
  });

  it("does not claim applied when resolve fails", async () => {
    const { resolveForContext: realResolve } = await import(
      "@/lib/personal-memory/service"
    );
    vi.spyOn(
      await import("@/lib/personal-memory/service"),
      "resolveForContext",
    ).mockRejectedValueOnce(new Error("hydrate failed"));
    const resolved = await resolveGenerationMemory({
      userId: USER,
      channel: "x_post",
    });
    expect(resolved.memoryFailed).toBe(true);
    expect(resolved.applied).toBe(false);
    expect(realResolve).toBeTruthy();
  });

  it("applies memory to dedicated X auto-post", async () => {
    await createPersonalMemory(USER, {
      kind: "user_preference",
      scope: "writing_style",
      key: "writing_preference",
      value: { tone: "polite", emoji: "none", channel: "x_post" },
      title: "X",
      summary: "丁寧",
      source: "explicit",
      status: "active",
      appliesTo: {
        global: false,
        automationIds: [],
        artifactTypes: ["x_post"],
        capabilities: [],
      },
    });
    const applied = await applyMemoryToDedicatedAutoPost({
      userId: USER,
      settings: {
        userId: USER,
        enabled: true,
        mode: "approval",
        purpose: "告知",
        tone: "",
        audience: "",
        themes: [],
        includeHashtags: true,
        frequency: "daily_1",
        daysOfWeek: [],
        postTimes: ["09:00"],
        timezone: "Asia/Tokyo",
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      },
    });
    expect(applied.memoryFailed).toBe(false);
    expect(applied.applied).toBe(true);
  });

  it("applies memory to regenerate", async () => {
    await createPersonalMemory(USER, {
      kind: "user_preference",
      scope: "writing_style",
      key: "writing_preference",
      value: { length: "short", structure: "bullets", text: "短め箇条書き" },
      title: "短め",
      summary: "短め箇条書き",
      source: "explicit",
      status: "active",
    });
    const result = await applyMemoryForRegenerate({
      userId: USER,
      previousContent: "結論。背景の説明が続きます。詳細もあります。",
    });
    expect(result.applied).toBe(true);
    expect(result.memoryIdsUsed.length).toBeGreaterThan(0);
  });

  it("records quality indicators without throwing", () => {
    recordMemoryQualityEvent({
      userId: USER,
      type: "memory_applied",
      channel: "x_post",
      memoryApplied: true,
    });
    recordMemoryQualityEvent({
      userId: USER,
      type: "generation_edited",
      channel: "x_post",
      diffRate: 0.2,
      editChars: 12,
      memoryApplied: true,
    });
    recordMemoryQualityEvent({
      userId: USER,
      type: "candidate_confirmed",
      channel: "personal_memory",
    });
    const snapshot = getMemoryQualityIndicators(USER);
    expect(snapshot.applyRate).toBeGreaterThan(0);
    expect(snapshot.editRate).toBeGreaterThan(0);
    expect(snapshot.candidateConfirmRate).toBe(1);
  });

  it("automation resolve uses the same personal memory store", async () => {
    await createPersonalMemory(USER, {
      kind: "automation_preference",
      scope: "approval_preferences",
      key: "mode",
      value: { approval: "approve_then_run" },
      title: "承認",
      summary: "確認してから実行",
      source: "explicit",
      status: "active",
      appliesTo: {
        global: false,
        automationIds: ["auto_x"],
        artifactTypes: [],
        capabilities: [],
      },
    });
    const { result } = await resolveForContext({
      userId: USER,
      automationId: "auto_x",
      allowedScopes: ["approval_preferences"],
    });
    expect(result.used.some((row) => row.summary === "確認してから実行")).toBe(true);
  });
});
