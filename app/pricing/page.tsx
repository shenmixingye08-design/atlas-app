import type { Metadata } from "next";
import { redirect } from "next/navigation";

export const metadata: Metadata = {
  title: "料金 — ATLAS",
  description:
    "ATLASの料金プラン。無料から始められ、仕事の量に合わせてプランを選べます。",
};

/** 公開用ショートカット。本体はホームページの料金セクション。 */
export default function PricingPublicPage() {
  redirect("/#pricing");
}
