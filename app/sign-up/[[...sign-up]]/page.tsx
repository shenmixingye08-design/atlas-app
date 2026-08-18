import type { Metadata } from "next";

import { AuthShell } from "@/components/auth/auth-shell";
import { SignUpPageClient } from "@/components/auth/sign-up-page-client";
import { lightPlanYenLabel } from "@/lib/landing/pay-reason";

export const metadata: Metadata = {
  title: "今すぐ1件終わらせる",
  description:
    `一人で仕事を回す人のためのAI秘書。X投稿、メール、予定、資料作成を任せて、自分は確認するだけ。合えば月${lightPlanYenLabel()}。`,
  robots: { index: false, follow: true },
};

export default function SignUpPage() {
  return (
    <AuthShell
      title="今すぐ1件終わらせる"
      subtitle="X投稿、メール、資料作成。仕事を1つ選ぶだけ。自分は確認するだけ。"
    >
      <SignUpPageClient />
    </AuthShell>
  );
}
