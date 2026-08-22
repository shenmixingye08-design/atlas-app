import type { Metadata } from "next";

import { AuthShell } from "@/components/auth/auth-shell";
import { SignUpPageClient } from "@/components/auth/sign-up-page-client";
import { lightPlanYenLabel } from "@/lib/landing/pay-reason";

export const metadata: Metadata = {
  title: "無料で1回試す",
  description:
    `毎日のX投稿、一度頼んだら次からMINERVOTに任せる。合えば月${lightPlanYenLabel()}。`,
  robots: { index: false, follow: true },
};

export default function SignUpPage() {
  return (
    <AuthShell
      title="無料で1回試す"
      subtitle="「毎朝10時に投稿して」と一度頼む。次回から同じ指示は不要です。"
    >
      <SignUpPageClient />
    </AuthShell>
  );
}
