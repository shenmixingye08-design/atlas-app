import type { Metadata } from "next";

import { ComingSoonPage } from "@/components/system-pages/coming-soon-page";

const SOLUTION_TITLES: Record<string, string> = {
  freelancer: "個人事業主向け",
  "office-worker": "会社員向け",
  executive: "経営者向け",
  creator: "クリエイター向け",
  restaurant: "飲食店向け",
  "construction-realestate": "建設・不動産向け",
  household: "ご家庭向け",
  student: "学生向け",
};

type PageProps = {
  params: Promise<{ slug: string }>;
};

export async function generateMetadata({ params }: PageProps): Promise<Metadata> {
  const { slug } = await params;
  const label = SOLUTION_TITLES[slug] ?? "ソリューション";
  return {
    title: `${label} — ATLAS（準備中）`,
    description: "このページは現在準備中です。",
    robots: { index: false, follow: true },
  };
}

export default async function SolutionComingSoonPage({ params }: PageProps) {
  const { slug } = await params;
  const label = SOLUTION_TITLES[slug] ?? "このページ";

  return (
    <ComingSoonPage
      title={`${label}の詳細ページ`}
      description="専用のご案内ページを準備しています。ホームページでATLASの概要をご覧いただけます。"
    />
  );
}
