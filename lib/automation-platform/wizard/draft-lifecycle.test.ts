import { readFileSync } from "node:fs";
import { join } from "node:path";

import { afterEach, describe, expect, it, vi } from "vitest";

import { createEmptyWizardDraft, createStepFromCapability } from "@/lib/automation-platform/wizard/builders";
import {
  WIZARD_MISSING_DRAFT_MESSAGE,
  bootstrapWizardDraft,
  cleanupWizardDraftAfterCreate,
  inheritedStaleWizardFields,
  resolveWizardEntryIntent,
  shouldSuppressWizardAutosave,
  syncWizardDraftToUrl,
  wizardDraftUrl,
} from "@/lib/automation-platform/wizard/draft-lifecycle";
import type { AutomationWizardDraft } from "@/lib/automation-platform/wizard/types";

function staleDraft(overrides: Partial<AutomationWizardDraft> = {}): AutomationWizardDraft {
  return createEmptyWizardDraft({
    draftId: "draft-stale-a",
    name: "前回の売上まとめ",
    freeformNotes: "社長向けに短く。前回の備考。",
    naturalLanguageSeed: "毎週金曜に売上をまとめて",
    steps: [
      createStepFromCapability("excel_generate"),
      createStepFromCapability("powerpoint_generate"),
    ],
    triggerType: "schedule",
    frequency: "daily",
    hour: 9,
    minute: 15,
    daysOfWeek: [1],
    executionMode: "review_selected_steps",
    memoryEnabled: false,
    memoryAllowedScopes: [],
    memoryDeniedScopes: ["writing_style"],
    savedAt: "2026-08-01T00:00:00.000Z",
    ...overrides,
  });
}

function staleDraftB(): AutomationWizardDraft {
  return staleDraft({
    draftId: "draft-stale-b",
    name: "別の下書きB",
    freeformNotes: "Bの備考",
    frequency: "weekly",
  });
}

describe("wizard entry intent", () => {
  it("treats /automations/new without draft or seed as fresh", () => {
    expect(resolveWizardEntryIntent({})).toEqual({ kind: "fresh" });
    expect(
      resolveWizardEntryIntent({ draftId: "  ", seedText: "" }),
    ).toEqual({ kind: "fresh" });
  });

  it("resumes only when draft query is explicit", () => {
    expect(resolveWizardEntryIntent({ draftId: "draft-a" })).toEqual({
      kind: "resume",
      draftId: "draft-a",
    });
  });

  it("seeds even if a draft id is also present", () => {
    expect(
      resolveWizardEntryIntent({
        draftId: "draft-a",
        seedText: "X投稿を毎日",
      }),
    ).toEqual({ kind: "seed", seedText: "X投稿を毎日" });
  });
});

describe("new automation freshness", () => {
  it("TEST 1: /automations/new ignores a single old draft", () => {
    const stale = staleDraft();
    const result = bootstrapWizardDraft({
      intent: { kind: "fresh" },
      drafts: [stale],
    });
    expect(result.status).toBe("fresh");
    expect(result.draft.draftId).not.toBe(stale.draftId);
    expect(inheritedStaleWizardFields(result.draft, stale)).toEqual([]);
    expect(result.draft.name).toBe("");
    expect(result.draft.steps).toEqual([]);
    expect(result.draft.freeformNotes).toBe("");
  });

  it("TEST 2: /automations/new does not load drafts[0] when many exist", () => {
    const a = staleDraft();
    const b = staleDraftB();
    const result = bootstrapWizardDraft({
      intent: { kind: "fresh" },
      drafts: [a, b],
    });
    expect(result.status).toBe("fresh");
    expect(result.draft.draftId).not.toBe(a.draftId);
    expect(result.draft.draftId).not.toBe(b.draftId);
    expect(inheritedStaleWizardFields(result.draft, a)).toEqual([]);
    expect(inheritedStaleWizardFields(result.draft, b)).toEqual([]);
  });

  it("TEST 3: ?draft=A loads only A", () => {
    const a = staleDraft();
    const b = staleDraftB();
    const result = bootstrapWizardDraft({
      intent: { kind: "resume", draftId: "draft-stale-a" },
      drafts: [b, a],
    });
    expect(result.status).toBe("resumed");
    expect(result.draft).toBe(a);
    expect(result.draft.name).toBe("前回の売上まとめ");
  });

  it("TEST 4: missing draft A does not fall back to B", () => {
    const b = staleDraftB();
    const result = bootstrapWizardDraft({
      intent: { kind: "resume", draftId: "draft-stale-a" },
      drafts: [b],
    });
    expect(result.status).toBe("resume_missing");
    expect(result.missingDraftId).toBe("draft-stale-a");
    expect(result.message).toBe(WIZARD_MISSING_DRAFT_MESSAGE);
    expect(result.draft.draftId).not.toBe(b.draftId);
    expect(inheritedStaleWizardFields(result.draft, b)).toEqual([]);
  });

  it("TEST 5: ?seed=X投稿を毎日 ignores old drafts and proposes from seed", () => {
    const stale = staleDraft();
    const result = bootstrapWizardDraft({
      intent: { kind: "seed", seedText: "X投稿を毎日" },
      drafts: [stale],
    });
    expect(result.status).toBe("seeded");
    expect(result.draft.draftId).not.toBe(stale.draftId);
    expect(inheritedStaleWizardFields(result.draft, stale)).toEqual([]);
    expect(result.draft.naturalLanguageSeed).toBe("X投稿を毎日");
    expect(result.draft.frequency).toBe("daily");
    expect(result.draft.steps.some((step) => step.type === "x_post")).toBe(true);
    expect(result.draft.steps.some((step) => step.type === "excel_generate")).toBe(
      false,
    );
  });

  it("TEST 6: creating A then opening new B inherits none of A's wizard fields", () => {
    const createdA = staleDraft({
      draftId: "draft-created-a",
      name: "自動化A",
      createdAutomationId: "auto-a",
    });
    const next = bootstrapWizardDraft({
      intent: { kind: "fresh" },
      drafts: [createdA],
    });
    expect(next.status).toBe("fresh");
    expect(inheritedStaleWizardFields(next.draft, createdA)).toEqual([]);
    expect(next.draft.name).not.toBe("自動化A");
    expect(next.draft.steps).toEqual([]);
    expect(next.draft.frequency).not.toBe("daily");
    expect(next.draft.freeformNotes).not.toBe(createdA.freeformNotes);
    expect(next.draft.executionMode).not.toBe("review_selected_steps");
    expect(next.draft.memoryEnabled).not.toBe(false);
  });

  it("TEST 7: cleanup failure still does not auto-resume on /automations/new", async () => {
    const leftover = staleDraft({ draftId: "draft-failed-cleanup" });
    const pointer = { cleared: false };
    const cleanup = await cleanupWizardDraftAfterCreate({
      draftId: leftover.draftId,
      deleteDraft: async () => {
        throw new Error("durable delete failed");
      },
      clearPointer: () => {
        pointer.cleared = true;
      },
      logFailure: () => undefined,
    });
    expect(cleanup.cleaned).toBe(false);
    expect(pointer.cleared).toBe(true);

    const next = bootstrapWizardDraft({
      intent: { kind: "fresh" },
      drafts: [leftover],
    });
    expect(next.status).toBe("fresh");
    expect(inheritedStaleWizardFields(next.draft, leftover)).toEqual([]);
  });

  it("TEST 8: refresh with explicit draft id resumes the same draft", () => {
    const editing = staleDraft({
      draftId: "draft-editing",
      name: "編集中の下書き",
      currentStepId: "notes",
      freeformNotes: "途中まで書いた備考",
    });
    const first = bootstrapWizardDraft({
      intent: { kind: "resume", draftId: "draft-editing" },
      drafts: [editing],
    });
    const afterRefresh = bootstrapWizardDraft({
      intent: { kind: "resume", draftId: "draft-editing" },
      drafts: [first.draft],
    });
    expect(afterRefresh.status).toBe("resumed");
    expect(afterRefresh.draft.draftId).toBe("draft-editing");
    expect(afterRefresh.draft.name).toBe("編集中の下書き");
    expect(afterRefresh.draft.currentStepId).toBe("notes");
    expect(afterRefresh.draft.freeformNotes).toBe("途中まで書いた備考");
    expect(wizardDraftUrl("draft-editing")).toBe(
      "/automations/new?draft=draft-editing",
    );
  });
});

describe("post-create cleanup and autosave guards", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });
  it("clears the local pointer even when delete fails", async () => {
    const logs: unknown[] = [];
    const result = await cleanupWizardDraftAfterCreate({
      draftId: "draft-x",
      deleteDraft: async () => {
        throw new Error("boom");
      },
      clearPointer: () => logs.push("cleared"),
      logFailure: (error) => logs.push(error),
    });
    expect(result.cleaned).toBe(false);
    expect(logs[0]).toBe("cleared");
    expect(logs[1]).toBeInstanceOf(Error);
  });

  it("does not treat successful delete as a create failure", async () => {
    const result = await cleanupWizardDraftAfterCreate({
      draftId: "draft-x",
      deleteDraft: async () => undefined,
      clearPointer: () => undefined,
      logFailure: () => {
        throw new Error("should not log");
      },
    });
    expect(result.cleaned).toBe(true);
  });

  it("suppresses autosave until bootstrap and after create completes", () => {
    const draft = createEmptyWizardDraft();
    expect(
      shouldSuppressWizardAutosave({ bootstrapped: false, draft }),
    ).toBe(true);
    expect(
      shouldSuppressWizardAutosave({ bootstrapped: true, draft }),
    ).toBe(false);
    expect(
      shouldSuppressWizardAutosave({
        bootstrapped: true,
        draft: { ...draft, currentStepId: "complete", createdAutomationId: "a1" },
      }),
    ).toBe(true);
  });

  it("writes draft id into the URL and drops seed so refresh uses the same draft", () => {
    const replaceState = vi.fn();
    vi.stubGlobal("window", {
      location: { href: "https://minervot.example/automations/new?seed=X" },
      history: { state: { idx: 1 }, replaceState },
    });
    syncWizardDraftToUrl("draft-editing");
    expect(replaceState).toHaveBeenCalledWith(
      { idx: 1 },
      "",
      "/automations/new?draft=draft-editing",
    );
    vi.unstubAllGlobals();
  });
});

describe("wizard source does not implicitly resume", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("does not auto-load drafts[0] or session pointer on /automations/new", () => {
    const src = readFileSync(
      join(process.cwd(), "components/automations/v2/automation-create-wizard.tsx"),
      "utf8",
    );
    expect(src).not.toContain("drafts[0]");
    expect(src).not.toContain("pointer?.draftId");
    expect(src).not.toContain("loadLocalDraftPointer");
    expect(src).toContain("resolveWizardEntryIntent");
    expect(src).toContain("cleanupWizardDraftAfterCreate");
    expect(src).not.toMatch(/deleteAutomationDraft\([^)]*\)\.catch\(\s*\(\)\s*=>\s*undefined\s*\)/);
  });
});
