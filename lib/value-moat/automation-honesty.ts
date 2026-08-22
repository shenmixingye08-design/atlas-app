/**
 * VALUE 1 — only real, currently executable automations.
 * Unfinished integrations stay β / 未対応. No fake automation.
 */

export type AutomationAvailability = "live" | "beta" | "unsupported";

export type HonestAutomationCapability = {
  id: string;
  label: string;
  availability: AutomationAvailability;
  firstSetup: string;
  laterRun: string;
  example?: string;
};

export const HONEST_AUTOMATION_CAPABILITIES: readonly HonestAutomationCapability[] =
  [
    {
      id: "x_daily_post",
      label: "毎日のX投稿",
      availability: "live",
      firstSetup: "テーマ・時刻・確認/自動を一度設定",
      laterRun: "同じ指示は不要。予約枠で原稿作成から投稿まで実行",
      example: "毎朝10時にX投稿",
    },
    {
      id: "gmail_draft",
      label: "定型メールの下書き",
      availability: "live",
      firstSetup: "Gmail連携と下書き内容を一度設定",
      laterRun: "同じ指示は不要。Draft作成まで。送信は承認設定に従う",
      example: "毎週金曜に定型メールを準備する",
    },
    {
      id: "calendar_create",
      label: "予定の作成",
      availability: "live",
      firstSetup: "Google Calendar連携と作成内容を一度設定",
      laterRun: "同じ指示は不要。予定作成まで実行",
    },
    {
      id: "deliverable_word",
      label: "Word成果物",
      availability: "live",
      firstSetup: "形式と好みを一度教える",
      laterRun: "「今月分も」で型を再利用して新しいdocxを保存",
    },
    {
      id: "deliverable_excel",
      label: "Excel成果物",
      availability: "live",
      firstSetup: "列構成を一度教える",
      laterRun: "同じ列構成で新しいxlsxを保存。前回の数字はコピーしない",
    },
    {
      id: "deliverable_pdf",
      label: "PDF成果物",
      availability: "live",
      firstSetup: "構成と文体を一度教える",
      laterRun: "前回本文はコピーせず、構成だけ再利用",
    },
    {
      id: "deliverable_pptx",
      label: "PowerPoint成果物",
      availability: "live",
      firstSetup: "枚数傾向と構成を一度教える",
      laterRun: "同じ型で新しいpptxを保存",
    },
    {
      id: "dropbox_save",
      label: "Dropbox保存",
      availability: "live",
      firstSetup: "Dropbox連携と保存先を一度設定",
      laterRun: "対応ワークフローでのみ指定保存先へ保存",
    },
    {
      id: "wordpress_post",
      label: "WordPress投稿",
      availability: "live",
      firstSetup: "WordPress連携と投稿設定を一度設定",
      laterRun: "承認設定に従い投稿または下書き",
    },
    {
      id: "notify",
      label: "完了通知",
      availability: "live",
      firstSetup: "通知のON/OFF",
      laterRun: "終端成功のときだけ成功通知",
    },
    {
      id: "calendar_weekly_summary",
      label: "毎週の予定まとめ",
      availability: "beta",
      firstSetup: "Calendar連携は利用可能。まとめ文の定期実行は設定内容に依存",
      laterRun: "未完成の自動まとめは未対応として扱う",
      example: "毎週月曜に予定をまとめる",
    },
    {
      id: "google_drive_standalone",
      label: "Google Drive単体保存",
      availability: "beta",
      firstSetup: "接続は可能",
      laterRun: "Automationの単独保存ステップとしては未対応",
    },
  ] as const;

export function listLiveAutomations(): HonestAutomationCapability[] {
  return HONEST_AUTOMATION_CAPABILITIES.filter(
    (item) => item.availability === "live",
  );
}

export function describeAutomationAvailability(
  id: string,
): HonestAutomationCapability | null {
  return HONEST_AUTOMATION_CAPABILITIES.find((item) => item.id === id) ?? null;
}

export function isFakeAutomationClaim(text: string): boolean {
  return /完全自動で何でも|全部自動|未連携でも投稿成功/.test(text);
}
