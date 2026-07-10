/** ISO 8601 timestamp string (e.g. `2026-07-07T00:00:00.000Z`). */
export type Timestamp = string;

/** Opaque UUID string primary key. */
export type EntityId = string;

/** Clerk user id or future auth provider subject. */
export type UserId = string;

/** Pagination input for list queries. */
export type PageRequest = {
  limit?: number;
  offset?: number;
};

/** Paginated list result. */
export type PageResult<T> = {
  items: T[];
  total: number;
  limit: number;
  offset: number;
};

/** Sort direction for list queries. */
export type SortDirection = "asc" | "desc";
