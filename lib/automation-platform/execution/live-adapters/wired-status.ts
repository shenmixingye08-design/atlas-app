/**
 * Wired-status SoT without server-only — safe for activation validation / tests.
 */

import type { LiveAdapterId } from "@/lib/automation-platform/execution/live-adapters/types";

/** Adapters with a real production call path (or internal engine path). */
export const WIRED_LIVE_ADAPTER_IDS: ReadonlySet<LiveAdapterId> = new Set([
  "atlas_deliverable_word",
  "atlas_deliverable_excel",
  "atlas_deliverable_pdf",
  "atlas_deliverable_powerpoint",
  "openai_vision",
  "openai_vision_ocr",
  "google_gmail",
  "google_drive",
  "google_calendar",
  "dropbox",
  "x",
  "wordpress",
  "line",
  // slack / discord / notion intentionally NOT wired
]);

export function isLiveAdapterWired(adapterId: string | null): boolean {
  if (!adapterId) return true;
  return WIRED_LIVE_ADAPTER_IDS.has(adapterId as LiveAdapterId);
}
