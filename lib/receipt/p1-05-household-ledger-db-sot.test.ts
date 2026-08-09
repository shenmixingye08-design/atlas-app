/**
 * P1-05: Household ledger dedicated DB SoT — integrity tests A–L.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

vi.mock("@/lib/persistence/durable-domain", () => ({
  persistDurableDomain: vi.fn(async () => "supabase"),
  loadDurableDomain: vi.fn(async () => null),
}));

vi.mock("@/lib/openai", () => ({
  isOpenAIConfigured: vi.fn(() => false),
  getOpenAIClient: vi.fn(() => ({
    responses: { create: vi.fn() },
  })),
}));

import { loadDurableDomain } from "@/lib/persistence/durable-domain";
import { prepareMediaImages } from "@/lib/media-pipelines";

import {
  backfillHouseholdLedgerEntriesFromArray,
  backfillHouseholdLedgerEntriesFromDurable,
} from "./repository/backfill";
import {
  dbCountLedgerEntries,
  dbGetLedgerEntryForUser,
  dbListLedgerEntries,
  dbUpsertLedgerEntries,
} from "./repository/db-store";
import { setHouseholdLedgerTableReadyForTests } from "./repository/table-ready";
import { runReceiptPipeline } from "./pipeline";
import {
  createManualLedgerEntry,
  deleteHouseholdLedgerEntry,
  listHouseholdEntries,
  updateHouseholdLedgerEntry,
} from "./service";
import {
  listLedgerEntries,
  resetHouseholdLedgerProcessCacheForTests,
  resetHouseholdLedgerStoreForTests,
} from "./store";
import type { LedgerEntry } from "./types";

function tinyPng(): Buffer {
  return Buffer.from(
    "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==",
    "base64",
  );
}

function makeEntry(
  userId: string,
  index: number,
  overrides?: Partial<LedgerEntry>,
): LedgerEntry {
  const day = String((index % 28) + 1).padStart(2, "0");
  const now = new Date().toISOString();
  const base: LedgerEntry = {
    id: `entry_p105_${userId}_${index}`,
    userId,
    receiptId: "",
    date: `2026-06-${day}`,
    storeName: `店${index}`,
    category: "食費",
    itemName: `品目${index}`,
    quantity: 1,
    unitPrice: 100 + index,
    tax: 10,
    amountInclTax: 110 + index,
    paymentMethod: "現金",
    note: `memo-${index}`,
    moneyUse: "personal",
    sourceImageIds: [],
    createdAt: now,
    updatedAt: now,
  };
  return {
    ...base,
    ...overrides,
    id: overrides?.id ?? base.id,
    userId,
  };
}

describe("P1-05 household ledger DB SoT", () => {
  beforeEach(() => {
    resetHouseholdLedgerStoreForTests();
    setHouseholdLedgerTableReadyForTests(true);
    vi.mocked(loadDurableDomain).mockResolvedValue(null);
    vi.stubEnv("ATLAS_MOCK_LLM", "true");
    vi.stubEnv("NODE_ENV", "test");
  });

  afterEach(() => {
    resetHouseholdLedgerStoreForTests();
    vi.unstubAllEnvs();
    vi.clearAllMocks();
  });

  it("A: create 1 entry → persisted in DB stand-in", async () => {
    const entry = await createManualLedgerEntry({
      userId: "user_a",
      amountInclTax: 1234,
      date: "2026-08-01",
      category: "食費",
      storeName: "テスト店",
      itemName: "牛乳",
    });
    const listed = await dbListLedgerEntries("user_a");
    expect(listed).toHaveLength(1);
    expect(listed[0]?.id).toBe(entry.id);
    expect(listed[0]?.amountInclTax).toBe(1234);
    expect(await dbCountLedgerEntries("user_a")).toBe(1);
  });

  it("B: 50+ entries → oldest not dropped", async () => {
    const userId = "user_b50";
    const batch = Array.from({ length: 55 }, (_, i) => makeEntry(userId, i));
    await dbUpsertLedgerEntries(batch, { source: "manual" });
    const all = await dbListLedgerEntries(userId);
    expect(all.length).toBe(55);
    expect(all.some((row) => row.id.endsWith("_0"))).toBe(true);
    expect(all.some((row) => row.id.endsWith("_54"))).toBe(true);
  });

  it("C: 100+ entries still listable (paging)", async () => {
    const userId = "user_c100";
    const batch = Array.from({ length: 120 }, (_, i) => makeEntry(userId, i));
    await dbUpsertLedgerEntries(batch, { source: "manual" });
    expect(await dbCountLedgerEntries(userId)).toBe(120);
    const page1 = await dbListLedgerEntries(userId, { limit: 50, offset: 0 });
    const page2 = await dbListLedgerEntries(userId, { limit: 50, offset: 50 });
    const page3 = await dbListLedgerEntries(userId, { limit: 50, offset: 100 });
    expect(page1).toHaveLength(50);
    expect(page2).toHaveLength(50);
    expect(page3).toHaveLength(20);
    const ids = new Set(
      [...page1, ...page2, ...page3].map((row) => row.id),
    );
    expect(ids.size).toBe(120);
  });

  it("D: restart-equivalent → restore from DB, not process memory", async () => {
    const userId = "user_d_restart";
    await dbUpsertLedgerEntries(
      [makeEntry(userId, 1, { itemName: "耐久テスト" })],
      { source: "manual" },
    );
    resetHouseholdLedgerProcessCacheForTests();
    const restored = await listLedgerEntries(userId);
    expect(restored).toHaveLength(1);
    expect(restored[0]?.itemName).toBe("耐久テスト");
  });

  it("E: update reflected", async () => {
    const created = await createManualLedgerEntry({
      userId: "user_e",
      amountInclTax: 500,
      date: "2026-08-02",
      category: "食費",
      storeName: "A店",
    });
    const updated = await updateHouseholdLedgerEntry({
      userId: "user_e",
      entryId: created.id,
      patch: { category: "日用品", amountInclTax: 800, note: "修正後" },
    });
    expect(updated?.category).toBe("日用品");
    expect(updated?.amountInclTax).toBe(800);
    const again = await dbGetLedgerEntryForUser("user_e", created.id);
    expect(again?.note).toBe("修正後");
    expect(again?.amountInclTax).toBe(800);
  });

  it("F: delete reflected", async () => {
    const created = await createManualLedgerEntry({
      userId: "user_f",
      amountInclTax: 100,
      date: "2026-08-03",
      category: "その他",
    });
    const ok = await deleteHouseholdLedgerEntry({
      userId: "user_f",
      entryId: created.id,
    });
    expect(ok).toBe(true);
    expect(await dbGetLedgerEntryForUser("user_f", created.id)).toBeNull();
    expect(await dbCountLedgerEntries("user_f")).toBe(0);
  });

  it("G: User A cannot read/update/delete User B entries", async () => {
    const b = await createManualLedgerEntry({
      userId: "user_b_owner",
      amountInclTax: 999,
      date: "2026-08-04",
      category: "趣味",
      itemName: "秘密",
    });
    expect(await dbGetLedgerEntryForUser("user_a_attacker", b.id)).toBeNull();
    expect(
      await updateHouseholdLedgerEntry({
        userId: "user_a_attacker",
        entryId: b.id,
        patch: { amountInclTax: 1 },
      }),
    ).toBeNull();
    expect(
      await deleteHouseholdLedgerEntry({
        userId: "user_a_attacker",
        entryId: b.id,
      }),
    ).toBe(false);
    const still = await dbGetLedgerEntryForUser("user_b_owner", b.id);
    expect(still?.amountInclTax).toBe(999);
    expect(still?.itemName).toBe("秘密");
  });

  it("H: receipt parse failure → 0 ledger rows", async () => {
    vi.stubEnv("NODE_ENV", "production");
    vi.stubEnv("VERCEL_ENV", "production");
    delete process.env.OPENAI_API_KEY;
    delete process.env.ATLAS_MOCK_LLM;

    const images = await prepareMediaImages([
      {
        filename: "receipt.jpg",
        mimeType: "image/png",
        bytes: tinyPng(),
      },
    ]);
    const session = await runReceiptPipeline({
      userId: "user_h_fail",
      images,
      userHint: "家計簿にして",
    });
    expect(session.status).toBe("failed");
    expect(await listLedgerEntries("user_h_fail")).toHaveLength(0);
  });

  it("I: receipt parse success → 1+ rows in dedicated store", async () => {
    vi.stubEnv("NODE_ENV", "test");
    vi.stubEnv("ATLAS_MOCK_LLM", "true");
    delete process.env.OPENAI_API_KEY;

    const images = await prepareMediaImages([
      {
        filename: "receipt.jpg",
        mimeType: "image/png",
        bytes: tinyPng(),
      },
    ]);
    const session = await runReceiptPipeline({
      userId: "user_i_ok",
      images,
      userHint: "家計簿にして",
    });
    expect(session.status).toBe("registered");
    const entries = await listLedgerEntries("user_i_ok");
    expect(entries.length).toBeGreaterThan(0);
    expect(entries.every((row) => row.userId === "user_i_ok")).toBe(true);
  });

  it("J: backfill is idempotent (no duplicate ids)", async () => {
    const userId = "user_j_bf";
    const legacy = [makeEntry(userId, 1), makeEntry(userId, 2)];
    const first = await backfillHouseholdLedgerEntriesFromArray(userId, legacy);
    const second = await backfillHouseholdLedgerEntriesFromArray(userId, legacy);
    expect(first.insertedOrUpdated).toBe(2);
    expect(second.insertedOrUpdated).toBe(2);
    expect(await dbCountLedgerEntries(userId)).toBe(2);

    vi.mocked(loadDurableDomain).mockResolvedValue({
      entries: legacy,
      categoryRules: [],
      sessions: [],
    });
    const fromDurable = await backfillHouseholdLedgerEntriesFromDurable(userId);
    expect(fromDurable.skippedExisting).toBe(2);
    expect(await dbCountLedgerEntries(userId)).toBe(2);
  });

  it("K: empty atlas_user_state still works", async () => {
    vi.mocked(loadDurableDomain).mockResolvedValue(null);
    const { ensureHouseholdLedgerHydrated } = await import("./durable");
    await ensureHouseholdLedgerHydrated("user_k_empty");
    const entry = await createManualLedgerEntry({
      userId: "user_k_empty",
      amountInclTax: 42,
      date: "2026-08-05",
      category: "交通費",
    });
    const listed = await listHouseholdEntries("user_k_empty");
    expect(listed.map((row) => row.id)).toContain(entry.id);
  });

  it("L: JSON snapshot has no entries SoT; 45 rows survive process clear", async () => {
    const userId = "user_l_cap";
    const batch = Array.from({ length: 45 }, (_, i) => makeEntry(userId, i));
    await dbUpsertLedgerEntries(batch, { source: "manual" });
    resetHouseholdLedgerProcessCacheForTests();
    expect(await dbCountLedgerEntries(userId)).toBe(45);

    const { snapshotHouseholdLedger } = await import("./durable");
    const snap = snapshotHouseholdLedger(userId);
    expect(snap.entries).toEqual([]);
  });
});
