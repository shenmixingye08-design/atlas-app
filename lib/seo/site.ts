/**
 * サイト公開用のメタデータ共通設定。
 * 優先順位:
 * NEXT_PUBLIC_SITE_URL → NEXT_PUBLIC_APP_URL → VERCEL_URL → 仮URL
 */

export function getSiteOrigin(): string {
  const configured =
    process.env.NEXT_PUBLIC_SITE_URL?.trim() ||
    process.env.NEXT_PUBLIC_APP_URL?.trim();

  if (configured) {
    return configured.replace(/\/$/, "");
  }

  const vercel = process.env.VERCEL_URL?.trim();

  if (vercel) {
    const host = vercel
      .replace(/^https?:\/\//, "")
      .replace(/\/$/, "");

    return `https://${host}`;
  }

  // 公開URL確定前のビルド用フォールバック。
  // 本番では NEXT_PUBLIC_SITE_URL を設定してください。
  return "https://minervot.example.com";
}

export const MINERVOT_DEFAULT_TITLE =
  "MINERVOT | あなたの仕事を代わりに終わらせます";

export const MINERVOT_DEFAULT_DESCRIPTION =
  "MINERVOTは会話で終わりません。仕事を選んで1回依頼するだけで、完成まで代わりに進めます。メール・SNS・資料作成など、毎日の繰り返し業務を終わらせて時間を生み出します。";
