import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

vi.mock("@/lib/persistence/durable-domain", () => ({
  persistDurableDomain: vi.fn(async () => "supabase"),
  loadDurableDomain: vi.fn(async () => null),
}));

import {
  loadDurableDomain,
  persistDurableDomain,
} from "@/lib/persistence/durable-domain";
import { createEmptyWizardDraft, createStepFromCapability } from "@/lib/automation-platform/wizard/builders";
import {
  deleteDraftForUser,
  listDraftsForUser,
  resetAutomationDraftsForTests,
  upsertDraftForUser,
} from "@/lib/automation-platform/wizard/draft-store";

const persistMock = vi.mocked(persistDurableDomain);
const loadMock = vi.mocked(loadDurableDomain);

describe("automation wizard draft-store persist ordering", () => {
  beforeEach(() => {
    resetAutomationDraftsForTests();
    persistMock.mockReset();
    loadMock.mockReset();
    persistMock.mockResolvedValue("supabase");
    loadMock.mockResolvedValue(null);
  });

  afterEach(() => {
    resetAutomationDraftsForTests();
  });

  it("awaits durable persist on delete so an in-flight upsert cannot resurrect the draft", async () => {
    let releaseUpsert: (() => void) | undefined;
    const upsertGate = new Promise<void>((resolve) => {
      releaseUpsert = resolve;
    });
    const payloads: Array<{ draftIds: string[] }> = [];

    persistMock.mockImplementation(async (_user, _domain, payload) => {
      const bucket = payload as { drafts: Array<{ draftId: string }> };
      payloads.push({
        draftIds: bucket.drafts.map((draft) => draft.draftId),
      });
      if (payloads.length === 1) {
        await upsertGate;
      }
      return "supabase";
    });

    const draft = createEmptyWizardDraft({
      draftId: "draft-old",
      name: "古い下書き",
      steps: [createStepFromCapability("x_post")],
    });

    await upsertDraftForUser("user-1", draft);
    const deleteDone = deleteDraftForUser("user-1", "draft-old");
    await vi.waitFor(() => {
      expect(payloads).toHaveLength(1);
    });
    expect(payloads[0]?.draftIds).toEqual(["draft-old"]);

    releaseUpsert?.();
    await deleteDone;

    expect(payloads).toHaveLength(2);
    expect(payloads[1]?.draftIds).toEqual([]);
    await expect(listDraftsForUser("user-1")).resolves.toEqual([]);
  });
});
