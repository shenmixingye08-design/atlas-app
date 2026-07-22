export type RunMode = "test" | "manual" | "scheduled";

export type TestRunOptions = {
  mode: RunMode;
  livePublish: boolean;
};

export function resolveTriggerType(mode: RunMode): "test" | "manual" | "automation" {
  switch (mode) {
    case "test":
      return "test";
    case "manual":
      return "manual";
    case "scheduled":
      return "automation";
  }
}

export function shouldSkipExternalPublish(options: TestRunOptions): boolean {
  if (options.mode !== "test") return false;
  return !options.livePublish;
}

export function testRunBannerMessage(options: TestRunOptions): string | null {
  if (options.mode !== "test") return null;
  if (options.livePublish) {
    return "テスト実行中 — 実際に外部へ投稿します";
  }
  return "テストのため公開していません — プレビュー・下書きのみ保存します";
}

export function countsTowardSuccessMetrics(mode: RunMode): boolean {
  return mode !== "test";
}
