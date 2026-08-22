import type { Metadata } from "next";
import { redirect } from "next/navigation";

import { lightPlanYenLabel } from "@/lib/landing/pay-reason";

export const metadata: Metadata = {
  title: `料金 | 月${lightPlanYenLabel()}から`,
  description: `毎日のX投稿を、一度頼めばあとは確認するだけ。無料で1回体験。毎日任せるなら Light（月${lightPlanYenLabel()}）。`,
};

/** 公開用ショートカット。本体はホームページの料金セクション。 */
export default function PricingPublicPage() {
  redirect("/#pricing");
}
