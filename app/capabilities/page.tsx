import type { Metadata } from "next";
import { redirect } from "next/navigation";

export const metadata: Metadata = {
  title: "ATLASができること — ATLAS",
  description:
    "資料作成・整理・仕事の記憶・分析・改善提案・習慣のサポート。ATLASができる仕事をご紹介します。",
};

/** 公開用ショートカット。本体はホームページのセクション。 */
export default function CapabilitiesPublicPage() {
  redirect("/#capabilities");
}
