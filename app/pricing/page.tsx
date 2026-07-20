import type { Metadata } from "next";
import { redirect } from "next/navigation";

export const metadata: Metadata = {
  title: "料金",
  description:
    "MINERVOTの料金プラン。あなた専属のAI秘書を無料から始められます。",
};

/** 公開用ショートカット。本体はホームページの料金セクション。 */
export default function PricingPublicPage() {
  redirect("/#pricing");
}
