/**
 * Detect required external production actions from natural language.
 * Used to fail-closed when the user asked for a real provider op but
 * no production step / adapter / evidence exists.
 */

export type RequiredExternalAction =
  | "google_calendar"
  | "gmail"
  | "x_post"
  | "wordpress"
  | "dropbox";

const CALENDAR_PATTERN =
  /google\s*カレンダー|グーグル\s*カレンダー|Google\s*Calendar|カレンダーに.*(?:作成|登録|追加)|(?:予定|イベント)を.*(?:作成|登録|追加)|カレンダーへ/i;

const GMAIL_PATTERN =
  /gmail|ジーメール|(?:メール|mail).*(?:送信|送って)|(?:送って|送信して).*(?:メール|mail)/i;

const X_PATTERN =
  /(?:^|[^\w])x(?:へ|に|で)|twitter|ツイート|(?:sns|エックス).*(?:投稿|ポスト)|投稿して/i;

const WORDPRESS_PATTERN = /wordpress|ワードプレス/i;

const DROPBOX_PATTERN = /dropbox|ドロップボックス/i;

/** Extract 「…という予定」 / "…" event title when present. */
export function extractCalendarEventTitle(text: string): string | null {
  const quoted = text.match(
    /[「『]([^」』]{1,80})[」』]\s*という\s*(?:予定|イベント)/,
  );
  if (quoted?.[1]?.trim()) return quoted[1].trim();

  // Prefer title after the last 「に」 so
  // 「毎日1時にMINERVOT自動化テストという予定」 → MINERVOT自動化テスト
  const afterNi = text.match(
    /に([^\s、。に]{1,80})\s*という\s*(?:予定|イベント)/,
  );
  if (afterNi?.[1]?.trim()) return afterNi[1].trim();

  const plain = text.match(
    /([^\s、。]{1,80}?)\s*という\s*(?:予定|イベント)/,
  );
  if (plain?.[1]?.trim()) return plain[1].trim();

  return null;
}

export function requiresGoogleCalendarAction(text: string): boolean {
  return CALENDAR_PATTERN.test(text);
}

export function detectRequiredExternalActions(
  text: string,
): RequiredExternalAction[] {
  const found: RequiredExternalAction[] = [];
  if (requiresGoogleCalendarAction(text)) found.push("google_calendar");
  if (GMAIL_PATTERN.test(text)) found.push("gmail");
  if (X_PATTERN.test(text) && !/カレンダー/.test(text)) found.push("x_post");
  if (WORDPRESS_PATTERN.test(text)) found.push("wordpress");
  if (DROPBOX_PATTERN.test(text)) found.push("dropbox");
  return found;
}

export function describeMissingExternalAction(
  action: RequiredExternalAction,
): string {
  switch (action) {
    case "google_calendar":
      return "Googleカレンダーへの予定作成";
    case "gmail":
      return "Gmail送信";
    case "x_post":
      return "X投稿";
    case "wordpress":
      return "WordPress投稿";
    case "dropbox":
      return "Dropbox保存";
  }
}
