import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

import { ACCOUNT_WIPE_DOMAIN_KEYS } from "@/lib/account-deletion/durable";
import { SUPABASE_ONLY_DOMAIN_KEYS } from "@/lib/persistence/durable-domain";

describe("deliverable batch migration and domains", () => {
  const sql = readFileSync(
    "supabase/migrations/20260824_atlas_deliverable_batches.sql",
    "utf8",
  );

  it("adds deny-all RLS tables without rewriting jobs", () => {
    expect(sql).toContain("atlas_deliverable_batches");
    expect(sql).toContain("atlas_deliverable_batch_items");
    expect(sql).toContain("enable row level security");
    expect(sql).toContain("atlas_deliverable_batches_deny_all");
    expect(sql).toContain("atlas_deliverable_batch_items_deny_all");
    expect(sql).toContain("to anon, authenticated");
    expect(sql).toContain("using (false)");
    expect(sql).not.toContain("drop table public.atlas_work_jobs");
  });

  it("wipes and stores the durable domain in supabase only", () => {
    expect(SUPABASE_ONLY_DOMAIN_KEYS).toContain("atlasDeliverableBatches");
    expect(ACCOUNT_WIPE_DOMAIN_KEYS).toContain("atlasDeliverableBatches");
  });
});
