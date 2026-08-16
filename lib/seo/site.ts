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
  "MINERVOT | 一人で仕事を回す人のためのAI秘書";

export const MINERVOT_DEFAULT_DESCRIPTION =
  "あなた専属のAI秘書。X投稿、メール、予定管理、資料作成など、毎日の面倒な仕事を任せて、自分は確認するだけ。依頼した仕事を進め、完成したらお知らせします。合えば月980円。";
