import type { AcquisitionChannel } from "./constants";

export function classifyAcquisitionChannel(
  source: string | null,
  medium: string | null,
): AcquisitionChannel {
  const src = (source ?? "").toLowerCase();
  const med = (medium ?? "").toLowerCase();
  if (src === "referral" || med === "referral") return "referral";
  if (src === "tiktok") return "tiktok";
  if (src === "youtube_shorts" || src === "shorts") return "youtube_shorts";
  if (src === "youtube") return "youtube";
  if (src === "seo" || med === "content") return "seo";
  if (src === "diagnosis") return "diagnosis";
  if (src === "x") return "x";
  if (!src && !med) return "direct";
  return "unknown";
}
