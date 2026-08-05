import "server-only";

import type { FeatureAccessContext } from "@/lib/feature-flags/types";
import {
  createWordPressPostForUser,
  updateWordPressPostForUser,
} from "@/lib/integrations/wordpress/post/service";
import type {
  WordPressPostPayload,
  WordPressPostResult,
} from "@/lib/integrations/wordpress/types";
import {
  createIntegrationDiagnosticId,
  createIntegrationRequestId,
  recordIntegrationAudit,
} from "@/lib/integrations/production/audit";

/**
 * Production WordPress entry — delegates to service (idempotency/retry/audit
 * already applied there) and emits a top-level audit row for operators.
 */
export async function publishWordPressProduction(input: {
  userId: string;
  context: FeatureAccessContext;
  payload: WordPressPostPayload;
  postId?: number;
  requestId?: string;
}): Promise<{
  value: WordPressPostResult;
  request_id: string;
  diagnosticId: string;
  duplicate: boolean;
  retry: number;
}> {
  const request_id = input.requestId ?? createIntegrationRequestId();
  const action = input.postId
    ? "update"
    : input.payload.status === "publish"
      ? "publish"
      : "draft";
  const diagnosticId = createIntegrationDiagnosticId({
    integration: "wordpress",
    action,
    requestId: request_id,
  });
  const started = Date.now();

  const value = input.postId
    ? await updateWordPressPostForUser({
        userId: input.userId,
        context: input.context,
        postId: input.postId,
        payload: input.payload,
      })
    : await createWordPressPostForUser({
        userId: input.userId,
        context: input.context,
        payload: input.payload,
      });

  const durationMs = Date.now() - started;
  const ok =
    value.status === "posted" ||
    value.status === "draft_saved" ||
    value.status === "updated";

  recordIntegrationAudit({
    request_id,
    diagnosticId,
    integration: "wordpress",
    action,
    result: ok ? "success" : "error",
    retry: 0,
    durationMs,
    userId: input.userId,
    message: value.message,
  });

  return {
    value,
    request_id,
    diagnosticId,
    duplicate: false,
    retry: 0,
  };
}
