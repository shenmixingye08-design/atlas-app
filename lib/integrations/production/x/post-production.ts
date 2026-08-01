import "server-only";

import { createTweet } from "@/lib/integrations/x/post/api-client";
import { validateTweetText } from "@/lib/integrations/x/post/validate";
import { buildIdempotencyKey } from "@/lib/integrations/production/idempotency";
import { runIntegrationAction } from "@/lib/integrations/production/execute";
import { uploadXImageMedia } from "@/lib/integrations/production/x/media";
import { normalizeTweetText } from "@/lib/integrations/production/x/text-normalize";

export type ProductionXPostInput = {
  userId: string;
  accessToken: string;
  text: string;
  media?: {
    buffer: Buffer;
    mimeType: string;
  };
  requestId?: string;
};

export type ProductionXPostValue = {
  tweetId: string;
  text: string;
  mediaId?: string;
  normalizedText: string;
};

/**
 * Production X post: normalize newlines/URL/hashtags, optional image,
 * durable idempotency, retry/audit via runIntegrationAction.
 */
export async function postTweetProduction(
  input: ProductionXPostInput,
): Promise<{
  value: ProductionXPostValue;
  request_id: string;
  diagnosticId: string;
  duplicate: boolean;
  retry: number;
}> {
  const normalizedText = normalizeTweetText(input.text);
  const validation = validateTweetText(normalizedText);
  if (validation.errors.length > 0) {
    throw new Error(validation.errors.join("; "));
  }

  const mediaFingerprint = input.media
    ? `${input.media.mimeType}:${input.media.buffer.length}:${input.media.buffer.subarray(0, 32).toString("hex")}`
    : "";
  const idempotencyKey = buildIdempotencyKey({
    integration: "x",
    action: "post",
    userId: input.userId,
    fingerprint: `${normalizedText}|${mediaFingerprint}`,
  });

  const executed = await runIntegrationAction(
    {
      integration: "x",
      action: input.media ? "post_with_media" : "post",
      userId: input.userId,
      idempotencyKey,
      requestId: input.requestId,
      preventDuplicate: true,
    },
    async () => {
      let mediaId: string | undefined;
      if (input.media) {
        const uploaded = await uploadXImageMedia({
          accessToken: input.accessToken,
          buffer: input.media.buffer,
          mimeType: input.media.mimeType,
        });
        mediaId = uploaded.mediaId;
      }

      const tweet = await createTweet({
        accessToken: input.accessToken,
        text: normalizedText,
        mediaIds: mediaId ? [mediaId] : undefined,
      });

      return {
        tweetId: tweet.tweetId,
        text: tweet.text,
        mediaId,
        normalizedText,
      } satisfies ProductionXPostValue;
    },
  );

  return {
    value: executed.value,
    request_id: executed.request_id,
    diagnosticId: executed.diagnosticId,
    duplicate: executed.duplicate,
    retry: executed.retry,
  };
}
