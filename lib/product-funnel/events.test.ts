import { describe, expect, it, beforeEach } from "vitest";

import {
  resetFunnelEventsForTests,
  summarizeFunnel,
  trackFunnelEvent,
} from "./events";

describe("product funnel events", () => {
  beforeEach(() => {
    resetFunnelEventsForTests();
  });

  it("normalizes Phase5 aliases to Phase6 names", () => {
    trackFunnelEvent("home_view", { sessionKey: "s1" });
    trackFunnelEvent("request_submit", { sessionKey: "s1" });
    trackFunnelEvent("artifact_download", {
      sessionKey: "s1",
      artifactId: "art_1",
    });
    trackFunnelEvent("job_failed", {
      sessionKey: "s1",
      errorCode: "timeout",
    });
    const s = summarizeFunnel();
    expect(s.homeViews).toBe(1);
    expect(s.requestSubmits).toBe(1);
    expect(s.downloads).toBe(1);
    expect(s.jobFailed).toBe(1);
  });
});
