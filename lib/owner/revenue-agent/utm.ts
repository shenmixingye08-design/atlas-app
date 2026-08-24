import { REVENUE_AGENT_CAMPAIGN } from "./defaults";
import type { RevenueContentKind, RevenuePlatform } from "./types";

export function buildRevenueUtmUrl(input: {
  lpUrl: string;
  platform: RevenuePlatform;
  kind: RevenueContentKind;
  contentId: string;
}): string {
  let url: URL;
  try {
    url = new URL(input.lpUrl);
  } catch {
    url = new URL("https://minervot.com/");
  }
  url.searchParams.set("utm_source", input.platform);
  url.searchParams.set(
    "utm_medium",
    input.kind === "short_video" ? "video" : "social",
  );
  url.searchParams.set("utm_campaign", REVENUE_AGENT_CAMPAIGN);
  url.searchParams.set("utm_content", input.contentId);
  return url.toString();
}
