import { describe, expect, it } from "vitest";

import {
  classifyDeliverableType,
  validatePlannerPlanConsistency,
} from "./deliverable-classification";

describe("deliverable classification", () => {
  it("classifies Japanese sales email requests as email", () => {
    expect(
      classifyDeliverableType(
        "建設会社へ太陽光発電の営業メールを作成してください。500文字程度。",
      ),
    ).toBe("email");
  });

  it("classifies blog requests as blog", () => {
    expect(classifyDeliverableType("AI活用のブログ記事を書いて")).toBe("blog");
  });

  it("rejects email request with blog-only planner tasks", () => {
    const result = validatePlannerPlanConsistency(
      "営業メールを作成",
      "email",
      [{ id: 1, title: "SEOブログ記事", description: "キーワード最適化した記事を書く" }],
      "blog",
    );
    expect(result.ok).toBe(false);
    expect(result.message).toContain("一致しません");
  });

  it("accepts email tasks for email requests", () => {
    const result = validatePlannerPlanConsistency(
      "建設会社へ太陽光発電の営業メール",
      "email",
      [{ id: 1, title: "営業メール起草", description: "500文字の提案メールを作成" }],
      "email",
    );
    expect(result.ok).toBe(true);
  });
});
