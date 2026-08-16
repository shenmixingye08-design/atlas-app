/**
 * In-request prepaid AI-run slots.
 * `requireBillingAiUsage` consumes the quota before work; `recordUserAiUsage`
 * settles the reservation so the same run is not counted twice.
 */

export type AiRunReservation = {
  claimKey: string;
  incremented: boolean;
};

const pending = new Map<string, AiRunReservation[]>();

export function pushAiRunReservation(
  userId: string,
  reservation: AiRunReservation,
): void {
  const list = pending.get(userId) ?? [];
  list.push(reservation);
  pending.set(userId, list);
}

export function peekAiRunReservation(userId: string): AiRunReservation | null {
  const list = pending.get(userId);
  return list && list.length > 0 ? list[list.length - 1]! : null;
}

export function popAiRunReservation(userId: string): AiRunReservation | null {
  const list = pending.get(userId);
  if (!list || list.length === 0) return null;
  const reservation = list.pop()!;
  if (list.length === 0) pending.delete(userId);
  else pending.set(userId, list);
  return reservation;
}

export function pendingAiRunReservationCount(userId: string): number {
  return pending.get(userId)?.length ?? 0;
}

export function clearAiRunReservationsForTests(): void {
  pending.clear();
}
