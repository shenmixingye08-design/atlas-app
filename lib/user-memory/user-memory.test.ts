import { describe, expect, it } from "vitest";

import {
  createUserMemory,
  getMemoriesForAssignment,
  learnFromOrchestration,
  listUserMemories,
  resetUserMemories,
  toggleUserMemoryPin,
} from "./service";
import { formatMemoriesForPlanner } from "./metadata";
import { buildMemorySuggestions } from "./suggestions";

describe("user memory", () => {
  const userId = "user_test_memory";

  it("creates and lists memories", () => {
    createUserMemory(userId, {
      category: "sales",
      title: "営業資料レイアウト",
      content: "青ベース · 16:9",
      confidence: 0.8,
    });

    const result = listUserMemories(userId);
    expect(result.memories.length).toBeGreaterThan(0);
    expect(result.sections.recent.length).toBeGreaterThan(0);
  });

  it("prioritizes relevant memories for assignment", () => {
    createUserMemory(userId, {
      category: "sns",
      title: "投稿時間",
      content: "朝8時",
      confidence: 0.7,
    });

    const relevant = getMemoriesForAssignment(userId, "SNS投稿を作成");
    expect(relevant.some((m) => m.category === "sns")).toBe(true);
  });

  it("formats planner context and builds suggestions", () => {
    learnFromOrchestration({
      userId: "user_test_memory_2",
      assignment: "営業資料を作成",
      deliverableType: "sales_material",
    });

    const memories = listUserMemories("user_test_memory_2").memories;
    const formatted = formatMemoriesForPlanner(memories);
    expect(formatted).toContain("ATLAS Memory");

    const suggestions = buildMemorySuggestions(memories);
    expect(suggestions.length).toBeGreaterThan(0);
  });

  it("pins and resets memories", () => {
    const user = "user_test_memory_3";
    const memory = createUserMemory(user, {
      category: "email",
      title: "返信スタイル",
      content: "丁寧語",
    });

    const pinned = toggleUserMemoryPin(user, memory.memoryId);
    expect(pinned?.pinned).toBe(true);

    const deleted = resetUserMemories(user, "email");
    expect(deleted).toBeGreaterThanOrEqual(1);
  });
});
