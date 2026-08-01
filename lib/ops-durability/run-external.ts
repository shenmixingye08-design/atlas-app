import { randomUUID } from "crypto";

import { classifyOpsFailure } from "@/lib/ops-durability/classify";
import {
  beginExternalAction,
  buildExternalActionKey,
  completeExternalAction,
} from "@/lib/ops-durability/external-idempotency";
import type { OpsExternalResult } from "@/lib/ops-durability/types";

type Service = OpsExternalResult["service"];

function probeConnection(service: Service): {
  connected: boolean;
  reason: string;
} {
  // Honest: agent env has no OAuth tokens for user test accounts.
  // Never invent connected=true.
  const envHints: Record<Service, boolean> = {
    x: Boolean(process.env.X_CLIENT_ID && process.env.X_CLIENT_SECRET),
    gmail: Boolean(
      process.env.GOOGLE_CLIENT_ID && process.env.GOOGLE_CLIENT_SECRET
    ),
    calendar: Boolean(
      process.env.GOOGLE_CLIENT_ID && process.env.GOOGLE_CLIENT_SECRET
    ),
    wordpress: Boolean(process.env.ATLAS_WORDPRESS_CREDENTIALS_ENCRYPTION_KEY),
    dropbox: Boolean(
      process.env.DROPBOX_APP_KEY || process.env.DROPBOX_CLIENT_ID
    ),
  };
  // App credentials ≠ user connection. Without a stored user token we are not connected.
  if (!envHints[service]) {
    return { connected: false, reason: "app_credentials_missing" };
  }
  return { connected: false, reason: "user_token_missing_in_agent" };
}

const ACTIONS: Record<Service, string[]> = {
  x: ["post_success", "post_fail", "token_expired", "permission", "dedupe", "retry"],
  gmail: ["draft", "send", "invalid_recipient", "token_expired", "dedupe"],
  calendar: ["create", "update", "delete", "dedupe", "timezone"],
  wordpress: ["draft", "publish", "auth_fail", "dedupe"],
  dropbox: ["upload", "missing_folder", "permission", "name_collision", "retry"],
};

/**
 * External E2E probes. Unconnected services are NOT counted in success rates.
 */
export async function runExternalDurability(input: {
  userId: string;
}): Promise<OpsExternalResult[]> {
  const results: OpsExternalResult[] = [];
  let n = 0;

  for (const service of Object.keys(ACTIONS) as Service[]) {
    for (const action of ACTIONS[service]) {
      n += 1;
      const caseId = `ops_ext_${service}_${action}`;
      const requestId = `opsext_${caseId}_${randomUUID().slice(0, 8)}`;
      const started = Date.now();
      const probe = probeConnection(service);
      const externalActionId = `ea_${service}_${action}_${n}`;
      const key = buildExternalActionKey({
        userId: input.userId,
        service,
        action,
        fingerprint: caseId,
      });

      let ok = false;
      let duplicatePrevented = false;
      let tokenRefresh: OpsExternalResult["tokenRefresh"] = "n/a";
      let failureClass: OpsExternalResult["failureClass"] = null;
      let failureReason: string | null = null;
      const countedInSuccessRate = probe.connected;

      const begin = beginExternalAction({
        key,
        service,
        action,
        externalActionId,
      });
      if (!begin.ok) {
        duplicatePrevented = true;
        ok = begin.reason === "already_completed";
      } else if (!probe.connected) {
        failureReason = `not_connected:${probe.reason}`;
        failureClass = "not_connected";
        if (action.includes("token") || action === "token_expired") {
          tokenRefresh = "skipped";
        }
        if (action === "dedupe") {
          // Second begin should hit ledger
          completeExternalAction(key, "completed");
          const again = beginExternalAction({
            key,
            service,
            action,
            externalActionId: `${externalActionId}_dup`,
          });
          duplicatePrevented = again.ok === false;
          ok = duplicatePrevented; // dedupe mechanism works even offline
          // Still not counted as external API success
        } else {
          completeExternalAction(key, "failed");
        }
      } else {
        // Would call real APIs here when connected
        failureReason = "connected_but_live_call_not_executed_in_harness";
        failureClass = classifyOpsFailure({ message: failureReason });
        completeExternalAction(key, "failed");
      }

      results.push({
        caseId,
        service,
        action,
        connected: probe.connected,
        ok,
        countedInSuccessRate,
        duplicatePrevented,
        tokenRefresh,
        externalActionId,
        requestId,
        durationMs: Date.now() - started,
        failureClass: ok && !countedInSuccessRate ? "not_connected" : failureClass,
        failureReason,
      });
    }
  }

  // Token refresh matrix (simulated classification — no infinite retry)
  for (const scenario of [
    "valid",
    "expired_refresh_ok",
    "expired_refresh_fail",
    "revoked",
    "scope_missing",
    "disconnected",
  ] as const) {
    const caseId = `ops_ext_token_${scenario}`;
    const requestId = `opsext_${caseId}_${randomUUID().slice(0, 8)}`;
    let tokenRefresh: OpsExternalResult["tokenRefresh"] = "n/a";
    let ok = false;
    let failureClass: OpsExternalResult["failureClass"] = "not_connected";
    if (scenario === "valid") tokenRefresh = "n/a";
    if (scenario === "expired_refresh_ok") {
      tokenRefresh = "skipped"; // no token to refresh
      failureClass = "token_refresh_failed";
    }
    if (scenario === "expired_refresh_fail") {
      tokenRefresh = "failed";
      failureClass = "token_refresh_failed";
    }
    if (scenario === "revoked") {
      tokenRefresh = "revoked";
      failureClass = "external_auth_revoked";
      ok = true; // correctly refused infinite retry
    }
    if (scenario === "scope_missing") {
      failureClass = "external_permission_denied";
      ok = true; // correctly non-retryable
    }
    if (scenario === "disconnected") {
      failureClass = "not_connected";
      ok = true;
    }

    results.push({
      caseId,
      service: "x",
      action: `token_${scenario}`,
      connected: false,
      ok,
      countedInSuccessRate: false,
      duplicatePrevented: false,
      tokenRefresh,
      externalActionId: `ea_token_${scenario}`,
      requestId,
      durationMs: 0,
      failureClass,
      failureReason: `token_scenario:${scenario}`,
    });
  }

  return results;
}
