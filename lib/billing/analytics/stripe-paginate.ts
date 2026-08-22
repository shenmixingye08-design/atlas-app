/**
 * Stripe list pagination that never silently truncates.
 * Callers must treat `complete === false` as incomplete — never as a full total.
 */

export type StripePage<T> = {
  data: T[];
  has_more: boolean;
};

export type StripePaginationResult<T> = {
  items: T[];
  complete: boolean;
  truncated: boolean;
  stalled: boolean;
  pageCount: number;
  reason: string | null;
};

/** 200 pages × 100 = 20_000 objects. Enough for 1000+ users; beyond this → incomplete. */
export const STRIPE_PAGINATION_MAX_PAGES = 200;
export const STRIPE_PAGINATION_PAGE_SIZE = 100;

export async function paginateStripeList<T extends { id: string }>(
  fetchPage: (startingAfter: string | undefined) => Promise<StripePage<T>>,
  options?: { maxPages?: number },
): Promise<StripePaginationResult<T>> {
  const maxPages = options?.maxPages ?? STRIPE_PAGINATION_MAX_PAGES;
  const items: T[] = [];
  let startingAfter: string | undefined;
  let pageCount = 0;

  while (pageCount < maxPages) {
    const page = await fetchPage(startingAfter);
    pageCount += 1;

    if (!Array.isArray(page.data)) {
      return {
        items,
        complete: false,
        truncated: false,
        stalled: true,
        pageCount,
        reason: "invalid_page",
      };
    }

    items.push(...page.data);

    if (!page.has_more || page.data.length === 0) {
      return {
        items,
        complete: true,
        truncated: false,
        stalled: false,
        pageCount,
        reason: null,
      };
    }

    const nextCursor = page.data[page.data.length - 1]?.id;
    if (!nextCursor || nextCursor === startingAfter) {
      return {
        items,
        complete: false,
        truncated: false,
        stalled: true,
        pageCount,
        reason: "repeated_cursor",
      };
    }
    startingAfter = nextCursor;
  }

  return {
    items,
    complete: false,
    truncated: true,
    stalled: false,
    pageCount,
    reason: "safety_guard",
  };
}
