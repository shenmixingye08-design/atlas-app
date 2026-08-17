import type { Metadata } from "next";
import { redirect } from "next/navigation";

import { lightPlanYenLabel } from "@/lib/landing/pay-reason";

export const metadata: Metadata = {
  title: `料金 | 月${lightPlanYenLabel()}から`,
  description: `無料で1件完成まで体験。毎月の投稿・メール・資料を自分で抱え続けないなら、Light（月${lightPlanYenLabel()}）から。`,
};

/** 公開用ショートカット。本体はホームページの料金セクション。 */
export default function PricingPublicPage() {
  redirect("/#pricing");
}
