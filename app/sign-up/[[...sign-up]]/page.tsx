import type { Metadata } from "next";
import { SignUp } from "@clerk/nextjs";

import { AuthShell } from "@/components/auth/auth-shell";
import { ATLAS_APP_HOME_PATH } from "@/lib/auth/public-routes";
import { atlasClerkAppearance } from "@/lib/clerk/appearance";

export const metadata: Metadata = {
  title: "新規登録",
  description: "無料でMINERVOTアカウントを作成し、あなた専属のAI秘書を始めましょう。",
  robots: { index: false, follow: true },
};

export default function SignUpPage() {
  return (
    <AuthShell
      title="新規登録"
      subtitle="Googleまたはメールアドレスで、無料でMINERVOTアカウントを作成できます"
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
