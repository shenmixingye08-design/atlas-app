import { beforeEach, describe, expect, it, vi } from "vitest";

import { saveSmartProfileFact, resetSmartProfileFactsForTests } from "./facts-store";
import {
  getRecurringValue,
  isFieldSuggestionVisible,
  recordInputObservation,
  resetSmartProfileSuggestionStateForTests,
  snoozeField,
} from "./persistence";

beforeEach(() => {
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
  resetSmartProfileSuggestionStateForTests();
  resetSmartProfileFactsForTests();
});

describe("smart profile suggestion persistence", () => {
  it("counts recurring inputs and returns value at threshold", () => {
    expect(getRecurringValue("company_name")).toBeNull();
    recordInputObservation("company_name", "ABC株式会社");
    recordInputObservation("company_name", "ABC株式会社");
    expect(getRecurringValue("company_name")).toBeNull();
    recordInputObservation("company_name", "ABC株式会社");
    expect(getRecurringValue("company_name")).toBe("abc株式会社");
  });

  it("never suggests again after save", () => {
    saveSmartProfileFact("signature", "MINERVOT 太郎");
    expect(isFieldSuggestionVisible("signature")).toBe(false);
  });

  it("snoozes for the requested number of days", () => {
    const now = new Date("2026-07-01T10:00:00.000Z");
    snoozeField("logo", 30, now);
    expect(
      isFieldSuggestionVisible("logo", new Date("2026-07-15T10:00:00.000Z")),
    ).toBe(false);
    expect(
      isFieldSuggestionVisible("logo", new Date("2026-08-01T10:00:00.000Z")),
    ).toBe(true);
  });
});
