import { describe, expect, it } from "vitest";

import { paginateStripeList } from "./stripe-paginate";

function page<T extends { id: string }>(
  items: T[],
  hasMore: boolean,
): { data: T[]; has_more: boolean } {
  return { data: items, has_more: hasMore };
}

describe("paginateStripeList", () => {
  it("fetches every page until has_more is false", async () => {
    const pages = [
      page(
        Array.from({ length: 100 }, (_, i) => ({ id: `in_${i}` })),
        true,
      ),
      page(
        Array.from({ length: 50 }, (_, i) => ({ id: `in_${100 + i}` })),
        false,
      ),
    ];
    let calls = 0;
    const result = await paginateStripeList(async () => {
      const next = pages[calls] ?? page([], false);
      calls += 1;
      return next;
    });
    expect(result.complete).toBe(true);
    expect(result.truncated).toBe(false);
    expect(result.items).toHaveLength(150);
    expect(calls).toBe(2);
  });

  it("loads 1000+ invoices without silent truncation", async () => {
    const total = 1100;
    const result = await paginateStripeList(async (startingAfter) => {
      const start = startingAfter
        ? Number(startingAfter.replace("in_", "")) + 1
        : 0;
      const data = Array.from({ length: Math.min(100, total - start) }, (_, i) => ({
        id: `in_${start + i}`,
      }));
      return { data, has_more: start + data.length < total };
    });
    expect(result.complete).toBe(true);
    expect(result.items).toHaveLength(1100);
    expect(result.truncated).toBe(false);
  });

  it("marks incomplete when the safety guard is reached", async () => {
    const result = await paginateStripeList(
      async (startingAfter) => {
        const start = startingAfter
          ? Number(startingAfter.replace("in_", "")) + 1
          : 0;
        const data = Array.from({ length: 100 }, (_, i) => ({
          id: `in_${start + i}`,
        }));
        return { data, has_more: true };
      },
      { maxPages: 3 },
    );
    expect(result.complete).toBe(false);
    expect(result.truncated).toBe(true);
    expect(result.reason).toBe("safety_guard");
    expect(result.items).toHaveLength(300);
  });

  it("stops and marks incomplete when the same cursor repeats", async () => {
    const result = await paginateStripeList(async () => ({
      data: [{ id: "stuck" }],
      has_more: true,
    }));
    expect(result.complete).toBe(false);
    expect(result.stalled).toBe(true);
    expect(result.reason).toBe("repeated_cursor");
  });
});
