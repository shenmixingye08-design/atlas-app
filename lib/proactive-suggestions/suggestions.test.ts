import { describe, expect, it, beforeEach, vi } from "vitest";

import { SEED_AUTOMATIONS } from "@/lib/automations/domain";
import { DEFAULT_USER_WORK_PROFILE } from "@/lib/user-profile/types";

import { buildSuggestionTimeContext } from "./context";
import { generateProactiveSuggestions } from "./generators";
import {
  dismissProactiveSuggestion,
  filterVisibleProactiveSuggestions,
  isProactiveSuggestionVisible,
  snoozeProactiveSuggestion,
} from "./persistence";

const storage = new Map<string, string>();

const localStorageMock = {
  getItem: (key: string) => storage.get(key) ?? null,
  setItem: (key: string, value: string) => {
    storage.set(key, value);
  },
  removeItem: (key: string) => {
    storage.delete(key);
  },
};

vi.stubGlobal("localStorage", localStorageMock);
vi.stubGlobal("window", { localStorage: localStorageMock });

beforeEach(() => {
  storage.clear();
});

describe("proactive suggestions", () => {
  it("builds wednesday coconala message", () => {
    const wednesday = new Date("2026-07-08T03:00:00.000Z");
    const suggestions = generateProactiveSuggestions({
      automations: SEED_AUTOMATIONS,
      profile: DEFAULT_USER_WORK_PROFILE,
      now: wednesday,
    });

    const coconala = suggestions.find((item) => item.id === "scheduled:habit-coconala");
    expect(coconala?.message).toContain("水曜");
    expect(coconala?.message).toContain("ココナラ");
  });

  it("builds monday blog message", () => {
    const monday = new Date("2026-07-06T03:00:00.000Z");
    const suggestions = generateProactiveSuggestions({
      automations: SEED_AUTOMATIONS,
      profile: DEFAULT_USER_WORK_PROFILE,
      now: monday,
    });

    const blog = suggestions.find((item) => item.id === "scheduled:habit-blog");
    expect(blog?.message).toContain("ブログ");
  });

  it("uses learned sales format in message", () => {
    const firstOfMonth = new Date("2026-07-01T03:00:00.000Z");
    const suggestions = generateProactiveSuggestions({
      automations: SEED_AUTOMATIONS,
      profile: {
        ...DEFAULT_USER_WORK_PROFILE,
        preferredFormats: { sales_material: "pptx" },
      },
      now: firstOfMonth,
    });

    const sales = suggestions.find((item) => item.id === "scheduled:habit-sales-deck");
    expect(sales?.message).toContain("PowerPoint");
  });

  it("can dismiss and snooze suggestions", () => {
    expect(isProactiveSuggestionVisible("scheduled:habit-blog")).toBe(true);

    dismissProactiveSuggestion("scheduled:habit-blog");
    expect(isProactiveSuggestionVisible("scheduled:habit-blog")).toBe(false);

    snoozeProactiveSuggestion(
      "scheduled:habit-x-post",
      new Date(Date.now() + 60_000),
    );
    expect(isProactiveSuggestionVisible("scheduled:habit-x-post")).toBe(false);

    const visible = filterVisibleProactiveSuggestions([
      {
        id: "scheduled:habit-x-post",
        kind: "scheduled_habit",
        message: "test",
        action: {},
        integrationHint: "sns",
        priority: 1,
        generatedAt: new Date().toISOString(),
      },
    ]);
    expect(visible).toHaveLength(0);
  });

  it("exposes weekday context in Asia/Tokyo", () => {
    const context = buildSuggestionTimeContext(new Date("2026-07-08T03:00:00.000Z"));
    expect(context.weekdayLabel).toBe("水曜");
  });
});
