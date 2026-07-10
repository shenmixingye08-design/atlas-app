import { describe, expect, it } from "vitest";

import { resolveGenerationFormats } from "./resolve-formats";

describe("resolveGenerationFormats", () => {
  it("uses user-selected formats when provided", () => {
    const result = resolveGenerationFormats("営業資料", ["md"]);
    expect(result.matchedRule).toBe("user_selected_formats");
    expect(result.formats).toEqual(["md"]);
  });

  it("auto-detects when override is empty", () => {
    const result = resolveGenerationFormats("営業資料");
    expect(result.formats.length).toBeGreaterThan(0);
    expect(result.matchedRule).not.toBe("user_selected_formats");
  });
});
