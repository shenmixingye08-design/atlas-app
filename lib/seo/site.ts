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
  "MINERVOT | 仕事を代わりに終わらせます（月980円から）";

export const MINERVOT_DEFAULT_DESCRIPTION =
  "個人事業主・忙しい会社員向け。SNS投稿・メール・資料を選んで依頼するだけで完成。ChatGPT・Claude・Geminiは答えて終わる。MINERVOTは仕事を終わらせます。無料体験あり、月980円から。";
