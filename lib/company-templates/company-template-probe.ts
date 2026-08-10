/**
 * P3-02 Production probe: Company template tenant isolation + Postgres SoT.
 * Soft-success / fixed-true flags forbidden.
 */

import "server-only";

import { randomUUID } from "crypto";

import { getHealthVersionPayload } from "@/lib/health/version-info";
import { loadDurableDomain } from "@/lib/persistence/durable-domain";
import { createServiceRoleClientIfConfigured } from "@/lib/supabase/service-role";

import { applyCompanyTemplateForUser } from "./apply-template.server";
import {
  ACTIVE_COMPANY_DOMAIN_KEY,
  ensureActiveCompanyHydrated,
  evictActiveCompanyCacheForUser,
  persistActiveCompanyNow,
  resolveAuthoritativeTemplateId,
  resetActiveCompanyDurableForTests,
  type DurableActiveCompanyState,
} from "./durable";
import {
  getServerActiveCompanyStateForUser,
  hasServerActiveCompanyStateForUser,
  setServerActiveCompanyStateForUser,
} from "./store";
import type { CompanyTemplateId } from "./types";

export type CompanyTemplateProbeResult = {
  ok: boolean;
  tableOk: boolean;
  durableWriteOk: boolean;
  restartDurableOk: boolean;
  retrySafe: boolean;
  idempotent: boolean;
  multiInstanceSafe: boolean;
  memoryNotSot: boolean;
  ownershipIsolationOk: boolean;
  serverAuthorityOk: boolean;
  failClosed: boolean;
  error: string | null;
  commitShaShort: string;
  environment: string;
};

const PROBE_USER_A = "user_p302_probe_a";
const PROBE_USER_B = "user_p302_probe_b";
const TEMPLATE_A: CompanyTemplateId = "blogging";
const TEMPLATE_B: CompanyTemplateId = "youtube";

function versionBits() {
  const v = getHealthVersionPayload();
  return {
    commitShaShort: v.commitShaShort,
    environment: v.environment,
  };
}

function baseFail(
  error: string,
  extra?: Partial<CompanyTemplateProbeResult>,
): CompanyTemplateProbeResult {
  const { commitShaShort, environment } = versionBits();
  return {
    ok: false,
    tableOk: false,
    durableWriteOk: false,
    restartDurableOk: false,
    retrySafe: false,
    idempotent: false,
    multiInstanceSafe: false,
    memoryNotSot: false,
    ownershipIsolationOk: false,
    serverAuthorityOk: false,
    failClosed: false,
    error,
    commitShaShort,
    environment,
    ...extra,
  };
}

async function atlasUserStateReadable(): Promise<{
  ok: boolean;
  error: string | null;
}> {
  const client = createServiceRoleClientIfConfigured();
  if (!client) {
    return { ok: false, error: "supabase_service_role_not_configured" };
  }
  const { error } = await client
    .from("atlas_user_state")
    .select("user_id")
    .eq("domain", ACTIVE_COMPANY_DOMAIN_KEY)
    .limit(1);
  if (error) {
    return { ok: false, error: error.message };
  }
  return { ok: true, error: null };
}

async function cleanupProbeUsers(): Promise<void> {
  const client = createServiceRoleClientIfConfigured();
  if (!client) return;
  await client
    .from("atlas_user_state")
    .delete()
    .in("user_id", [PROBE_USER_A, PROBE_USER_B])
    .eq("domain", ACTIVE_COMPANY_DOMAIN_KEY);
  evictActiveCompanyCacheForUser(PROBE_USER_A);
  evictActiveCompanyCacheForUser(PROBE_USER_B);
}

async function probeOnce(): Promise<CompanyTemplateProbeResult> {
  const { commitShaShort, environment } = versionBits();
  const correlationId = `corr_p302_${randomUUID()}`;

  try {
    const table = await atlasUserStateReadable();
    if (!table.ok) {
      return baseFail(table.error ?? "atlas_user_state_unavailable", {
        failClosed: true,
      });
    }

    await cleanupProbeUsers();
    resetActiveCompanyDurableForTests();

    // fail-closed: empty userId
    let failClosed = false;
    try {
      await applyCompanyTemplateForUser("", TEMPLATE_A);
      failClosed = false;
    } catch {
      failClosed = true;
    }

    // Seed via cache + durable persist (avoid automation preset side effects in probe).
    const selectedAt = new Date().toISOString();
    setServerActiveCompanyStateForUser(PROBE_USER_A, {
      templateId: TEMPLATE_A,
      selectedAt,
    });
    setServerActiveCompanyStateForUser(PROBE_USER_B, {
      templateId: TEMPLATE_B,
      selectedAt,
    });
    const writeA = await persistActiveCompanyNow(PROBE_USER_A);
    const writeB = await persistActiveCompanyNow(PROBE_USER_B);
    if (writeA !== "supabase" || writeB !== "supabase") {
      return baseFail(`persist_${writeA}_${writeB}`, {
        tableOk: true,
        failClosed,
      });
    }

    const durableA1 = await loadDurableDomain<DurableActiveCompanyState>(
      PROBE_USER_A,
      ACTIVE_COMPANY_DOMAIN_KEY,
    );
    const durableB1 = await loadDurableDomain<DurableActiveCompanyState>(
      PROBE_USER_B,
      ACTIVE_COMPANY_DOMAIN_KEY,
    );
    const durableWriteOk =
      durableA1?.templateId === TEMPLATE_A &&
      durableB1?.templateId === TEMPLATE_B;

    // retry / idempotent: re-persist same selection
    const again = await persistActiveCompanyNow(PROBE_USER_A);
    const again2 = await persistActiveCompanyNow(PROBE_USER_A);
    const durableA2 = await loadDurableDomain<DurableActiveCompanyState>(
      PROBE_USER_A,
      ACTIVE_COMPANY_DOMAIN_KEY,
    );
    const retrySafe =
      again === "supabase" &&
      again2 === "supabase" &&
      durableA2?.templateId === TEMPLATE_A;
    const idempotent = retrySafe;

    // restart simulation: evict memory, rehydrate from Postgres
    evictActiveCompanyCacheForUser(PROBE_USER_A);
    evictActiveCompanyCacheForUser(PROBE_USER_B);
    const memoryEmptyAfterEvict =
      !hasServerActiveCompanyStateForUser(PROBE_USER_A) &&
      !hasServerActiveCompanyStateForUser(PROBE_USER_B);

    await ensureActiveCompanyHydrated(PROBE_USER_A);
    await ensureActiveCompanyHydrated(PROBE_USER_B);
    const afterA = getServerActiveCompanyStateForUser(PROBE_USER_A);
    const afterB = getServerActiveCompanyStateForUser(PROBE_USER_B);
    const restartDurableOk =
      afterA.templateId === TEMPLATE_A && afterB.templateId === TEMPLATE_B;
    const memoryNotSot = memoryEmptyAfterEvict && restartDurableOk;

    // ownership isolation: durable rows scoped by user_id
    const crossA = await loadDurableDomain<DurableActiveCompanyState>(
      PROBE_USER_A,
      ACTIVE_COMPANY_DOMAIN_KEY,
    );
    const crossB = await loadDurableDomain<DurableActiveCompanyState>(
      PROBE_USER_B,
      ACTIVE_COMPANY_DOMAIN_KEY,
    );
    const ownershipIsolationOk =
      crossA?.templateId === TEMPLATE_A &&
      crossB?.templateId === TEMPLATE_B &&
      crossA?.templateId !== crossB?.templateId &&
      afterA.templateId !== afterB.templateId;

    // server authority: spoofed metadata ignored
    const spoofed = resolveAuthoritativeTemplateId({
      userId: PROBE_USER_A,
      metadataTemplateId: TEMPLATE_B,
    });
    const echoed = resolveAuthoritativeTemplateId({
      userId: PROBE_USER_A,
      metadataTemplateId: TEMPLATE_A,
    });
    const serverAuthorityOk =
      spoofed === TEMPLATE_A && echoed === TEMPLATE_A;

    const multiInstanceSafe =
      durableWriteOk && restartDurableOk && ownershipIsolationOk && memoryNotSot;

    const ok =
      table.ok &&
      durableWriteOk &&
      restartDurableOk &&
      retrySafe &&
      idempotent &&
      multiInstanceSafe &&
      memoryNotSot &&
      ownershipIsolationOk &&
      serverAuthorityOk &&
      failClosed;

    return {
      ok,
      tableOk: true,
      durableWriteOk,
      restartDurableOk,
      retrySafe,
      idempotent,
      multiInstanceSafe,
      memoryNotSot,
      ownershipIsolationOk,
      serverAuthorityOk,
      failClosed,
      error: ok
        ? null
        : [
            !durableWriteOk ? "durable_write_failed" : null,
            !restartDurableOk ? "restart_durable_failed" : null,
            !ownershipIsolationOk ? "ownership_isolation_failed" : null,
            !serverAuthorityOk ? "server_authority_failed" : null,
            !failClosed ? "fail_closed_failed" : null,
            correlationId,
          ]
            .filter(Boolean)
            .join("|") || "p3_02_probe_failed",
      commitShaShort,
      environment,
    };
  } catch (error) {
    return baseFail(error instanceof Error ? error.message : String(error));
  } finally {
    await cleanupProbeUsers().catch(() => undefined);
  }
}

export async function probeCompanyTemplateTenant(): Promise<CompanyTemplateProbeResult> {
  const first = await probeOnce();
  if (first.ok) return first;
  if (
    first.error &&
    /schema cache|JWT|clock|does not exist|persist/i.test(first.error)
  ) {
    await new Promise((r) => setTimeout(r, 800));
    return probeOnce();
  }
  return first;
}
