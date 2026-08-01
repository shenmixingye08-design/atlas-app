/**
 * Queue depth / concurrency guards — prevent clog and overflow.
 */

export const DEFAULT_MAX_QUEUED_PER_USER = 50;
export const DEFAULT_MAX_IN_FLIGHT_PER_USER = 20;
export const DEFAULT_GLOBAL_IN_FLIGHT_SOFT_LIMIT = 500;

export type QueueDepthSnapshot = {
  queued: number;
  inFlight: number;
  total: number;
};

export type QueueAdmitDecision =
  | { admit: true }
  | {
      admit: false;
      reason: "queue_overflow" | "in_flight_overflow" | "global_overflow";
      message: string;
    };

export function admitJobToQueue(input: {
  snapshot: QueueDepthSnapshot;
  maxQueued?: number;
  maxInFlight?: number;
  globalInFlight?: number;
  globalSoftLimit?: number;
}): QueueAdmitDecision {
  const maxQueued = input.maxQueued ?? DEFAULT_MAX_QUEUED_PER_USER;
  const maxInFlight = input.maxInFlight ?? DEFAULT_MAX_IN_FLIGHT_PER_USER;
  const globalSoft =
    input.globalSoftLimit ?? DEFAULT_GLOBAL_IN_FLIGHT_SOFT_LIMIT;

  if (input.snapshot.queued >= maxQueued) {
    return {
      admit: false,
      reason: "queue_overflow",
      message:
        "依頼が混み合っています。完了してからもう一度送ってください。",
    };
  }
  if (input.snapshot.inFlight >= maxInFlight) {
    return {
      admit: false,
      reason: "in_flight_overflow",
      message:
        "処理中の依頼が多いため、しばらくしてからもう一度送ってください。",
    };
  }
  if ((input.globalInFlight ?? 0) >= globalSoft) {
    return {
      admit: false,
      reason: "global_overflow",
      message:
        "ただいま混雑しています。少し待ってからもう一度お試しください。",
    };
  }
  return { admit: true };
}
