export type AutomationListLoadState = "loading" | "ready" | "error";

/** Counts are valid only after a successful list. Failure must not look like 0. */
export function shouldRenderAutomationCounts(
  state: AutomationListLoadState,
): boolean {
  return state === "ready";
}

export const AUTOMATION_LIST_UNAVAILABLE_TITLE = "自動化を取得できませんでした";
export const AUTOMATION_LIST_UNAVAILABLE_HINT =
  "確認不能のため、0件としては表示していません。再読み込みしてください。";
export const AUTOMATION_LIST_EMPTY_MESSAGE = "まだ自動化はありません";

export const RUN_LIST_UNAVAILABLE_TITLE = "実行履歴を取得できませんでした";
export const RUN_LIST_UNAVAILABLE_HINT =
  "確認不能のため、0件としては表示していません。再読み込みしてください。";
export const RUN_LIST_EMPTY_MESSAGE = "該当する実行はありません。";

export function shouldRenderRunCounts(state: AutomationListLoadState): boolean {
  return state === "ready";
}

export function runListEmptyMessage(
  state: AutomationListLoadState,
  count: number,
): string | null {
  if (state !== "ready") return null;
  if (count !== 0) return null;
  return RUN_LIST_EMPTY_MESSAGE;
}

export function automationListEmptyMessage(
  state: AutomationListLoadState,
  count: number,
): string | null {
  if (state !== "ready") return null;
  if (count !== 0) return null;
  return AUTOMATION_LIST_EMPTY_MESSAGE;
}
