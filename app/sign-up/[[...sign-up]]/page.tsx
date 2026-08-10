import type { Metadata } from "next";
import { SignUp } from "@clerk/nextjs";

import { AuthShell } from "@/components/auth/auth-shell";
import { ATLAS_APP_HOME_PATH } from "@/lib/auth/public-routes";
import { atlasClerkAppearance } from "@/lib/clerk/appearance";

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
