import "server-only";

export type PendingXPostStatus =
  | "pending"
  | "posted"
  | "skipped"
  | "failed"
  | "edited";

export type PendingXPost = {
  id: string;
  automationId: string;
  userId: string;
  /** Planned run slot (idempotency with automationId). */
  scheduledAt: string;
  generatedText: string;
  status: PendingXPostStatus;
  accountUsername: string | null;
  xPostId: string | null;
  xPostUrl: string | null;
  errorCode: string | null;
  errorMessage: string | null;
  createdAt: string;
  updatedAt: string;
  postedAt: string | null;
};

type Bucket = Map<string, PendingXPost>;

function getBucket(): Bucket {
  const scope = globalThis as typeof globalThis & {
    __atlasPendingXPosts?: Bucket;
  };
  if (!scope.__atlasPendingXPosts) {
    scope.__atlasPendingXPosts = new Map();
  }
  return scope.__atlasPendingXPosts;
}

export function buildPendingXPostIdempotencyKey(
  automationId: string,
  scheduledAt: string,
): string {
  return `${automationId}::${scheduledAt}`;
}

export function findPendingXPostBySlot(
  automationId: string,
  scheduledAt: string,
): PendingXPost | null {
  const key = buildPendingXPostIdempotencyKey(automationId, scheduledAt);
  for (const row of getBucket().values()) {
    if (
      row.automationId === automationId &&
      row.scheduledAt === scheduledAt &&
      (row.status === "pending" || row.status === "posted")
    ) {
      return row;
    }
  }
  // Keep key available for future durable index; currently scan is fine.
  void key;
  return null;
}

export function savePendingXPost(
  input: Omit<
    PendingXPost,
    "id" | "createdAt" | "updatedAt" | "postedAt" | "xPostId" | "xPostUrl" | "errorCode" | "errorMessage" | "status"
  > & {
    id?: string;
    status?: PendingXPostStatus;
  },
): PendingXPost {
  const existing = findPendingXPostBySlot(
    input.automationId,
    input.scheduledAt,
  );
  if (existing && existing.status === "posted") {
    return existing;
  }
  if (existing && existing.status === "pending") {
    const updated: PendingXPost = {
      ...existing,
      generatedText: input.generatedText,
      accountUsername: input.accountUsername,
      updatedAt: new Date().toISOString(),
    };
    getBucket().set(existing.id, updated);
    return updated;
  }

  const now = new Date().toISOString();
  const row: PendingXPost = {
    id: input.id ?? crypto.randomUUID(),
    automationId: input.automationId,
    userId: input.userId,
    scheduledAt: input.scheduledAt,
    generatedText: input.generatedText,
    status: input.status ?? "pending",
    accountUsername: input.accountUsername,
    xPostId: null,
    xPostUrl: null,
    errorCode: null,
    errorMessage: null,
    createdAt: now,
    updatedAt: now,
    postedAt: null,
  };
  getBucket().set(row.id, row);
  return row;
}

export function getPendingXPost(
  userId: string,
  id: string,
): PendingXPost | null {
  const row = getBucket().get(id);
  if (!row || row.userId !== userId) return null;
  return row;
}

export function listPendingXPostsForUser(
  userId: string,
  options?: { automationId?: string; status?: PendingXPostStatus },
): PendingXPost[] {
  return [...getBucket().values()]
    .filter((row) => {
      if (row.userId !== userId) return false;
      if (options?.automationId && row.automationId !== options.automationId) {
        return false;
      }
      if (options?.status && row.status !== options.status) return false;
      return true;
    })
    .sort(
      (a, b) =>
        new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime(),
    );
}

export function listPendingXPostsForAutomation(
  automationId: string,
): PendingXPost[] {
  return [...getBucket().values()]
    .filter((row) => row.automationId === automationId)
    .sort(
      (a, b) =>
        new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime(),
    );
}

export function updatePendingXPost(
  id: string,
  patch: Partial<
    Pick<
      PendingXPost,
      | "generatedText"
      | "status"
      | "xPostId"
      | "xPostUrl"
      | "errorCode"
      | "errorMessage"
      | "postedAt"
      | "accountUsername"
    >
  >,
): PendingXPost | null {
  const existing = getBucket().get(id);
  if (!existing) return null;
  const updated: PendingXPost = {
    ...existing,
    ...patch,
    updatedAt: new Date().toISOString(),
  };
  getBucket().set(id, updated);
  return updated;
}
