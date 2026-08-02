/**
 * Sandbox adapter for measured 100-call benchmarks and CI.
 * Never reports proofKind:"live". Mock success cannot pass Fail Closed gates
 * that require live/sandbox verified proof with IDs/URLs.
 */

import type { IntegrationAdapter } from "@/lib/integration-platform/adapter";
import {
  SERVICE_CATALOG,
  upsertConnection,
} from "@/lib/integration-platform/connection-manager";
import {
  IntegrationHttpError,
  executeWithRetryPolicy,
} from "@/lib/integration-platform/retry-policy";
import {
  markTokenUsed,
  upsertTokenRecord,
} from "@/lib/integration-platform/token-store";
import {
  sha256Buffer,
  uploadVerificationOk,
  verifyUploadRoundTrip,
} from "@/lib/integration-platform/upload-verify";
import {
  postVerificationOk,
  verifyWordPressPost,
  verifyXPost,
} from "@/lib/integration-platform/post-verify";
import type {
  ConnectionRecord,
  ExecuteInput,
  ExecuteResult,
  IntegrationServiceId,
  TokenRecord,
} from "@/lib/integration-platform/types";

export type SandboxScenario = {
  /** Deterministic failure schedule by attempt index (1-based absolute call #) */
  failOnCalls?: number[];
  failStatus?: number;
  baseLatencyMs?: number;
};

const uploaded = new Map<string, Buffer>();

export function createSandboxAdapter(
  serviceId: IntegrationServiceId,
  scenario: SandboxScenario = {},
): IntegrationAdapter {
  let callCount = 0;
  const catalog = SERVICE_CATALOG[serviceId];

  return {
    serviceId,

    async connect(ownerId) {
      upsertTokenRecord({
        ownerId,
        serviceId,
        accessTokenEnc: `sandbox-access-${ownerId}`,
        refreshTokenEnc: `sandbox-refresh-${ownerId}`,
        expiresAt: new Date(Date.now() + 3600_000).toISOString(),
        scopes: ["sandbox"],
        lastUsedAt: null,
        failureCount: 0,
      });
      return upsertConnection({
        ownerId,
        serviceId,
        status: "CONNECTED",
        statusMessage: "sandbox connected",
        scopes: ["sandbox"],
        lastValidatedAt: new Date().toISOString(),
        lastSuccessAt: new Date().toISOString(),
        lastFailureAt: null,
        failureCount: 0,
        implementationClass: catalog.implementationClass,
        metadata: { sandbox: true },
      });
    },

    async disconnect(ownerId) {
      return upsertConnection({
        ownerId,
        serviceId,
        status: "DISABLED",
        statusMessage: "sandbox disconnected",
        scopes: [],
        lastValidatedAt: new Date().toISOString(),
        lastSuccessAt: null,
        lastFailureAt: null,
        failureCount: 0,
        implementationClass: catalog.implementationClass,
        metadata: { sandbox: true },
      });
    },

    async refreshToken(ownerId): Promise<TokenRecord | null> {
      return upsertTokenRecord({
        ownerId,
        serviceId,
        accessTokenEnc: `sandbox-access-rotated-${Date.now()}`,
        refreshTokenEnc: `sandbox-refresh-${ownerId}`,
        expiresAt: new Date(Date.now() + 3600_000).toISOString(),
        scopes: ["sandbox"],
        lastUsedAt: new Date().toISOString(),
        failureCount: 0,
      });
    },

    async validate(ownerId) {
      return {
        status: "CONNECTED",
        message: `sandbox ok for ${ownerId}`,
      };
    },

    async execute(input: ExecuteInput): Promise<ExecuteResult> {
      const started = Date.now();
      try {
        const outcome = await executeWithRetryPolicy(
          async () => {
            callCount += 1;
            const latency = scenario.baseLatencyMs ?? 5;
            await new Promise((r) => setTimeout(r, latency));
            if (scenario.failOnCalls?.includes(callCount)) {
              throw new IntegrationHttpError(
                scenario.failStatus ?? 503,
                `sandbox forced failure #${callCount}`,
              );
            }
            return runSandboxAction(serviceId, input);
          },
          { maxAttempts: 3, baseDelayMs: 1, label: `${serviceId}.execute` },
        );

        markTokenUsed(input.ownerId, serviceId, true);
        return {
          ...outcome.value,
          attempts: outcome.attempts,
          retried: outcome.retried,
          durationMs: Date.now() - started,
        };
      } catch (error) {
        markTokenUsed(input.ownerId, serviceId, false);
        return {
          ok: false,
          serviceId,
          action: input.action,
          externalId: null,
          externalUrl: null,
          verified: false,
          attempts: 1,
          retried: false,
          durationMs: Date.now() - started,
          errorCode:
            error instanceof IntegrationHttpError
              ? String(error.statusCode)
              : "error",
          errorMessage:
            error instanceof Error ? error.message : "sandbox execute failed",
          proofKind: "sandbox",
        };
      }
    },

    async rollback(input) {
      uploaded.delete(`${input.ownerId}:${input.externalId}`);
      return { ok: true, message: "sandbox rollback" };
    },

    async health() {
      const started = Date.now();
      return {
        ok: true,
        status: "CONNECTED",
        latencyMs: Date.now() - started,
        detail: "sandbox",
      };
    },
  };
}

async function runSandboxAction(
  serviceId: IntegrationServiceId,
  input: ExecuteInput,
): Promise<Omit<ExecuteResult, "attempts" | "retried" | "durationMs">> {
  if (
    input.action === "upload" ||
    input.action === "upload_file" ||
    input.action === "drive_upload" ||
    input.action === "dropbox_upload"
  ) {
    const buffer = Buffer.isBuffer(input.payload.buffer)
      ? input.payload.buffer
      : Buffer.from(String(input.payload.content ?? "atlas-sandbox"), "utf8");
    const id = `sbx_${serviceId}_${sha256Buffer(buffer).slice(0, 12)}`;
    const url = `https://sandbox.atlas.local/${serviceId}/${id}`;
    uploaded.set(`${input.ownerId}:${id}`, buffer);
    const downloaded = uploaded.get(`${input.ownerId}:${id}`) ?? null;
    const verification = verifyUploadRoundTrip({
      original: buffer,
      downloaded,
      externalId: id,
      externalUrl: url,
      remoteMetadata: {
        id,
        name: String(input.payload.fileName ?? "file.bin"),
        expectedName: String(input.payload.fileName ?? "file.bin"),
        size: buffer.byteLength,
      },
    });
    const ok = uploadVerificationOk(verification);
    return {
      ok,
      serviceId,
      action: input.action,
      externalId: id,
      externalUrl: url,
      verified: ok,
      checksum: verification.checksumSha256,
      errorCode: ok ? null : "upload_verify_failed",
      errorMessage: ok ? null : "upload verification failed",
      proofKind: "sandbox",
    };
  }

  if (input.action === "wordpress_post" || serviceId === "wordpress") {
    if (input.action === "health") {
      /* fallthrough */
    } else {
      const postId = `wp_${Date.now()}`;
      const link = `https://sandbox.example.com/?p=${postId}`;
      const verification = verifyWordPressPost({
        postId,
        link,
        status: "publish",
        fetched: { id: postId, link, status: "publish" },
      });
      const ok = postVerificationOk(verification);
      return {
        ok,
        serviceId,
        action: input.action,
        externalId: postId,
        externalUrl: link,
        verified: ok,
        errorCode: null,
        errorMessage: null,
        proofKind: "sandbox",
      };
    }
  }

  if (input.action === "x_post" || (serviceId === "x" && input.action === "post")) {
    const tweetId = `${Date.now()}`;
    const tweetUrl = `https://x.com/i/status/${tweetId}`;
    const verification = verifyXPost({
      tweetId,
      tweetUrl,
      fetchedExists: true,
    });
    const ok = postVerificationOk(verification);
    return {
      ok,
      serviceId,
      action: input.action,
      externalId: tweetId,
      externalUrl: tweetUrl,
      verified: ok,
      errorCode: null,
      errorMessage: null,
      proofKind: "sandbox",
    };
  }

  if (
    input.action === "send_email" ||
    (serviceId === "gmail" && input.action !== "upload")
  ) {
    const id = `gmail_${Date.now()}`;
    return {
      ok: true,
      serviceId,
      action: input.action,
      externalId: id,
      externalUrl: `https://mail.google.com/mail/u/0/#sent/${id}`,
      verified: true,
      errorCode: null,
      errorMessage: null,
      proofKind: "sandbox",
    };
  }

  if (
    input.action === "calendar_event" ||
    serviceId === "google_calendar"
  ) {
    const id = `gcal_${Date.now()}`;
    return {
      ok: true,
      serviceId,
      action: input.action,
      externalId: id,
      externalUrl: `https://calendar.google.com/calendar/event?eid=${id}`,
      verified: true,
      errorCode: null,
      errorMessage: null,
      proofKind: "sandbox",
    };
  }

  if (input.action === "line_push" || serviceId === "line") {
    const id = `line_${Date.now()}`;
    return {
      ok: true,
      serviceId,
      action: input.action,
      externalId: id,
      externalUrl: `https://atlasapp.jp/results/line/${id}`,
      verified: true,
      errorCode: null,
      errorMessage: null,
      proofKind: "sandbox",
    };
  }

  // Generic validated no-op for unwired services — not verified live proof
  return {
    ok: false,
    serviceId,
    action: input.action,
    externalId: null,
    externalUrl: null,
    verified: false,
    errorCode: "unsupported_action",
    errorMessage: `sandbox action unsupported: ${input.action}`,
    proofKind: "sandbox",
  };
}

export function createConnectionRecordStub(
  ownerId: string,
  serviceId: IntegrationServiceId,
): ConnectionRecord {
  return {
    ownerId,
    serviceId,
    status: "DISCONNECTED",
    statusMessage: null,
    scopes: [],
    lastValidatedAt: null,
    lastSuccessAt: null,
    lastFailureAt: null,
    failureCount: 0,
    implementationClass: SERVICE_CATALOG[serviceId].implementationClass,
    metadata: {},
    updatedAt: new Date().toISOString(),
  };
}
