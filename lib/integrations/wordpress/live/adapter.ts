/**
 * WordPress Production Live Adapter.
 * Never falls back to sandbox/mock success.
 */

import "server-only";

import { randomUUID } from "node:crypto";

import { getWordPressAuthContext } from "@/lib/integrations/wordpress/connection-service";
import { WordPressApiError } from "@/lib/integrations/wordpress/api-client";
import { touchWordPressConnectionLastUsed } from "@/lib/integrations/wordpress/connection-service";

import {
  validateWordPressConnection,
  markWordPressConnectionAuthFailure,
} from "./connection";
import {
  buildWordPressResultHash,
  findWordPressActionByIdempotency,
  saveWordPressExternalAction,
} from "./idempotency";
import {
  buildWordPressEditLink,
  resolveWordPressStepInput,
} from "./input";
import { loadWordPressMediaFromArtifacts } from "./media";
import {
  recordWordPressApprovalWait,
  recordWordPressDraftAttempt,
  recordWordPressDuplicatePrevented,
  recordWordPressFailure,
  recordWordPressMediaFailure,
  recordWordPressPublishAttempt,
  recordWordPressRetry,
  recordWordPressSuccess,
  recordWordPressUpdateAttempt,
  recordWordPressVerificationFailure,
} from "./metrics";
import {
  createAndVerifyWordPressPost,
  getWordPressPostVerified,
  publishAndVerifyWordPressPost,
  updateAndVerifyWordPressPost,
  uploadWordPressMediaVerified,
} from "./operations";
import { classifyWordPressProviderError, withWordPressRetry } from "./retry";
import {
  WORDPRESS_ADAPTER_MODE,
  type WordPressAdapterResult,
  type WordPressExternalAction,
  type WordPressLiveAction,
} from "./types";

function resolveEnvironment(): string {
  return (
    process.env.VERCEL_ENV?.trim() ||
    process.env.NODE_ENV?.trim() ||
    "development"
  );
}

function toExternalAction(input: {
  action: WordPressLiveAction;
  postId: number;
  postStatus: string;
  link: string;
  editLink: string;
  titleHash: string;
  contentHash: string;
  mediaArtifactIds: string[];
  mediaIds: number[];
  status: "verified" | "awaiting_approval";
  startedAt: string;
  completedAt: string;
  retryCount: number;
  idempotencyKey: string;
  diagnosticId: string;
  approvalId: string | null;
  duplicatePrevented?: boolean;
}): WordPressExternalAction {
  const resultHash = buildWordPressResultHash({
    action: input.action,
    postId: input.postId,
    postStatus: input.postStatus,
    link: input.link,
    titleHash: input.titleHash,
    contentHash: input.contentHash,
    mediaIds: input.mediaIds,
  });
  return {
    externalActionId: `wordpress_${randomUUID()}`,
    service: "wordpress",
    action: input.action,
    postId: input.postId,
    postStatus: input.postStatus,
    link: input.link,
    editLink: input.editLink,
    titleHash: input.titleHash,
    contentHash: input.contentHash,
    mediaArtifactIds: input.mediaArtifactIds,
    mediaIds: input.mediaIds,
    status: input.status,
    adapterMode: WORDPRESS_ADAPTER_MODE,
    environment: resolveEnvironment(),
    diagnosticId: input.diagnosticId,
    startedAt: input.startedAt,
    completedAt: input.completedAt,
    retryCount: input.retryCount,
    idempotencyKey: input.idempotencyKey,
    providerRequestId: String(input.postId),
    resultHash,
    duplicatePrevented: input.duplicatePrevented ?? false,
    approvalId: input.approvalId,
  };
}

export const wordpressLiveAdapter = {
  mode: WORDPRESS_ADAPTER_MODE,

  async validateConnection(ownerId: string) {
    return validateWordPressConnection(ownerId);
  },

  async getPost(input: { ownerId: string; postId: number }) {
    const auth = getWordPressAuthContext(input.ownerId);
    if (!auth) {
      throw new Error("wordpress not connected");
    }
    return getWordPressPostVerified({ auth, postId: input.postId });
  },

  async execute(input: {
    ownerId: string;
    organizationId?: string | null;
    runId: string;
    stepId: string;
    diagnosticId?: string | null;
    configuration: Readonly<Record<string, unknown>>;
    inputBindings: Readonly<Record<string, unknown>>;
    approved: boolean;
    approvalId?: string | null;
    occurrenceKey?: string | null;
  }): Promise<WordPressAdapterResult> {
    const startedAt = new Date().toISOString();
    const startedMs = Date.now();
    let retryCount = 0;
    let parsedAction: WordPressLiveAction = "draft";

    try {
      const connection = await this.validateConnection(input.ownerId);
      if (!connection.ready || !connection.siteUrl) {
        recordWordPressFailure();
        return {
          ok: false,
          errorCode:
            connection.health === "disconnected"
              ? "wordpress_not_connected"
              : connection.health === "auth_failure"
                ? "wordpress_auth_failed"
                : "wordpress_reconnect_required",
          errorMessage: connection.message ?? "WordPress is not ready",
          retryable: false,
          connectionHealth: connection.health,
          needsUserInput: true,
          retryCount: 0,
        };
      }

      const auth = getWordPressAuthContext(input.ownerId);
      if (!auth) {
        recordWordPressFailure();
        return {
          ok: false,
          errorCode: "wordpress_not_connected",
          errorMessage: "WordPress連携が未接続です",
          retryable: false,
          needsUserInput: true,
          retryCount: 0,
        };
      }

      let stepInput;
      try {
        stepInput = resolveWordPressStepInput({
          ownerId: input.ownerId,
          organizationId: input.organizationId,
          runId: input.runId,
          stepId: input.stepId,
          diagnosticId: input.diagnosticId,
          configuration: input.configuration,
          inputBindings: input.inputBindings,
          siteUrl: connection.siteUrl,
          occurrenceKey: input.occurrenceKey,
        });
        parsedAction = stepInput.action;
      } catch (error) {
        recordWordPressFailure();
        return {
          ok: false,
          errorCode: "wordpress_invalid_input",
          errorMessage:
            error instanceof Error ? error.message : "invalid input",
          retryable: false,
          retryCount: 0,
        };
      }

      const existing = await findWordPressActionByIdempotency({
        ownerId: input.ownerId,
        idempotencyKey: stepInput.idempotencyKey,
      });
      if (existing) {
        if (existing.status === "awaiting_approval") {
          if (!input.approved) {
            recordWordPressDuplicatePrevented();
            recordWordPressApprovalWait();
            recordWordPressDraftAttempt(Date.now() - startedMs);
            recordWordPressSuccess();
            return {
              ok: true,
              awaitingApproval: true,
              title: stepInput.title,
              action: { ...existing, duplicatePrevented: true },
            };
          }
          // approved → continue to publish path
        } else {
          const verified = await getWordPressPostVerified({
            auth,
            postId: existing.postId,
          });
          if (verified.postId !== existing.postId || !verified.link) {
            recordWordPressVerificationFailure();
            throw new Error(
              "verification failed: idempotent post not re-fetchable",
            );
          }
          recordWordPressDuplicatePrevented();
          if (existing.action === "draft") {
            recordWordPressDraftAttempt(Date.now() - startedMs);
          } else if (existing.action === "publish") {
            recordWordPressPublishAttempt(Date.now() - startedMs);
          } else {
            recordWordPressUpdateAttempt(Date.now() - startedMs);
          }
          recordWordPressSuccess();
          return {
            ok: true,
            awaitingApproval: false,
            title: stepInput.title,
            action: {
              ...existing,
              link: verified.link,
              postStatus: verified.status,
              duplicatePrevented: true,
            },
          };
        }
      }

      let featuredMediaId: number | null = null;
      const mediaArtifactIds = stepInput.featuredMediaArtifactId
        ? [stepInput.featuredMediaArtifactId]
        : [];
      const mediaIds: number[] = [];

      if (mediaArtifactIds.length > 0) {
        try {
          const mediaItems = await loadWordPressMediaFromArtifacts({
            ownerId: input.ownerId,
            artifactIds: mediaArtifactIds,
            defaultAltText: stepInput.featuredImageAlt,
          });
          const uploaded = await withWordPressRetry(async () =>
            uploadWordPressMediaVerified({
              auth,
              media: mediaItems[0]!,
            }),
          );
          retryCount = uploaded.retryCount;
          if (retryCount > 0) {
            for (let i = 0; i < retryCount; i += 1) recordWordPressRetry();
          }
          featuredMediaId = uploaded.value.mediaId;
          mediaIds.push(uploaded.value.mediaId);
        } catch (error) {
          recordWordPressMediaFailure();
          recordWordPressFailure();
          return {
            ok: false,
            errorCode: "wordpress_media_failed",
            errorMessage:
              error instanceof Error ? error.message : "media failed",
            retryable: false,
            retryCount: 0,
          };
        }
      }

      const wantsPublish = stepInput.action === "publish";

      if (wantsPublish && stepInput.approvalRequired && !input.approved) {
        const retried = await withWordPressRetry(async () =>
          createAndVerifyWordPressPost({
            auth,
            title: stepInput.title,
            content: stepInput.content,
            status: "draft",
            excerpt: stepInput.excerpt,
            categories: stepInput.categories,
            tags: stepInput.tags,
            featuredMediaId,
          }),
        );
        retryCount = retried.retryCount;
        if (retryCount > 0) {
          for (let i = 0; i < retryCount; i += 1) recordWordPressRetry();
        }
        const draft = retried.value;
        const action = toExternalAction({
          action: "draft",
          postId: draft.postId,
          postStatus: draft.status,
          link: draft.link,
          editLink: buildWordPressEditLink(stepInput.siteUrl, draft.postId),
          titleHash: draft.titleHash,
          contentHash: draft.contentHash,
          mediaArtifactIds,
          mediaIds,
          status: "awaiting_approval",
          startedAt,
          completedAt: new Date().toISOString(),
          retryCount,
          idempotencyKey: stepInput.idempotencyKey.replace(/^publish:/, "draft:"),
          diagnosticId: stepInput.diagnosticId,
          approvalId: null,
        });
        const awaiting = {
          ...action,
          action: stepInput.action,
          status: "awaiting_approval" as const,
          idempotencyKey: stepInput.idempotencyKey,
        };
        await saveWordPressExternalAction({
          ...awaiting,
          ownerId: input.ownerId,
          organizationId: input.organizationId ?? null,
          runId: input.runId,
          stepId: input.stepId,
        });
        recordWordPressDraftAttempt(Date.now() - startedMs);
        recordWordPressApprovalWait();
        recordWordPressSuccess();
        return {
          ok: true,
          awaitingApproval: true,
          title: stepInput.title,
          action: awaiting,
        };
      }

      if (stepInput.action === "draft") {
        const retried = await withWordPressRetry(async () =>
          createAndVerifyWordPressPost({
            auth,
            title: stepInput.title,
            content: stepInput.content,
            status: "draft",
            excerpt: stepInput.excerpt,
            categories: stepInput.categories,
            tags: stepInput.tags,
            featuredMediaId,
          }),
        );
        retryCount = retried.retryCount;
        if (retryCount > 0) {
          for (let i = 0; i < retryCount; i += 1) recordWordPressRetry();
        }
        const draft = retried.value;
        const action = toExternalAction({
          action: "draft",
          postId: draft.postId,
          postStatus: draft.status,
          link: draft.link,
          editLink: buildWordPressEditLink(stepInput.siteUrl, draft.postId),
          titleHash: draft.titleHash,
          contentHash: draft.contentHash,
          mediaArtifactIds,
          mediaIds,
          status: "verified",
          startedAt,
          completedAt: new Date().toISOString(),
          retryCount,
          idempotencyKey: stepInput.idempotencyKey,
          diagnosticId: stepInput.diagnosticId,
          approvalId: input.approvalId ?? null,
        });
        await saveWordPressExternalAction({
          ...action,
          ownerId: input.ownerId,
          organizationId: input.organizationId ?? null,
          runId: input.runId,
          stepId: input.stepId,
        });
        await touchWordPressConnectionLastUsed(input.ownerId);
        recordWordPressDraftAttempt(Date.now() - startedMs);
        recordWordPressSuccess();
        return {
          ok: true,
          awaitingApproval: false,
          title: stepInput.title,
          action,
        };
      }

      if (stepInput.action === "update") {
        const retried = await withWordPressRetry(async () =>
          updateAndVerifyWordPressPost({
            auth,
            postId: stepInput.postId!,
            title: stepInput.title,
            content: stepInput.content,
            status: "draft",
            excerpt: stepInput.excerpt,
            categories: stepInput.categories,
            tags: stepInput.tags,
            featuredMediaId,
          }),
        );
        retryCount = retried.retryCount;
        if (retryCount > 0) {
          for (let i = 0; i < retryCount; i += 1) recordWordPressRetry();
        }
        const updated = retried.value;
        const action = toExternalAction({
          action: "update",
          postId: updated.postId,
          postStatus: updated.status,
          link: updated.link,
          editLink: buildWordPressEditLink(stepInput.siteUrl, updated.postId),
          titleHash: updated.titleHash,
          contentHash: updated.contentHash,
          mediaArtifactIds,
          mediaIds,
          status: "verified",
          startedAt,
          completedAt: new Date().toISOString(),
          retryCount,
          idempotencyKey: stepInput.idempotencyKey,
          diagnosticId: stepInput.diagnosticId,
          approvalId: input.approvalId ?? null,
        });
        await saveWordPressExternalAction({
          ...action,
          ownerId: input.ownerId,
          organizationId: input.organizationId ?? null,
          runId: input.runId,
          stepId: input.stepId,
        });
        await touchWordPressConnectionLastUsed(input.ownerId);
        recordWordPressUpdateAttempt(Date.now() - startedMs);
        recordWordPressSuccess();
        return {
          ok: true,
          awaitingApproval: false,
          title: stepInput.title,
          action,
        };
      }

      // Approved publish path
      const priorAwaiting = await findWordPressActionByIdempotency({
        ownerId: input.ownerId,
        idempotencyKey: stepInput.idempotencyKey,
      });
      if (
        priorAwaiting?.postId &&
        priorAwaiting.status === "awaiting_approval" &&
        input.approved
      ) {
        const retried = await withWordPressRetry(async () =>
          publishAndVerifyWordPressPost({
            auth,
            postId: priorAwaiting.postId,
            title: stepInput.title,
            content: stepInput.content,
          }),
        );
        retryCount = retried.retryCount;
        if (retryCount > 0) {
          for (let i = 0; i < retryCount; i += 1) recordWordPressRetry();
        }
        const published = retried.value;
        const action = toExternalAction({
          action: "publish",
          postId: published.postId,
          postStatus: published.status,
          link: published.link,
          editLink: buildWordPressEditLink(stepInput.siteUrl, published.postId),
          titleHash: published.titleHash,
          contentHash: published.contentHash,
          mediaArtifactIds: priorAwaiting.mediaArtifactIds,
          mediaIds: priorAwaiting.mediaIds,
          status: "verified",
          startedAt,
          completedAt: new Date().toISOString(),
          retryCount,
          idempotencyKey: stepInput.idempotencyKey,
          diagnosticId: stepInput.diagnosticId,
          approvalId: input.approvalId ?? null,
        });
        await saveWordPressExternalAction({
          ...action,
          ownerId: input.ownerId,
          organizationId: input.organizationId ?? null,
          runId: input.runId,
          stepId: input.stepId,
        });
        await touchWordPressConnectionLastUsed(input.ownerId);
        recordWordPressPublishAttempt(Date.now() - startedMs);
        recordWordPressSuccess();
        return {
          ok: true,
          awaitingApproval: false,
          title: stepInput.title,
          action,
        };
      }

      if (!input.approved) {
        recordWordPressFailure();
        return {
          ok: false,
          errorCode: "wordpress_approval_required",
          errorMessage: "WordPress公開は承認後のみ実行できます",
          retryable: false,
          needsUserInput: true,
          retryCount: 0,
        };
      }

      const retried = await withWordPressRetry(async () =>
        createAndVerifyWordPressPost({
          auth,
          title: stepInput.title,
          content: stepInput.content,
          status: "publish",
          excerpt: stepInput.excerpt,
          categories: stepInput.categories,
          tags: stepInput.tags,
          featuredMediaId,
        }),
      );
      retryCount = retried.retryCount;
      if (retryCount > 0) {
        for (let i = 0; i < retryCount; i += 1) recordWordPressRetry();
      }
      const published = retried.value;
      const action = toExternalAction({
        action: "publish",
        postId: published.postId,
        postStatus: published.status,
        link: published.link,
        editLink: buildWordPressEditLink(stepInput.siteUrl, published.postId),
        titleHash: published.titleHash,
        contentHash: published.contentHash,
        mediaArtifactIds,
        mediaIds,
        status: "verified",
        startedAt,
        completedAt: new Date().toISOString(),
        retryCount,
        idempotencyKey: stepInput.idempotencyKey,
        diagnosticId: stepInput.diagnosticId,
        approvalId: input.approvalId ?? null,
      });
      await saveWordPressExternalAction({
        ...action,
        ownerId: input.ownerId,
        organizationId: input.organizationId ?? null,
        runId: input.runId,
        stepId: input.stepId,
      });
      await touchWordPressConnectionLastUsed(input.ownerId);
      recordWordPressPublishAttempt(Date.now() - startedMs);
      recordWordPressSuccess();
      return {
        ok: true,
        awaitingApproval: false,
        title: stepInput.title,
        action,
      };
    } catch (error) {
      if (error instanceof WordPressApiError && error.isAuthFailure) {
        await markWordPressConnectionAuthFailure(input.ownerId);
      }
      const classified = classifyWordPressProviderError(error);
      if (/verification failed/i.test(
        error instanceof Error ? error.message : String(error),
      )) {
        recordWordPressVerificationFailure();
      }
      if (parsedAction === "draft") {
        recordWordPressDraftAttempt(Date.now() - startedMs);
      } else if (parsedAction === "publish") {
        recordWordPressPublishAttempt(Date.now() - startedMs);
      } else {
        recordWordPressUpdateAttempt(Date.now() - startedMs);
      }
      recordWordPressFailure();
      return {
        ok: false,
        errorCode: classified.errorCode,
        errorMessage:
          error instanceof Error ? error.message : "WordPress operation failed",
        retryable: classified.retryable,
        retryCount,
      };
    }
  },
};
