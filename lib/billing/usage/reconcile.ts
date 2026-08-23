/**
 * Recover current-month usage from unique durable evidence only.
 * Never sums multiple ledgers. Never invents counts without evidence.
 */

import { isAtlasProduction } from "@/lib/runtime/is-production";
import { createServiceRoleClientIfConfigured } from "@/lib/supabase/service-role";

import {
  incrementDurableUsageOnce,
  syncAiRunsFromClaims,
} from "./durable-counters";
import { getUsageMonthKey } from "./period";
import { asUntypedSupabase } from "./untyped-supabase";
import { tweetContainsExternalUrl } from "./x-url";

export type UsageEvidenceRow = {
  provider: "x" | "wordpress";
  actionType: "post" | "publish";
  resourceId: string;
  text?: string | null;
  completedAt?: string | null;
};

type EvidenceBucket = Map<string, UsageEvidenceRow[]>;

function evidenceStore(): EvidenceBucket {
  const scope = globalThis as typeof globalThis & {
    __atlasUsageEvidenceForTests?: EvidenceBucket;
  };
  if (!scope.__atlasUsageEvidenceForTests) {
    scope.__atlasUsageEvidenceForTests = new Map();
  }
  return scope.__atlasUsageEvidenceForTests;
}

export function resetUsageEvidenceForTests(): void {
  evidenceStore().clear();
}

export function seedUsageEvidenceForTests(
  userId: string,
  rows: UsageEvidenceRow[],
): void {
  evidenceStore().set(userId, rows.map((row) => ({ ...row })));
}

function inMonth(completedAt: string | null | undefined, month: string): boolean {
  if (!completedAt) return true;
  const at = new Date(completedAt);
  if (Number.isNaN(at.getTime())) return true;
  return getUsageMonthKey(at) === month;
}

function textFromEvidence(evidence: unknown): string | null {
  if (!evidence || typeof evidence !== "object") return null;
  const record = evidence as Record<string, unknown>;
  for (const key of ["text", "body", "content", "message"]) {
    const value = record[key];
    if (typeof value === "string" && value.trim()) return value;
  }
  return null;
}

async function loadSucceededSideEffects(
  userId: string,
  month: string,
): Promise<UsageEvidenceRow[]> {
  const seeded = evidenceStore().get(userId);
  if (seeded) {
    return seeded.filter((row) => inMonth(row.completedAt, month));
  }

  const client = createServiceRoleClientIfConfigured();
  if (!client) return [];

  const { data, error } = await asUntypedSupabase(client)
    .from("atlas_side_effect_claims")
    .select(
      "provider, action_type, provider_resource_id, evidence, completed_at",
    )
    .eq("user_id", userId)
    .eq("status", "succeeded");

  if (error || !Array.isArray(data)) return [];

  const rows: UsageEvidenceRow[] = [];
  for (const raw of data) {
    const row = raw as {
      provider?: string;
      action_type?: string;
      provider_resource_id?: string | null;
      evidence?: unknown;
      completed_at?: string | null;
    };
    const resourceId = row.provider_resource_id?.trim();
    if (!resourceId) continue;
    if (!inMonth(row.completed_at, month)) continue;
    if (row.provider === "x" && row.action_type === "post") {
      rows.push({
        provider: "x",
        actionType: "post",
        resourceId,
        text: textFromEvidence(row.evidence),
        completedAt: row.completed_at,
      });
    }
    if (row.provider === "wordpress" && row.action_type === "publish") {
      rows.push({
        provider: "wordpress",
        actionType: "publish",
        resourceId,
        text: null,
        completedAt: row.completed_at,
      });
    }
  }
  return rows;
}

export async function reconcileCurrentMonthUsageFromEvidence(
  userId: string,
  month: string = getUsageMonthKey(),
): Promise<{ ready: boolean }> {
  if (!userId.trim()) return { ready: false };

  const rows = await loadSucceededSideEffects(userId, month);
  const seenX = new Set<string>();
  const seenWp = new Set<string>();

  for (const row of rows) {
    if (row.provider === "x") {
      if (seenX.has(row.resourceId)) continue;
      seenX.add(row.resourceId);
      const sns = await incrementDurableUsageOnce({
        userId,
        month,
        meter: "sns_posts",
        claimKey: `x:${row.resourceId}`,
      });
      if (isAtlasProduction() && !sns.ready) return { ready: false };
      if (row.text && tweetContainsExternalUrl(row.text)) {
        const url = await incrementDurableUsageOnce({
          userId,
          month,
          meter: "x_url_posts",
          claimKey: `xurl:${row.resourceId}`,
        });
        if (isAtlasProduction() && !url.ready) return { ready: false };
      }
    }
    if (row.provider === "wordpress") {
      if (seenWp.has(row.resourceId)) continue;
      seenWp.add(row.resourceId);
      const wp = await incrementDurableUsageOnce({
        userId,
        month,
        meter: "wordpress_posts",
        claimKey: `wp:${row.resourceId}`,
      });
      if (isAtlasProduction() && !wp.ready) return { ready: false };
    }
  }

  const ai = await syncAiRunsFromClaims(userId, month);
  if (isAtlasProduction() && !ai.ready && createServiceRoleClientIfConfigured()) {
    return { ready: false };
  }
  return { ready: true };
}
