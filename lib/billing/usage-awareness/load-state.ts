export type UsageDisplayState =
  | { kind: "unavailable"; message: string }
  | { kind: "ready"; used: number; limit: number };

export const USAGE_UNAVAILABLE_MESSAGE = "利用状況を取得できませんでした";

/** 0 is valid only after a successful load. */
export function resolveUsageDisplay(input: {
  ready: boolean;
  used: number;
  limit: number;
}): UsageDisplayState {
  if (!input.ready) {
    return { kind: "unavailable", message: USAGE_UNAVAILABLE_MESSAGE };
  }
  return { kind: "ready", used: input.used, limit: input.limit };
}
