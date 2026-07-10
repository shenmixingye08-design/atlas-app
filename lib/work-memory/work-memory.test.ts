import { describe, expect, it } from "vitest";

import {
  createWorkMemory,
  confirmWorkMemoryCandidate,
  createWorkMemoryCandidate,
  getWorkMemoriesForAssignment,
  isWorkMemoryEnabled,
  learnFromCorrectionDiff,
  learnFromOrchestrationWorkMemory,
  listWorkMemories,
  resetWorkMemories,
  setWorkMemoryEnabled,
} from "./service";
import { formatWorkMemoriesForPlanner } from "./metadata";
import { containsSensitiveContent, sanitizeMemoryText } from "./security";
import { extractCorrectionInsights } from "./learning";

describe("work memory", () => {
  const userA = "user_work_memory_a";
  const userB = "user_work_memory_b";

  it("creates and lists user-scoped memories", () => {
    createWorkMemory(userA, {
      type: "workflow",
      title: "営業資料の進め方",
      summary: "16:9 · 青ベース · 3章構成",
      isUserConfirmed: true,
    });

    const list = listWorkMemories(userA);
    expect(list.memories.length).toBeGreaterThan(0);
    expect(listWorkMemories(userB).memories.length).toBe(0);
  });

  it("does not mix memories between users", () => {
    createWorkMemory(userA, {
      type: "preference",
      title: "文体A",
      summary: "丁寧語",
      isUserConfirmed: true,
    });
    createWorkMemory(userB, {
      type: "preference",
      title: "文体B",
      summary: "カジュアル",
      isUserConfirmed: true,
    });

    const forA = getWorkMemoriesForAssignment(userA, "文章を作成");
    expect(forA.every((m) => m.userId === userA)).toBe(true);
    expect(forA.some((m) => m.title === "文体B")).toBe(false);
  });

  it("ranks relevant memories for assignment", () => {
    createWorkMemory(userA, {
      type: "template",
      title: "SNS投稿テンプレ",
      summary: "朝8時 · ハッシュタグ3つ",
      tags: ["sns"],
      isUserConfirmed: true,
    });

    const relevant = getWorkMemoriesForAssignment(userA, "SNS投稿を作成");
    expect(relevant.some((m) => m.type === "template")).toBe(true);
  });

  it("respects enabled setting", () => {
    setWorkMemoryEnabled(userA, false);
    expect(isWorkMemoryEnabled(userA)).toBe(false);
    expect(getWorkMemoriesForAssignment(userA, "SNS投稿")).toEqual([]);
    setWorkMemoryEnabled(userA, true);
  });

  it("formats planner injection context", () => {
    const memory = createWorkMemory(userA, {
      type: "workflow",
      title: "手順",
      summary: "構成案 → 本文 → 校正",
      isUserConfirmed: true,
    });
    expect(memory).not.toBeNull();

    const formatted = formatWorkMemoriesForPlanner(listWorkMemories(userA).memories);
    expect(formatted).toContain("Work Memory");
    expect(formatted).toContain("手順");
  });

  it("blocks sensitive content", () => {
    expect(containsSensitiveContent("password: secret123")).toBe(true);
    expect(sanitizeMemoryText("password: secret123")).toBeNull();
  });

  it("creates correction learning candidate", () => {
    const candidate = learnFromCorrectionDiff({
      userId: userA,
      before: "了解です！いい感じですね！",
      after: "かしこまりました。ご確認をお願いいたします。",
    });
    expect(candidate).not.toBeNull();
    expect(candidate?.type).toBe("correction");
  });

  it("extracts correction insights without overfitting single edit", () => {
    const insights = extractCorrectionInsights(
      "了解です！",
      "かしこまりました。",
    );
    expect(insights?.toneHints.length).toBeGreaterThan(0);
    expect(insights?.preferredExpressions.length).toBeGreaterThan(0);
  });

  it("creates candidates from orchestration learning", () => {
    const user = "user_work_memory_learning";
    resetWorkMemories(user);

    learnFromOrchestrationWorkMemory({
      userId: user,
      assignment: "次からも同じ形式で営業資料を作成",
      deliverableType: "sales_material",
      finalResponse: "営業資料を作成しました。",
    });

    const list = listWorkMemories(user);
    expect(list.candidates.length + list.memories.length).toBeGreaterThan(0);
  });

  it("confirms candidate into memory", () => {
    const user = "user_work_memory_confirm";
    resetWorkMemories(user);

    const candidate = createWorkMemoryCandidate(user, {
      trigger: "explicit_save",
      type: "template",
      title: "テンプレート候補",
      summary: "A4 · 表紙あり",
      structuredData: { format: "a4" },
      sourceType: "user_explicit",
      confidence: 0.8,
      reason: "テスト",
    });
    expect(candidate).not.toBeNull();

    const confirmed = confirmWorkMemoryCandidate(user, candidate!.candidateId);
    expect(confirmed?.isUserConfirmed).toBe(true);
    expect(listWorkMemories(user).candidates.length).toBe(0);
  });
});
