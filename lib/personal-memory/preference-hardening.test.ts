import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));
vi.mock("@/lib/persistence/durable-domain", () => ({
  persistDurableDomain: vi.fn(async () => "supabase"),
  loadDurableDomain: vi.fn(async () => null),
}));

import { measureEditDiff, shouldProposeEditCandidate } from "./edit-diff";
import {
  EMPTY_STRUCTURED_PREFERENCES,
  mergeStructuredPreferences,
  readStructuredPreferences,
} from "./preference-catalog";
import { containsSensitiveFacts, detectSensitiveFacts } from "./sensitive-facts";
import { resetPersonalMemoryDurableForTests } from "./durable";
import { resetPersonalMemoryStoreForTests } from "./store";
import {
  approveCandidate,
  createPersonalMemory,
  ingestCorrectionSignal,
  ingestEditDiffAsCandidate,
  resolveForContext,
} from "./service";

const USER = "user_pref_harden";

beforeEach(() => {
  resetPersonalMemoryStoreForTests();
  resetPersonalMemoryDurableForTests();
});

describe("preference catalog and hardening", () => {
  it("merges layers with explicit instruction winning", () => {
    const { merged, overridden } = mergeStructuredPreferences([
      { ...EMPTY_STRUCTURED_PREFERENCES, tone: "casual", length: "long" },
      { tone: "polite" },
    ]);
    expect(merged.tone).toBe("polite");
    expect(merged.length).toBe("long");
    expect(overridden).toContain("tone");
  });

  it("never clears forbidden words from a newer empty layer", () => {
    const { merged, excluded } = mergeStructuredPreferences([
      { forbiddenWords: ["煽り"] },
      { forbiddenWords: [] },
    ]);
    expect(merged.forbiddenWords).toEqual(["煽り"]);
    expect(excluded).toContain("forbiddenWords");
  });

  it("unions forbidden words across layers", () => {
    const { merged } = mergeStructuredPreferences([
      { forbiddenWords: ["煽り"] },
      { forbiddenWords: ["絶対"] },
    ]);
    expect(merged.forbiddenWords).toEqual(["煽り", "絶対"]);
  });

  it("reads structured fields from memory value", () => {
    const prefs = readStructuredPreferences({
      tone: "polite",
      emoji: "none",
      hashtagsMax: 2,
      forbiddenExpressions: ["煽り"],
    });
    expect(prefs.tone).toBe("polite");
    expect(prefs.emoji).toBe("none");
    expect(prefs.hashtagsMax).toBe(2);
    expect(prefs.forbiddenWords).toEqual(["煽り"]);
  });

  it("measures edit diff metrics", () => {
    const metrics = measureEditDiff(
      "今日も頑張ろう✨ #営業",
      "本日もご確認ください。",
    );
    expect(metrics.deletedChars).toBeGreaterThan(0);
    expect(metrics.diffRate).toBeGreaterThan(0);
    expect(metrics.hashtagsChanged).toBe(true);
    expect(metrics.emojiChanged).toBe(true);
  });

  it("does not treat a tiny one-off edit as a strong preference", () => {
    const metrics = measureEditDiff("こんにちは。", "こんにちは");
    const proposal = shouldProposeEditCandidate({ metrics, repeatCount: 1 });
    expect(proposal.propose).toBe(false);
  });

  it("raises confidence after repeated edits", () => {
    const metrics = measureEditDiff(
      "長文の説明です。さらに続きます。",
      "短く。",
    );
    const proposal = shouldProposeEditCandidate({ metrics, repeatCount: 3 });
    expect(proposal.propose).toBe(true);
    expect(proposal.confidence).toBeGreaterThan(0.6);
  });

  it("detects sensitive facts that must not auto-confirm", () => {
    expect(containsSensitiveFacts("売上高は1億円です")).toBe(true);
    expect(detectSensitiveFacts("東京都千代田区1-1-1")).toContain("address");
    expect(containsSensitiveFacts("短めの丁寧な文体")).toBe(false);
  });

  it("keeps company facts as candidates", async () => {
    const created = await ingestCorrectionSignal({
      userId: USER,
      text: "今後は会社実績として導入社数120社と覚えて",
      source: "user_explicit",
    });
    expect(created).toBeTruthy();
    expect(created?.status).toBe("candidate");
  });

  it("applies automation-specific memory over global", async () => {
    await createPersonalMemory(USER, {
      kind: "user_preference",
      scope: "writing_style",
      key: "tone",
      value: { text: "global-casual", tone: "casual" },
      title: "全体",
      summary: "カジュアル",
      source: "explicit",
      status: "active",
      appliesTo: { global: true, automationIds: [], artifactTypes: [], capabilities: [] },
    });
    await createPersonalMemory(USER, {
      kind: "user_preference",
      scope: "writing_style",
      key: "tone",
      value: { text: "job-polite", tone: "polite" },
      title: "自動化",
      summary: "丁寧",
      source: "explicit",
      status: "active",
      appliesTo: {
        global: false,
        automationIds: ["job_1"],
        artifactTypes: ["x_post"],
        capabilities: [],
      },
    });
    const { result } = await resolveForContext({
      userId: USER,
      automationId: "job_1",
      artifactTypes: ["x_post"],
      allowedScopes: ["writing_style"],
    });
    expect(result.used.some((row) => row.summary === "丁寧")).toBe(true);
  });

  it("does not apply deleted or superseded memory", async () => {
    const keep = await createPersonalMemory(USER, {
      kind: "user_preference",
      scope: "writing_style",
      key: "tone",
      value: { text: "new", tone: "polite" },
      title: "新しい",
      summary: "新しい",
      source: "explicit",
      status: "active",
    });
    await createPersonalMemory(USER, {
      kind: "user_preference",
      scope: "writing_style",
      key: "tone",
      value: { text: "old", tone: "casual" },
      title: "古い",
      summary: "古い",
      source: "explicit",
      status: "superseded",
    });
    await createPersonalMemory(USER, {
      kind: "user_preference",
      scope: "writing_style",
      key: "tone",
      value: { text: "gone" },
      title: "削除",
      summary: "削除",
      source: "explicit",
      status: "deleted",
    });
    const { result } = await resolveForContext({
      userId: USER,
      allowedScopes: ["writing_style"],
    });
    expect(result.used.some((row) => row.memoryId === keep.id)).toBe(true);
    expect(result.used.some((row) => row.summary === "古い")).toBe(false);
    expect(result.used.some((row) => row.summary === "削除")).toBe(false);
  });

  it("does not mix users", async () => {
    await createPersonalMemory(USER, {
      kind: "user_preference",
      scope: "writing_style",
      key: "tone",
      value: { text: "mine" },
      title: "mine",
      summary: "mine",
      source: "explicit",
      status: "active",
    });
    const { result } = await resolveForContext({
      userId: "other_user",
      allowedScopes: ["writing_style"],
    });
    expect(result.used).toHaveLength(0);
  });

  it("creates a candidate from a user edit without auto-confirming money", async () => {
    const created = await ingestEditDiffAsCandidate({
      userId: USER,
      before: "今月の成果です。",
      after: "今月の成果は売上高300万円です。",
      artifactType: "x_post",
    });
    expect(created).toBeTruthy();
    expect(created?.status).toBe("candidate");
  });

  it("confirm then deleted memory is excluded from apply", async () => {
    const candidate = await createPersonalMemory(USER, {
      kind: "user_preference",
      scope: "writing_style",
      key: "emoji",
      value: { emoji: "none", text: "絵文字なし" },
      title: "絵文字",
      summary: "絵文字なし",
      source: "user_correction",
      status: "candidate",
    });
    const approved = await approveCandidate(USER, candidate.id);
    expect(approved.status).toBe("active");
    const { deletePersonalMemory } = await import("./service");
    await deletePersonalMemory(USER, approved.id);
    const { result } = await resolveForContext({
      userId: USER,
      allowedScopes: ["writing_style"],
    });
    expect(result.used.some((row) => row.memoryId === approved.id)).toBe(false);
  });
});
