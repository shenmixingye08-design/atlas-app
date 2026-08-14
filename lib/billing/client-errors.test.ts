import { describe, expect, it } from "vitest";

import { formatPlanAccessErrorMessage } from "./client-errors";

describe("formatPlanAccessErrorMessage", () => {
  it("keeps a plan-only denial as a single line", () => {
    expect(
      formatPlanAccessErrorMessage({
        error: "plan_required",
        message: "この機能はStandardプラン以上でご利用いただけます",
        requiredPlanName: "Standard",
      }),
    ).toBe("この機能はStandardプラン以上でご利用いただけます");
  });

  it("adds remaining counts, reset day, and the smallest helpful upgrade", () => {
    const message = formatPlanAccessErrorMessage({
      message: "今月のAI作業上限に達しました",
      used: 30,
      limit: 30,
      remaining: 0,
      resetLabel: "9月1日にリセットされます",
      recommendedPlanName: "Standard",
      recommendedLimit: 100,
      otherFeaturesRemain: "自動化など他の機能は引き続き利用できます。",
    });

    expect(message).toContain("今月のAI作業上限に達しました");
    expect(message).toContain("現在：30 / 30");
    expect(message).toContain("9月1日にリセットされます");
    expect(message).toContain("Standardなら月100まで利用できます");
    expect(message).toContain("他の機能は引き続き利用できます");
    expect(message).not.toContain("今すぐ課金");
  });
});
