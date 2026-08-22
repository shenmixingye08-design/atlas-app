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
  "MINERVOT | あなたの仕事を覚えて、次から終わらせるAI秘書";

export const MINERVOT_DEFAULT_DESCRIPTION =
  `あなたの仕事を覚えて、次から終わらせるAI秘書。毎日のX投稿も、いつもの報告書も、一度やり方を教えれば次から細かい説明を減らせます。対応業務では実行・保存まで。合えば月${lightPlanYenLabel()}。`;
