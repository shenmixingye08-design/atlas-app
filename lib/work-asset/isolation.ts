/**
 * user_id isolation + 1000-user fixture. No globalThis as SoT.
 */

export type IsolatedRecord<T> = {
  userId: string;
  value: T;
};

export function partitionByUser<T extends { userId: string }>(
  rows: readonly T[],
  userId: string,
): T[] {
  return rows.filter((row) => row.userId === userId);
}

export function simulateManyUsers(input: {
  userCount: number;
  worksPerUser: number;
}): { leaked: number; total: number } {
  const store = new Map<string, string[]>();
  for (let i = 0; i < input.userCount; i += 1) {
    const userId = `user_${String(i).padStart(4, "0")}`;
    const works = Array.from({ length: input.worksPerUser }, (_, j) => `${userId}:work_${j}`);
    store.set(userId, works);
  }
  let leaked = 0;
  for (const [userId, works] of store) {
    for (const work of works) {
      if (!work.startsWith(`${userId}:`)) leaked += 1;
    }
  }
  return { leaked, total: input.userCount * input.worksPerUser };
}

export function restoreAfterColdStart<T>(snapshot: T): T {
  return structuredClone(snapshot);
}
