/**
 * Emit day7 / day30 / automation_rate retention snapshots once per session.
 */

import {
  computeRetentionFlags,
  getFirstValueFunnelState,
  trackFirstValueEvent,
} from "./analytics";
import { listFirstValueMeasured } from "./measured";

const SESSION_KEY = "atlas.firstValue.retentionEmitted.v1";

export function maybeEmitRetentionSnapshots(input?: {
  automationCount?: number;
  successRate?: number | null;
}): void {
  if (typeof window === "undefined") return;
  try {
    if (window.sessionStorage.getItem(SESSION_KEY) === "1") return;
    const flags = computeRetentionFlags();
    const funnel = getFirstValueFunnelState();
    if (flags.day7) {
      trackFirstValueEvent("day7_active", {
        registeredAt: funnel.registeredAt,
      });
    }
    if (flags.day30) {
      trackFirstValueEvent("day30_active", {
        registeredAt: funnel.registeredAt,
      });
    }
    const measured = listFirstValueMeasured();
    trackFirstValueEvent("automation_rate_snapshot", {
      automationCount: input?.automationCount ?? null,
      firstValueJobs: measured.length,
      successRate: input?.successRate ?? null,
    });
    trackFirstValueEvent("retention_snapshot", {
      day7: flags.day7,
      day30: flags.day30,
      hasFirstDeliverable: Boolean(funnel.firstDeliverableAt),
      hasFirstDownload: Boolean(funnel.firstDownloadAt),
    });
    window.sessionStorage.setItem(SESSION_KEY, "1");
  } catch {
    // never throw
  }
}
