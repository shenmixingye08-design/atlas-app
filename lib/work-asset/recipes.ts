/**
 * Honest Cross-Service recipes.
 * Catalog "exists" ≠ automation can read/write.
 */

export type RecipeAvailability = "live" | "unsupported";

export type CrossServiceRecipe = {
  id: string;
  label: string;
  userFacingName: string;
  availability: RecipeAvailability;
  integrations: readonly string[];
  deliverable?: "docx" | "xlsx" | "pdf" | "pptx" | "gmail_draft" | "x_post" | "none";
  reason: string;
};

export const CROSS_SERVICE_RECIPES: readonly CrossServiceRecipe[] = [
  {
    id: "x_daily_post",
    label: "X → 自動投稿",
    userFacingName: "毎日のX投稿",
    availability: "live",
    integrations: ["x"],
    deliverable: "x_post",
    reason: "予約枠で原稿作成から投稿まで実行できる",
  },
  {
    id: "gmail_draft",
    label: "定型メール下書き",
    userFacingName: "定型メールの準備",
    availability: "live",
    integrations: ["gmail"],
    deliverable: "gmail_draft",
    reason: "Draft作成までlive。送信は承認設定に従う",
  },
  {
    id: "calendar_create",
    label: "Calendar → 予定作成",
    userFacingName: "予定の登録",
    availability: "live",
    integrations: ["google_calendar"],
    deliverable: "none",
    reason: "予定作成ステップはlive",
  },
  {
    id: "wordpress_draft",
    label: "WordPress → 定期記事",
    userFacingName: "WordPress下書き",
    availability: "live",
    integrations: ["wordpress"],
    deliverable: "none",
    reason: "下書き/投稿ステップはlive。公開は課金契約に従う",
  },
  {
    id: "generate_calendar_notify",
    label: "成果物 → 予定作成 → 通知",
    userFacingName: "資料作成と予定登録",
    availability: "live",
    integrations: ["google_calendar"],
    deliverable: "docx",
    reason: "Phase 3 の generate → calendar create → notify が実行可能",
  },
  {
    id: "drive_read_report",
    label: "Drive → 報告書作成",
    userFacingName: "週報作成",
    availability: "unsupported",
    integrations: ["google_drive"],
    deliverable: "docx",
    reason: "Drive読み取りはWorkspace APIのみ。Automationステップは未対応",
  },
  {
    id: "calendar_read_summary",
    label: "Calendar → 週次まとめ",
    userFacingName: "週次予定まとめ",
    availability: "unsupported",
    integrations: ["google_calendar", "gmail"],
    deliverable: "gmail_draft",
    reason: "予定本文を後続ステップへ渡すREADは未対応",
  },
  {
    id: "dropbox_excel",
    label: "Dropbox → Excel整理",
    userFacingName: "Excel整理",
    availability: "unsupported",
    integrations: ["dropbox"],
    deliverable: "xlsx",
    reason: "Dropboxダウンロード/先行成果物添付は未配線",
  },
] as const;

export function listLiveRecipes(): CrossServiceRecipe[] {
  return CROSS_SERVICE_RECIPES.filter((row) => row.availability === "live");
}

export function listUnsupportedRecipes(): CrossServiceRecipe[] {
  return CROSS_SERVICE_RECIPES.filter((row) => row.availability === "unsupported");
}

export function isRecipeLive(id: string): boolean {
  return CROSS_SERVICE_RECIPES.some(
    (row) => row.id === id && row.availability === "live",
  );
}
