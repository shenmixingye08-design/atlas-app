import type { Metadata } from "next";
import { redirect } from "next/navigation";

export const metadata: Metadata = {
  title: "使い方 | MINERVOT",
  description:
    "仕事を選ぶ → 1回依頼 → 完成。ChatGPT・Claude・Geminiは答えて終わる。MINERVOTは仕事を終わらせます。",
};

/** 公開用ショートカット。本体はホームページの使い方。 */
export default function CapabilitiesPublicPage() {
  redirect("/#first-path");
}
