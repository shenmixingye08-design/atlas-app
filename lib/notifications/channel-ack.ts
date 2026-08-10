/**
 * N-07: Channel delivery ACK taxonomy.
 * skipped (not_configured / no subscription) ≠ delivered success.
 */

export type ChannelAckStatus = "delivered" | "skipped" | "failed";

export type ChannelAckResult = {
  /**
   * Retry-loop terminal: true for delivered OR intentional skip.
   * Never means "user work succeeded".
   */
  ok: boolean;
  status: ChannelAckStatus;
  attempts: number;
  sentCount: number;
  skipReason: string | null;
  error: string | null;
  /** Always false — soft-success forbidden. */
  softSuccess: false;
};

export function ackDelivered(input: {
  attempts: number;
  sentCount: number;
}): ChannelAckResult {
  return {
    ok: true,
    status: "delivered",
    attempts: input.attempts,
    sentCount: input.sentCount,
    skipReason: null,
    error: null,
    softSuccess: false,
  };
}

export function ackSkipped(input: {
  attempts: number;
  reason: string;
}): ChannelAckResult {
  return {
    ok: true,
    status: "skipped",
    attempts: input.attempts,
    sentCount: 0,
    skipReason: input.reason,
    error: null,
    softSuccess: false,
  };
}

export function ackFailed(input: {
  attempts: number;
  error: string;
}): ChannelAckResult {
  return {
    ok: false,
    status: "failed",
    attempts: input.attempts,
    sentCount: 0,
    skipReason: null,
    error: input.error,
    softSuccess: false,
  };
}

export const LINE_SKIP_REASONS = new Set([
  "disabled",
  "not_configured",
  "not_linked",
  "event_disabled",
]);
