import type { Metadata } from "next";

import { AuthShell } from "@/components/auth/auth-shell";
import { SignUpPageClient } from "@/components/auth/sign-up-page-client";
import { lightPlanYenLabel } from "@/lib/landing/pay-reason";

export const metadata: Metadata = {
  title: "今すぐ1件終わらせる",
  description:
    `毎日のX投稿を、一度頼めばあとは確認するだけ。合えば月${lightPlanYenLabel()}。`,
  robots: { index: false, follow: true },
};

export default function SignUpPage() {
  return (
    <AuthShell
      title="今すぐ1件終わらせる"
      subtitle="「毎朝10時に投稿して」と一度頼む。あとは確認するだけ。"
    >
      <SignUpPageClient />
    </AuthShell>
  );
}
