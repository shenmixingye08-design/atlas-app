import type { Metadata } from "next";
import { SignUp } from "@clerk/nextjs";

import { AuthShell } from "@/components/auth/auth-shell";
import { ATLAS_APP_HOME_PATH } from "@/lib/auth/public-routes";
import { atlasClerkAppearance } from "@/lib/clerk/appearance";

export const metadata: Metadata = {
  title: "無料で最初の仕事を終わらせる",
  description:
    "ChatGPT・Claude・Geminiは答えて終わる。MINERVOTは仕事を終わらせます。無料で1件完成まで。月980円から。",
  robots: { index: false, follow: true },
};

export default function SignUpPage() {
  return (
    <AuthShell
      title="無料で最初の仕事を終わらせる"
      subtitle="登録後、仕事を1つ選ぶだけ。会話ではなく、完成まで進みます。"
    >
      <SignUp
        appearance={atlasClerkAppearance}
        routing="path"
        path="/sign-up"
        signInUrl="/sign-in"
        forceRedirectUrl={ATLAS_APP_HOME_PATH}
        fallbackRedirectUrl={ATLAS_APP_HOME_PATH}
      />
    </AuthShell>
  );
}
