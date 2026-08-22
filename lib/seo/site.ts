import { lightPlanYenLabel } from "@/lib/landing/pay-reason";

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
  "MINERVOT | 毎日のX投稿を、一度頼めばあとは確認するだけ";

export const MINERVOT_DEFAULT_DESCRIPTION =
  `一度頼んだ仕事を、次から自動で終わらせるAI秘書。毎朝のX投稿を一度頼むと、原稿作成から投稿まで自動実行し、終わったらお知らせします。合えば月${lightPlanYenLabel()}。`;
