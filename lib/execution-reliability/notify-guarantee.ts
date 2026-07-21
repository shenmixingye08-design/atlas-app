import {
  notifyWorkCompleted,
  notifyWorkFailed,
} from "@/lib/notifications/emitters";

type NotifyCompletedInput = Parameters<typeof notifyWorkCompleted>[1];
type NotifyFailedInput = Parameters<typeof notifyWorkFailed>[1];

/**
 * Retries completion / failure notifications so users are not left without a
 * completion notice when the first emit fails transiently.
 */
export function notifyWorkCompletedGuaranteed(
  userId: string | null | undefined,
  input: NotifyCompletedInput,
  options?: { maxAttempts?: number },
) {
  const maxAttempts = options?.maxAttempts ?? 3;
  let last: ReturnType<typeof notifyWorkCompleted> = null;
  for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
    try {
      last = notifyWorkCompleted(userId, input);
      if (last) return { notification: last, guaranteed: true, attempts: attempt };
    } catch (error) {
      if (attempt >= maxAttempts) {
        console.warn("[execution-reliability] completion notify failed", error);
      }
    }
  }
  return { notification: last, guaranteed: Boolean(last), attempts: maxAttempts };
}

export function notifyWorkFailedGuaranteed(
  userId: string | null | undefined,
  input: NotifyFailedInput,
  options?: { maxAttempts?: number },
) {
  const maxAttempts = options?.maxAttempts ?? 3;
  let last: ReturnType<typeof notifyWorkFailed> = null;
  for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
    try {
      last = notifyWorkFailed(userId, input);
      if (last) return { notification: last, guaranteed: true, attempts: attempt };
    } catch (error) {
      if (attempt >= maxAttempts) {
        console.warn("[execution-reliability] failure notify failed", error);
      }
    }
  }
  return { notification: last, guaranteed: Boolean(last), attempts: maxAttempts };
}
