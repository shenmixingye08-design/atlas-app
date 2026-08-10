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
  "MINERVOT | 朝のメールと投稿を、自分の手から外す";

export const MINERVOT_DEFAULT_DESCRIPTION =
  "依頼→作業中→完成通知→完成物。チャットAIの上位互換ではなく仕事完了の別カテゴリ。依頼した仕事を進め、完成したらお知らせします。合えば月980円。";
