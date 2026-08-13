/**
 * Detects an external URL in post body text.
 * Counts http(s) links and www. hosts — the X URL quota is for posts that
 * actually include an outbound URL.
 */
const EXTERNAL_URL_RE = /(?:https?:\/\/|www\.)[^\s<>"']+/i;

export function tweetContainsExternalUrl(text: string): boolean {
  return EXTERNAL_URL_RE.test(text.trim());
}
