/**
 * In-process counters for health-probe and read-only route side effects.
 * Used to prove GET routes do not insert notifications / consume quota.
 */

export type ProbeSideEffectSnapshot = {
  notificationInserts: number;
  notificationUpserts: number;
  clerkGetUser: number;
  clerkUpdateUser: number;
  clerkDeleteUser: number;
  dbWrites: number;
};

const zero = (): ProbeSideEffectSnapshot => ({
  notificationInserts: 0,
  notificationUpserts: 0,
  clerkGetUser: 0,
  clerkUpdateUser: 0,
  clerkDeleteUser: 0,
  dbWrites: 0,
});

let counters = zero();

export function resetProbeSideEffectCounters(): void {
  counters = zero();
}

export function bumpProbeSideEffect(
  key: keyof ProbeSideEffectSnapshot,
  by = 1,
): void {
  counters[key] += by;
}

export function getProbeSideEffectCounters(): ProbeSideEffectSnapshot {
  return { ...counters };
}

export function snapshotProbeSideEffects(): ProbeSideEffectSnapshot {
  return getProbeSideEffectCounters();
}

export function diffProbeSideEffects(
  before: ProbeSideEffectSnapshot,
  after: ProbeSideEffectSnapshot = getProbeSideEffectCounters(),
): ProbeSideEffectSnapshot {
  return {
    notificationInserts: after.notificationInserts - before.notificationInserts,
    notificationUpserts: after.notificationUpserts - before.notificationUpserts,
    clerkGetUser: after.clerkGetUser - before.clerkGetUser,
    clerkUpdateUser: after.clerkUpdateUser - before.clerkUpdateUser,
    clerkDeleteUser: after.clerkDeleteUser - before.clerkDeleteUser,
    dbWrites: after.dbWrites - before.dbWrites,
  };
}
