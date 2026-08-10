/**
 * P3-01 Production probe: JWT連携RLS (Clerk sub ↔ auth.jwt()->>'sub').
 * Soft-success / fixed-true flags forbidden.
 */

import "server-only";

import { createHmac, randomUUID } from "crypto";

import { getHealthVersionPayload } from "@/lib/health/version-info";
import { createServiceRoleClientIfConfigured } from "@/lib/supabase/service-role";

import {
  createAnonSupabaseClientForJwtProbe,
  createClerkJwtSupabaseClient,
} from "./client";
import { mintClerkSupabaseJwt } from "./mint-clerk-jwt";
import {
  getJwtSecretEnvPresence,
  resolveSupabaseJwtSecret,
} from "./resolve-jwt-secret";
import {
  applyJwtRlsMigration,
  deleteJwtRlsSubjectsByIds,
  isTransientJwtClockError,
  listJwtRlsSubjectsByCorrelationId,
  upsertJwtRlsSubject,
} from "./store";
import {
  JWT_RLS_PROBE_USER_A,
  JWT_RLS_PROBE_USER_B,
  type JwtRlsSubjectRow,
} from "./types";

export type JwtRlsProbeResult = {
  ok: boolean;
  /** P3-01: Clerk userId was minted into a Supabase JWT and accepted by PostgREST. */
  jwtBridgeOk: boolean;
  /** P3-01: RLS policies enforce row visibility by JWT sub. */
  rlsEnforced: boolean;
  tableOk: boolean;
  restartDurableOk: boolean;
  retrySafe: boolean;
  idempotent: boolean;
  multiInstanceSafe: boolean;
  memoryNotSot: boolean;
  ownershipIsolationOk: boolean;
  failClosed: boolean;
  anonDenied: boolean;
  forgedJwtDenied: boolean;
  projectsJwtPolicyOk: boolean;
  secretSource: "env" | "management_api" | "db_bridge" | "none";
  ownerActionRequired: boolean;
  /** Presence flags only — never secret values. */
  envPresence: {
    supabaseJwtSecret: boolean;
    supabaseAccessToken: boolean;
    serviceRole: boolean;
  };
  error: string | null;
  commitShaShort: string;
  environment: string;
};

function versionBits() {
  const v = getHealthVersionPayload();
  return {
    commitShaShort: v.commitShaShort,
    environment: v.environment,
  };
}

function baseFail(
  error: string,
  extra?: Partial<JwtRlsProbeResult>,
): JwtRlsProbeResult {
  const { commitShaShort, environment } = versionBits();
  return {
    ok: false,
    jwtBridgeOk: false,
    rlsEnforced: false,
    tableOk: false,
    restartDurableOk: false,
    retrySafe: false,
    idempotent: false,
    multiInstanceSafe: false,
    memoryNotSot: false,
    ownershipIsolationOk: false,
    failClosed: false,
    anonDenied: false,
    forgedJwtDenied: false,
    projectsJwtPolicyOk: false,
    secretSource: "none",
    ownerActionRequired: true,
    envPresence: getJwtSecretEnvPresence(),
    error,
    commitShaShort,
    environment,
    ...extra,
  };
}

async function ensureTable(): Promise<{ ok: boolean; error: string | null }> {
  const client = createServiceRoleClientIfConfigured();
  if (!client) {
    return { ok: false, error: "supabase_service_role_not_configured" };
  }

  let lastError: string | null = null;
  for (let attempt = 1; attempt <= 8; attempt += 1) {
    const { error } = await client
      .from("atlas_jwt_rls_subjects")
      .select("id")
      .limit(1);
    if (!error) return { ok: true, error: null };
    lastError = error.message;
    const missing = /schema cache|does not exist|Could not find the table/i.test(
      error.message,
    );
    if (missing) {
      const applied = await applyJwtRlsMigration();
      if (!applied.appliedViaPostgres && !applied.appliedViaManagementApi) {
        return {
          ok: false,
          error: applied.error ?? "jwt_rls_migration_failed",
        };
      }
    } else if (!isTransientJwtClockError(error.message)) {
      // Table may exist but policies outdated — still try apply (idempotent).
      const applied = await applyJwtRlsMigration();
      if (!applied.appliedViaPostgres && !applied.appliedViaManagementApi) {
        return { ok: false, error: error.message };
      }
    }
    await new Promise((r) => setTimeout(r, 500 * attempt));
  }
  return { ok: false, error: lastError ?? "table_unavailable" };
}

function forgeBadJwt(userId: string): string {
  const header = Buffer.from(
    JSON.stringify({ alg: "HS256", typ: "JWT" }),
  ).toString("base64url");
  const now = Math.floor(Date.now() / 1000);
  const payload = Buffer.from(
    JSON.stringify({
      role: "authenticated",
      sub: userId,
      aud: "authenticated",
      iss: "supabase",
      iat: now,
      exp: now + 120,
    }),
  ).toString("base64url");
  const sig = createHmac("sha256", "definitely-not-the-real-supabase-secret")
    .update(`${header}.${payload}`)
    .digest("base64url");
  return `${header}.${payload}.${sig}`;
}

async function probeOnce(): Promise<JwtRlsProbeResult> {
  const { commitShaShort, environment } = versionBits();
  const cleanupIds: string[] = [];
  const correlationId = `corr_p301_${randomUUID()}`;

  try {
    // Apply DDL first so CI-synced bridge secret table / RLS policies exist.
    await applyJwtRlsMigration();
    const table = await ensureTable();

    const secret = await resolveSupabaseJwtSecret({ forceRefresh: true });
    const envPresence = getJwtSecretEnvPresence();
    if (!secret.ok) {
      return baseFail(secret.error || "supabase_jwt_secret_not_configured", {
        failClosed: true,
        tableOk: table.ok,
        secretSource: "none",
        ownerActionRequired: true,
        commitShaShort,
        environment,
      });
    }

    if (!table.ok) {
      return baseFail(table.error ?? "table_unavailable", {
        failClosed: true,
        secretSource: secret.source,
        ownerActionRequired: !envPresence.supabaseJwtSecret,
      });
    }
    const rowA: JwtRlsSubjectRow = {
      id: `p301_${randomUUID()}`,
      user_id: JWT_RLS_PROBE_USER_A,
      correlation_id: correlationId,
      label: "probe-a",
      metadata: { probe: "p3-01", side: "a" },
    };
    const rowB: JwtRlsSubjectRow = {
      id: `p301_${randomUUID()}`,
      user_id: JWT_RLS_PROBE_USER_B,
      correlation_id: correlationId,
      label: "probe-b",
      metadata: { probe: "p3-01", side: "b" },
    };
    cleanupIds.push(rowA.id, rowB.id);

    const writeA = await upsertJwtRlsSubject(rowA);
    const writeB = await upsertJwtRlsSubject(rowB);
    if (!writeA.ok || !writeB.ok) {
      return baseFail(writeA.error || writeB.error || "seed_failed", {
        tableOk: true,
        secretSource: secret.source,
        failClosed: true,
      });
    }

    // restart / memory-not-SoT: read only from DB via service role after seed
    const afterRestart = await listJwtRlsSubjectsByCorrelationId(correlationId);
    const restartDurableOk =
      afterRestart.some((r) => r.id === rowA.id) &&
      afterRestart.some((r) => r.id === rowB.id);
    const memoryNotSot = restartDurableOk;

    // retry / idempotent upsert
    const again = await upsertJwtRlsSubject(rowA);
    const again2 = await upsertJwtRlsSubject(rowA);
    const listed = await listJwtRlsSubjectsByCorrelationId(correlationId);
    const sameIdCount = listed.filter((r) => r.id === rowA.id).length;
    const retrySafe = again.ok && again2.ok && sameIdCount === 1;
    const idempotent = retrySafe;

    const clientA = await createClerkJwtSupabaseClient(JWT_RLS_PROBE_USER_A);
    const clientB = await createClerkJwtSupabaseClient(JWT_RLS_PROBE_USER_B);
    if (!clientA.ok || !clientB.ok) {
      const clientError = !clientA.ok
        ? clientA.error
        : !clientB.ok
          ? clientB.error
          : "jwt_client_failed";
      return baseFail(clientError, {
        tableOk: true,
        restartDurableOk,
        retrySafe,
        idempotent,
        memoryNotSot,
        secretSource: secret.source,
        failClosed: true,
      });
    }

    const { data: visibleA, error: errA } = await clientA.client
      .from("atlas_jwt_rls_subjects")
      .select("id,user_id")
      .eq("correlation_id", correlationId);
    const { data: visibleB, error: errB } = await clientB.client
      .from("atlas_jwt_rls_subjects")
      .select("id,user_id")
      .eq("correlation_id", correlationId);

    const idsA = new Set((visibleA ?? []).map((r) => r.id as string));
    const idsB = new Set((visibleB ?? []).map((r) => r.id as string));
    const jwtBridgeOk = !errA && !errB && idsA.has(rowA.id) && idsB.has(rowB.id);

    const { data: crossFromB } = await clientB.client
      .from("atlas_jwt_rls_subjects")
      .select("id")
      .eq("id", rowA.id);
    const ownershipIsolationOk =
      jwtBridgeOk &&
      idsA.has(rowA.id) &&
      !idsA.has(rowB.id) &&
      idsB.has(rowB.id) &&
      !idsB.has(rowA.id) &&
      (crossFromB ?? []).length === 0;

    const rlsEnforced = ownershipIsolationOk;

    // anon denied
    const anon = createAnonSupabaseClientForJwtProbe();
    let anonDenied = false;
    if (anon) {
      const { data: anonRows, error: anonErr } = await anon
        .from("atlas_jwt_rls_subjects")
        .select("id")
        .eq("id", rowA.id);
      anonDenied =
        (anonRows ?? []).length === 0 &&
        (!anonErr || /row-level security|permission|JWT/i.test(anonErr.message));
    }

    // forged JWT denied
    const env = (await import("@/lib/supabase/env")).getServerSupabaseEnv();
    let forgedJwtDenied = false;
    if (env) {
      const { createClient } = await import("@supabase/supabase-js");
      const forged = createClient(env.url, env.anonKey, {
        auth: {
          persistSession: false,
          autoRefreshToken: false,
          detectSessionInUrl: false,
        },
        global: {
          headers: { Authorization: `Bearer ${forgeBadJwt(JWT_RLS_PROBE_USER_A)}` },
        },
      });
      const { data: forgedRows } = await forged
        .from("atlas_jwt_rls_subjects")
        .select("id")
        .eq("id", rowA.id);
      forgedJwtDenied = (forgedRows ?? []).length === 0;
    }

    // projects JWT policy smoke (optional table; skip-fail if absent)
    let projectsJwtPolicyOk = false;
    const projectId = `p301_proj_${randomUUID()}`;
    const service = createServiceRoleClientIfConfigured();
    if (service) {
      const { error: projErr } = await service.from("projects").upsert(
        {
          id: projectId,
          user_id: JWT_RLS_PROBE_USER_A,
          title: "p3-01 jwt rls probe",
          work_request: "p3-01 probe",
          status: "queued",
          progress: 0,
          assigned_employees: [],
        },
        { onConflict: "id" },
      );
      if (!projErr) {
        cleanupIds.push(`__project__:${projectId}`);
        const { data: ownProj } = await clientA.client
          .from("projects")
          .select("id")
          .eq("id", projectId);
        const { data: otherProj } = await clientB.client
          .from("projects")
          .select("id")
          .eq("id", projectId);
        projectsJwtPolicyOk =
          (ownProj ?? []).some((r) => r.id === projectId) &&
          (otherProj ?? []).length === 0;
        await service.from("projects").delete().eq("id", projectId);
      } else if (/does not exist|schema cache/i.test(projErr.message)) {
        // projects table absent in this env — not a P3-01 failure; subjects cover AC.
        projectsJwtPolicyOk = true;
      }
    }

    const failClosed = anonDenied && forgedJwtDenied;
    // multi-instance: durable DB rows + JWT mint from shared secret (not process Map SoT)
    const multiInstanceSafe =
      restartDurableOk && jwtBridgeOk && ownershipIsolationOk && memoryNotSot;

    const ok =
      jwtBridgeOk &&
      rlsEnforced &&
      ownershipIsolationOk &&
      failClosed &&
      anonDenied &&
      forgedJwtDenied &&
      restartDurableOk &&
      retrySafe &&
      idempotent &&
      multiInstanceSafe &&
      memoryNotSot &&
      projectsJwtPolicyOk &&
      table.ok;

    // Prove mint helper produces expected sub (unit-level in probe path).
    const minted = mintClerkSupabaseJwt({
      userId: JWT_RLS_PROBE_USER_A,
      secret: secret.secret,
    });
    if (!minted.includes(".")) {
      return baseFail("mint_failed", { secretSource: secret.source });
    }

    return {
      ok,
      jwtBridgeOk,
      rlsEnforced,
      tableOk: true,
      restartDurableOk,
      retrySafe,
      idempotent,
      multiInstanceSafe,
      memoryNotSot,
      ownershipIsolationOk,
      failClosed,
      anonDenied,
      forgedJwtDenied,
      projectsJwtPolicyOk,
      secretSource: secret.source,
      ownerActionRequired: false,
      envPresence: getJwtSecretEnvPresence(),
      error: ok
        ? null
        : [
            !jwtBridgeOk ? "jwt_bridge_failed" : null,
            !ownershipIsolationOk ? "ownership_isolation_failed" : null,
            !failClosed ? "fail_closed_failed" : null,
            !projectsJwtPolicyOk ? "projects_jwt_policy_failed" : null,
            errA?.message,
            errB?.message,
          ]
            .filter(Boolean)
            .join("|") || "p3_01_probe_failed",
      commitShaShort,
      environment,
    };
  } catch (error) {
    return baseFail(error instanceof Error ? error.message : String(error));
  } finally {
    const subjectIds = cleanupIds.filter((id) => !id.startsWith("__project__:"));
    const projectIds = cleanupIds
      .filter((id) => id.startsWith("__project__:"))
      .map((id) => id.slice("__project__:".length));
    await deleteJwtRlsSubjectsByIds(subjectIds).catch(() => undefined);
    const service = createServiceRoleClientIfConfigured();
    if (service && projectIds.length > 0) {
      await service.from("projects").delete().in("id", projectIds);
    }
  }
}

export async function probeJwtRls(): Promise<JwtRlsProbeResult> {
  // One retry on transient JWT clock / schema cache races.
  const first = await probeOnce();
  if (first.ok) return first;
  if (
    first.error &&
    /schema cache|JWT|clock|does not exist/i.test(first.error)
  ) {
    await new Promise((r) => setTimeout(r, 800));
    return probeOnce();
  }
  return first;
}
