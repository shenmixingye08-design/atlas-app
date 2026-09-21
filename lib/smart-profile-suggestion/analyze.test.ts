import { beforeEach, describe, expect, it, vi } from "vitest";

import { analyzeDeliverableForSmartProfile } from "./analyze";
import { resetSmartProfileFactsForTests } from "./facts-store";
import {
  recordInputObservation,
  resetSmartProfileSuggestionStateForTests,
  snoozeField,
} from "./persistence";

function installLocalStorage() {
  const store = new Map<string, string>();
  vi.stubGlobal("localStorage", {
    getItem: (key: string) => store.get(key) ?? null,
    setItem: (key: string, value: string) => {
      store.set(key, value);
    },
    removeItem: (key: string) => {
      store.delete(key);
    },
    clear: () => store.clear(),
  });
  vi.stubGlobal("window", { localStorage: globalThis.localStorage });
}

beforeEach(() => {
  installLocalStorage();
  resetSmartProfileSuggestionStateForTests();
  resetSmartProfileFactsForTests();
});

describe("analyzeDeliverableForSmartProfile", () => {
  it("detects missing company fields in sales materials", () => {
    const model = analyzeDeliverableForSmartProfile(
      {
        deliverableType: "proposal",
        title: "営業資料",
        content:
          "株式会社○○のサービス紹介です。ご担当者様へ。\n会社紹介を追加してください。\n[ロゴ]",
        workRequest: "営業資料を作って",
      },
      { recordObservations: false },
    );

    expect(model.shouldShow).toBe(true);
    expect(model.missingLabels.length).toBeGreaterThan(0);
    expect(model.suggestions.some((item) => item.key === "logo")).toBe(true);
    expect(model.quality.stars).toBeGreaterThanOrEqual(1);
    expect(model.quality.stars).toBeLessThanOrEqual(5);
  });

  it("suggests signature for email deliverables", () => {
    const model = analyzeDeliverableForSmartProfile(
      {
        deliverableType: "email",
        title: "お礼メール",
        content: "いつもお世話になっております。\n\n[署名]",
        workRequest: "お礼メールを作成",
      },
      { recordObservations: false },
    );

    expect(model.suggestions.some((item) => item.key === "signature")).toBe(true);
  });

  it("surfaces recurring company name after 3 observations", () => {
    recordInputObservation("company_name", "株式会社ミネルボ");
    recordInputObservation("company_name", "株式会社ミネルボ");
    recordInputObservation("company_name", "株式会社ミネルボ");

    const model = analyzeDeliverableForSmartProfile(
      {
        deliverableType: "document",
        title: "メモ",
        content: "短いメモ",
        workRequest: "株式会社ミネルボの案内を作成",
      },
      { recordObservations: false },
    );

    const recurring = model.suggestions.find((item) => item.key === "company_name");
    expect(recurring?.reason).toBe("recurring");
    expect(recurring?.suggestedValue).toContain("株式会社ミネルボ");
  });

  it("hides snoozed fields for 30 days", () => {
    const modelBefore = analyzeDeliverableForSmartProfile(
      {
        deliverableType: "email",
        title: "メール",
        content: "[署名]",
        workRequest: "メール",
      },
      { recordObservations: false },
    );
    expect(modelBefore.suggestions.some((item) => item.key === "signature")).toBe(
      true,
    );

    snoozeField("signature", 30, new Date("2026-07-25T00:00:00.000Z"));

    const modelAfter = analyzeDeliverableForSmartProfile(
      {
        deliverableType: "email",
        title: "メール",
        content: "[署名]",
        workRequest: "メール",
        now: new Date("2026-07-26T00:00:00.000Z"),
      },
      { recordObservations: false },
    );
    expect(modelAfter.suggestions.some((item) => item.key === "signature")).toBe(
      false,
    );
  });
});
