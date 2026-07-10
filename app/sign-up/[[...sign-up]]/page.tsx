import type { Metadata } from "next";
import { SignUp } from "@clerk/nextjs";

import { AuthShell } from "@/components/auth/auth-shell";
import { atlasClerkAppearance } from "@/lib/clerk/appearance";
import { ATLAS_APP_HOME_PATH } from "@/lib/auth/public-routes";

export const metadata: Metadata = {
  title: "新規登録 — ATLAS",
  description: "無料でATLASアカウントを作成し、専属AI秘書を始めましょう。",
  robots: { index: false, follow: true },
};

export default function SignUpPage() {
  return (
    <AuthShell
      title="新規登録"
      subtitle="無料でATLASアカウントを作成"
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
