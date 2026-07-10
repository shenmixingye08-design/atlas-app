import { describe, expect, it } from "vitest";

import {
  ATLAS_COST_REDUCTION_CHECKLIST,
  ATLAS_DEVELOPMENT_PRINCIPLES,
  ATLAS_FEATURE_EVALUATION_FIELDS,
  ATLAS_PRODUCT_PHILOSOPHY,
  formatFeatureEvaluationTemplate,
} from "./feature-evaluation";

describe("feature evaluation development rules", () => {
  it("defines product philosophy", () => {
    expect(ATLAS_PRODUCT_PHILOSOPHY).toContain("AIを必要な時だけ");
  });

  it("includes three development principles", () => {
    expect(ATLAS_DEVELOPMENT_PRINCIPLES).toHaveLength(3);
    expect(ATLAS_DEVELOPMENT_PRINCIPLES[0]).toContain("AIを使わない");
  });

  it("requires nine evaluation fields", () => {
    expect(ATLAS_FEATURE_EVALUATION_FIELDS).toContain("機能名");
    expect(ATLAS_FEATURE_EVALUATION_FIELDS).toContain("優先度");
    expect(ATLAS_FEATURE_EVALUATION_FIELDS).toHaveLength(9);
  });

  it("requires eight cost reduction checklist items", () => {
    expect(ATLAS_COST_REDUCTION_CHECKLIST).toContain("エコモード");
    expect(ATLAS_COST_REDUCTION_CHECKLIST).toContain("同じ処理を再生成しない設計");
    expect(ATLAS_COST_REDUCTION_CHECKLIST).toHaveLength(8);
  });

  it("formats evaluation template for copy-paste", () => {
    const template = formatFeatureEvaluationTemplate();
    expect(template).toContain("【ATLAS機能評価】");
    expect(template).toContain("機能名：");
    expect(template).toContain("- [ ] エコモード");
    expect(template).toContain("- [ ] キャッシュ再利用");
  });
});
