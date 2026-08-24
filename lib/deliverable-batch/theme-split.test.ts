import { describe, expect, it } from "vitest";

import { splitThemesDeterministically } from "./theme-split";

describe("deliverable batch theme split", () => {
  it.each([3, 5, 7, 10, 12])("splits %s non-overlapping themes without inventing facts", (count) => {
    const items = splitThemesDeterministically("太陽光施工会社のSNS投稿を作る", count);
    expect(items).toHaveLength(count);
    const titles = new Set(items.map((item) => item.title));
    expect(titles.size).toBe(count);
    expect(items.every((item) => !item.instruction.includes("売上"))).toBe(true);
    expect(items.every((item) => item.theme.length > 0)).toBe(true);
  });
});
