/**
 * サイト公開用のメタデータ共通設定。
 * 優先順位: NEXT_PUBLIC_SITE_URL → NEXT_PUBLIC_APP_URL → VERCEL_URL → 仮URL
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
    const host = vercel.replace(/^https?:\/\//, "").replace(/\/$/, "");
    return `https://${host}`;
  }

  // 公開URL確定前の仮値（ビルド時フォールバック）。本番では NEXT_PUBLIC_SITE_URL を設定すること。
  return "https://atlas.example.com";
}

export const ATLAS_DEFAULT_TITLE = "ATLAS — あなた専属のAI秘書";
export const ATLAS_DEFAULT_DESCRIPTION =
  "ATLASはAIチャットではありません。仕事を覚え、繰り返し作業を減らし、あなたの時間を生み出す専属AI秘書です。";
