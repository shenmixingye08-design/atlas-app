import type { Metadata } from "next";

import { AuthShell } from "@/components/auth/auth-shell";
import { SignUpPageClient } from "@/components/auth/sign-up-page-client";

export const metadata: Metadata = {
  title: "今すぐ1件終わらせる",
  description:
    "ChatGPTは答えて終わる。MINERVOTは仕事を終わらせます。依頼した仕事を進め、完成したらお知らせします。合えば月980円。",
  robots: { index: false, follow: true },
};

export default function SignUpPage() {
  return (
    <AuthShell
      title="今すぐ1件終わらせる"
      subtitle="設定なし。仕事を1つ選ぶだけ。終わった瞬間に元が取れたと感じる体験から始めます。"
    >
      <SignUpPageClient />
    </AuthShell>
  );
}
