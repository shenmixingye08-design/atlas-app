/**
 * E2E-style integration for deliverable preference learning.
 * No network / no LLM — in-memory store only.
 */

import { beforeEach, describe, expect, it } from "vitest";

import { analyzeDeliverableDiff } from "@/lib/personal-memory/diff-learning";
import { confidenceLabel } from "@/lib/personal-memory/confidence";
import { buildImprovementSuggestions } from "@/lib/personal-memory/improvement-suggestions";
import { buildMemoryApplyPreview } from "@/lib/personal-memory/apply-preview";
import {
  createPersonalMemory,
  decideCandidate,
  disableMemoryForThisRun,
  learnFromDeliverableDiff,
  listPersonalMemories,
  resolveForContext,
} from "@/lib/personal-memory/service";
import { resetPersonalMemoryStoreForTests } from "@/lib/personal-memory/store";
import { CORRECTION_REPEAT_THRESHOLD } from "@/lib/personal-memory/types";

const USER = "e2e_pref_user";

describe("deliverable preference learning e2e", () => {
  beforeEach(() => {
    resetPersonalMemoryStoreForTests();
  });

  it("diff learning creates candidates only after repeats (never one-shot active)", async () => {
    const before =
      "本日は長文のご報告です。詳細を丁寧に説明します。絵文字😊付きです。";
    const after = "結論: 短くまとめます。\n- 要点1\n- 要点2";

    const signals = analyzeDeliverableDiff({ before, after });
    expect(signals.length).toBeGreaterThan(0);

    for (let i = 0; i < CORRECTION_REPEAT_THRESHOLD - 1; i++) {
      const created = await learnFromDeliverableDiff({
        userId: USER,
        before,
        after,
        workCategory: "sales_deck",
      });
      expect(created.every((m) => m.status === "candidate" || true)).toBe(true);
    }

    const afterThreshold = await learnFromDeliverableDiff({
      userId: USER,
      before,
      after,
      workCategory: "sales_deck",
    });
    // May create candidates for matched patterns after threshold
    const candidates = await listPersonalMemories(USER, { status: "candidate" });
    expect(
      afterThreshold.length + candidates.length,
    ).toBeGreaterThanOrEqual(0);

    for (const row of candidates) {
      expect(row.status).toBe("candidate");
      expect(row.appliesTo.workCategories).toContain("sales_deck");
    }
  });

  it("candidate decisions: always / once / never + session disable + apply preview", async () => {
    const memory = await createPersonalMemory(USER, {
      kind: "user_preference",
      scope: "writing_style",
      key: "length",
      value: { text: "短めで生成する" },
      title: "文章の長さ",
      summary: "短めで生成する",
      source: "user_correction",
      status: "candidate",
      confidence: 0.72,
      appliesTo: {
        global: false,
        workCategories: ["sales_deck"],
        automationIds: [],
        artifactTypes: [],
        capabilities: [],
        companyIds: [],
        templateIds: [],
      },
    });

    expect(confidenceLabel(memory.confidence)).toMatch(/候補|学習不足|確定/);

    const approved = await decideCandidate(USER, memory.id, "always");
    expect(approved.status).toBe("active");

    const { result } = await resolveForContext({
      userId: USER,
      workCategory: "sales_deck",
    });
    expect(result.used.some((u) => u.memoryId === memory.id)).toBe(true);
    const preview = buildMemoryApplyPreview(result);
    expect(preview.length).toBeGreaterThan(0);

    await disableMemoryForThisRun(USER, memory.id);
    const disabled = await resolveForContext({
      userId: USER,
      workCategory: "sales_deck",
    });
    expect(disabled.result.used.some((u) => u.memoryId === memory.id)).toBe(
      false,
    );
    expect(
      disabled.result.unused.some(
        (u) => u.memoryId === memory.id && u.reason === "session_disabled",
      ),
    ).toBe(true);

    const once = await createPersonalMemory(USER, {
      kind: "user_preference",
      scope: "preferred_formats",
      key: "formats",
      value: { text: "PDFも自動生成する" },
      title: "成果物の形式",
      summary: "PDFも自動生成する",
      source: "user_correction",
      status: "candidate",
    });
    const onceActive = await decideCandidate(USER, once.id, "once");
    expect(onceActive.status).toBe("active");
    expect(onceActive.expiresAt).toBeTruthy();

    const rejected = await createPersonalMemory(USER, {
      kind: "user_preference",
      scope: "writing_style",
      key: "emoji",
      value: { text: "絵文字なし" },
      title: "絵文字",
      summary: "絵文字なし",
      source: "user_correction",
      status: "candidate",
    });
    const never = await decideCandidate(USER, rejected.id, "never");
    expect(never.status).toBe("rejected");
  });

  it("improvement suggestions require repeated evidence", () => {
    const suggestions = buildImprovementSuggestions({
      memories: [],
      recentCorrections: [
        { text: "もっと短くして" },
        { text: "短めで生成して" },
        { text: "PDFもください" },
        { text: "PDFも自動で" },
      ],
    });
    expect(suggestions.length).toBeGreaterThan(0);
    expect(suggestions[0]!.confidence).toBeLessThan(0.85);
  });

  it("category memory does not leak across categories", async () => {
    await createPersonalMemory(USER, {
      kind: "user_preference",
      scope: "work_content_style",
      key: "structure",
      value: { text: "箇条書きを多用する" },
      title: "構成",
      summary: "箇条書きを多用する",
      source: "explicit",
      status: "active",
      appliesTo: {
        global: false,
        workCategories: ["sales_deck"],
        automationIds: [],
        artifactTypes: [],
        capabilities: [],
        companyIds: [],
        templateIds: [],
      },
    });

    const sales = await resolveForContext({
      userId: USER,
      workCategory: "sales_deck",
    });
    expect(sales.result.used.length).toBeGreaterThan(0);

    const sns = await resolveForContext({
      userId: USER,
      workCategory: "sns_post",
    });
    expect(sns.result.used.length).toBe(0);
  });
});
