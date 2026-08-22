/**
 * B-09 Memory × Deliverables: 2nd request inherits Word / concise / 3 headings.
 */

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));
vi.mock("@/lib/persistence/durable-domain", () => ({
  persistDurableDomain: vi.fn(async () => "supabase"),
  loadDurableDomain: vi.fn(async () => null),
}));
vi.mock("@/lib/personal-memory/durable", () => ({
  ensurePersonalMemoryHydrated: vi.fn(async () => undefined),
  schedulePersistPersonalMemory: vi.fn(),
  persistPersonalMemoryNow: vi.fn(async () => "skipped"),
  wipePersonalMemoryDurable: vi.fn(),
}));

import { applyRememberedDeliverableFormats } from "@/lib/deliverables/remembered-formats";
import { getDeliverableGenerator } from "@/lib/deliverables/generators";
import { verifyGeneratedExportAsync } from "@/lib/deliverables/export-verify";
import { verifyDocxDocument } from "@/lib/deliverables/document-model/verify-docx";
import { applyMemoryForDeliverable } from "@/lib/memory-apply/deliverables";
import {
  detectInstructionPreferenceItems,
  parseExplicitOverrideFromText,
  preferenceApplicationRate,
  stripKnownPreferencesFromInstruction,
} from "@/lib/memory-apply/instruction-reduction";
import {
  ingestCorrectionSignal,
  resolveForContext,
} from "@/lib/personal-memory/service";
import {
  clearAllPersonalMemoryData,
  writePersonalMemorySettings,
} from "@/lib/personal-memory/store";
import { DEFAULT_PERSONAL_MEMORY_SETTINGS } from "@/lib/personal-memory/types";
import { rememberSuccessfulDeliverableFormat } from "@/lib/memory-apply/remembered-formats";
import { resolveRememberedDeliverableFormats } from "@/lib/memory-apply/remembered-formats";

const USER = "user_phase2_b09";

const FIRST = "短めの社内報告書をWordで";
const CORRECTION = "もっと簡潔に、見出し3つ";
const SECOND = "今週分も作って";
const OVERRIDE = "今回は詳しく";

const LONG_DRAFT = [
  "今週の社内状況を長く説明します。",
  "背景として市場の動きと社内の体制を詳しく述べます。",
  "売上は計画どおり進捗しています。",
  "課題として採用が遅れています。",
  "来週はフォローアップを実施します。",
  "補足として会議の議事も残しています。",
].join("");

describe("B-09 Memory × Deliverables", () => {
  beforeEach(() => {
    clearAllPersonalMemoryData(USER);
    writePersonalMemorySettings(USER, {
      ...DEFAULT_PERSONAL_MEMORY_SETTINGS,
      enabled: true,
      proposeFromCorrections: true,
    });
  });

  afterEach(() => {
    clearAllPersonalMemoryData(USER);
  });

  it("2nd request applies Word + concise + 3 headings without restating them", async () => {
    const firstItems = detectInstructionPreferenceItems(FIRST);
    expect(firstItems).toEqual(
      expect.arrayContaining(["length:short", "format:docx"]),
    );

    await ingestCorrectionSignal({
      userId: USER,
      text: FIRST,
      artifactType: "docx",
      source: "user_correction",
    });
    await ingestCorrectionSignal({
      userId: USER,
      text: CORRECTION,
      artifactType: "docx",
      source: "user_correction",
    });
    await rememberSuccessfulDeliverableFormat({
      userId: USER,
      format: "docx",
      assignment: FIRST,
    });

    const secondItems = detectInstructionPreferenceItems(SECOND);
    expect(secondItems).toHaveLength(0);
    expect(firstItems.length - secondItems.length).toBeGreaterThanOrEqual(2);

    const remembered = await resolveRememberedDeliverableFormats(USER);
    const formats = applyRememberedDeliverableFormats(SECOND, remembered);
    expect(formats.formats).toContain("docx");
    expect(formats.matchedRule).toBe("remembered_preference");

    const applied = await applyMemoryForDeliverable({
      userId: USER,
      content: LONG_DRAFT,
      format: "docx",
      assignment: SECOND,
    });
    expect(applied.memoryApplied).toBe(true);
    expect(
      preferenceApplicationRate({
        expectedKeys: ["length:short", "headingCount"],
        appliedKeys: applied.appliedPreferenceKeys,
      }),
    ).toBe(1);
    expect((applied.content.match(/^## /gm) ?? []).length).toBe(3);
    expect(applied.preferenceNotice).toMatch(/前回の好みを反映しました/);

    const file = await getDeliverableGenerator("docx")!.generate(
      applied.content,
      "b09-week",
      { assignment: SECOND, title: "今週の社内報告書" },
    );
    const verified = await verifyGeneratedExportAsync(file);
    expect(verified.ok, verified.reasons.join(",")).toBe(true);
    const docx = await verifyDocxDocument(file.buffer);
    expect(docx.headingCount).toBeGreaterThanOrEqual(3);
    expect(docx.reasons).not.toContain("memory_instruction_leak");
  });

  it("今回は詳しく wins over saved concise preference", async () => {
    await ingestCorrectionSignal({
      userId: USER,
      text: CORRECTION,
      artifactType: "docx",
      source: "user_correction",
    });
    const override = parseExplicitOverrideFromText(`${OVERRIDE} ${SECOND}`);
    expect(override.length).toBe("long");

    const applied = await applyMemoryForDeliverable({
      userId: USER,
      content: LONG_DRAFT,
      format: "docx",
      assignment: `${OVERRIDE} ${SECOND}`,
    });
    expect(applied.appliedPreferenceKeys).not.toContain("length:short");
    expect(applied.content.length).toBeGreaterThan(40);
  });

  it("restating the first instruction is stripped once prefs exist", async () => {
    await ingestCorrectionSignal({
      userId: USER,
      text: `${FIRST}。${CORRECTION}`,
      artifactType: "docx",
      source: "user_correction",
    });
    const resolved = await resolveForContext({
      userId: USER,
      notes: SECOND,
      artifactTypes: ["docx"],
    });
    const stripped = stripKnownPreferencesFromInstruction({
      instruction: `${FIRST}。${CORRECTION}。${SECOND}`,
      values: resolved.ledger.memoryValuesResolved,
    });
    expect(stripped.strippedKeys.length).toBeGreaterThanOrEqual(2);
    expect(stripped.restatedItemsAfter.length).toBeLessThan(
      stripped.restatedItemsBefore.length,
    );
  });
});
