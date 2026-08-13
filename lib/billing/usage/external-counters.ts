import { incrementUsageCounterOnce } from "./store";
import { tweetContainsExternalUrl } from "./x-url";

/**
 * Count a successful X post once per provider tweet id (retry-safe).
 * URL posts consume both the total X counter and the URL sub-quota.
 */
export function recordXPostUsageOnce(input: {
  userId: string;
  tweetId: string;
  text: string;
}): { snsIncremented: boolean; urlIncremented: boolean } {
  const tweetId = input.tweetId.trim();
  if (!tweetId) {
    return { snsIncremented: false, urlIncremented: false };
  }

  const sns = incrementUsageCounterOnce(
    input.userId,
    "snsPosts",
    `x:${tweetId}`,
  );
  let urlIncremented = false;
  if (tweetContainsExternalUrl(input.text)) {
    urlIncremented = incrementUsageCounterOnce(
      input.userId,
      "xUrlPosts",
      `xurl:${tweetId}`,
    ).incremented;
  }

  return {
    snsIncremented: sns.incremented,
    urlIncremented,
  };
}

/** Count a successful WordPress publish once per provider post id. */
export function recordWordPressPublishUsageOnce(input: {
  userId: string;
  postId: string | number;
}): { incremented: boolean } {
  const postId = String(input.postId).trim();
  if (!postId) return { incremented: false };
  return incrementUsageCounterOnce(
    input.userId,
    "wordpressPosts",
    `wp:${postId}`,
  );
}
