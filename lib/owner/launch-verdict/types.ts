import type { LaunchVerdictResult } from "@/lib/owner/launch-verdict/evaluate";

export type LaunchVerdictSnapshot = LaunchVerdictResult & {
  window: "all_beta_events";
  raw: {
    requestCount: number;
    completeCount: number;
    failCount: number;
    firstRunUsers: number;
    npsResponses: number;
  };
};
