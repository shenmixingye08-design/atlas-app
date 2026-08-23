import { incrementDurableUsageOnce } from "./durable-counters";
import { tweetContainsExternalUrl } from "./x-url";

/**
 * Count a successful X post once per provider tweet id (retry-safe).
 * URL posts consume both the total X counter and the URL sub-quota.
 */
export async function recordXPostUsageOnce(input: {
  userId: string;
  tweetId: string;
  text: string;
}): Promise<{ snsIncremented: boolean; urlIncremented: boolean }> {
  const tweetId = input.tweetId.trim();
  if (!tweetId) {
    return { snsIncremented: false, urlIncremented: false };
  }

  const sns = await incrementDurableUsageOnce({
    userId: input.userId,
    meter: "sns_posts",
    claimKey: `x:${tweetId}`,
  });
  let urlIncremented = false;
  if (tweetContainsExternalUrl(input.text)) {
    const url = await incrementDurableUsageOnce({
      userId: input.userId,
      meter: "x_url_posts",
      claimKey: `xurl:${tweetId}`,
    });
    urlIncremented = url.incremented;
  }

  return {
    snsIncremented: sns.incremented,
    urlIncremented,
  };
}

/** Count a successful WordPress publish once per provider post id. */
export async function recordWordPressPublishUsageOnce(input: {
  userId: string;
  postId: string | number;
}): Promise<{ incremented: boolean }> {
  const postId = String(input.postId).trim();
  if (!postId) return { incremented: false };
  const result = await incrementDurableUsageOnce({
    userId: input.userId,
    meter: "wordpress_posts",
    claimKey: `wp:${postId}`,
  });
  return { incremented: result.incremented };
}
