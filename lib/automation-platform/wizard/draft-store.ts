import "server-only";

import {
  loadDurableDomain,
  persistDurableDomain,
} from "@/lib/persistence/durable-domain";
import type { AutomationWizardDraft } from "./types";

const DRAFTS_DOMAIN = "atlasAutomationDrafts";
const MAX_DRAFTS = 20;

type DraftBucket = {
  drafts: AutomationWizardDraft[];
};

function getMemory(): Map<string, DraftBucket> {
  const globalScope = globalThis as typeof globalThis & {
    __atlasAutomationDrafts?: Map<string, DraftBucket>;
  };
  if (!globalScope.__atlasAutomationDrafts) {
    globalScope.__atlasAutomationDrafts = new Map();
  }
  return globalScope.__atlasAutomationDrafts;
}

export function resetAutomationDraftsForTests(): void {
  getMemory().clear();
}

export async function listDraftsForUser(
  userId: string,
): Promise<AutomationWizardDraft[]> {
  const memory = getMemory();
  if (!memory.has(userId)) {
    const loaded = await loadDurableDomain<DraftBucket>(userId, DRAFTS_DOMAIN);
    memory.set(userId, { drafts: loaded?.drafts ?? [] });
  }
  return [...(memory.get(userId)?.drafts ?? [])].sort((a, b) =>
    (b.savedAt ?? "").localeCompare(a.savedAt ?? ""),
  );
}

export async function upsertDraftForUser(
  userId: string,
  draft: AutomationWizardDraft,
): Promise<AutomationWizardDraft> {
  const drafts = await listDraftsForUser(userId);
  const savedAt = new Date().toISOString();
  const nextDraft: AutomationWizardDraft = { ...draft, savedAt };
  const without = drafts.filter((item) => item.draftId !== draft.draftId);
  const next = [nextDraft, ...without].slice(0, MAX_DRAFTS);
  getMemory().set(userId, { drafts: next });
  void persistDurableDomain(userId, DRAFTS_DOMAIN, { drafts: next }, {
    compact: (payload) => ({
      drafts: payload.drafts.slice(0, MAX_DRAFTS).map((draft) => ({
        ...draft,
        freeformNotes: draft.freeformNotes.slice(0, 2000),
        naturalLanguageSeed: draft.naturalLanguageSeed.slice(0, 2000),
      })),
    }),
    forceSupabase: true,
  });
  return nextDraft;
}

export async function deleteDraftForUser(
  userId: string,
  draftId: string,
): Promise<void> {
  const drafts = await listDraftsForUser(userId);
  const next = drafts.filter((item) => item.draftId !== draftId);
  getMemory().set(userId, { drafts: next });
  void persistDurableDomain(userId, DRAFTS_DOMAIN, { drafts: next }, {
    compact: (payload) => payload,
    forceSupabase: true,
  });
}

export async function getDraftForUser(
  userId: string,
  draftId: string,
): Promise<AutomationWizardDraft | null> {
  const drafts = await listDraftsForUser(userId);
  return drafts.find((item) => item.draftId === draftId) ?? null;
}
