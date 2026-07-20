"use client";

import { Suspense } from "react";
import { SignIn } from "@clerk/nextjs";
import { useSearchParams } from "next/navigation";

import { AuthShell } from "@/components/auth/auth-shell";
import { SignInContinueNotice } from "@/components/auth/sign-in-continue-notice";
import { atlasClerkAppearance } from "@/lib/clerk/appearance";
import { ATLAS_APP_HOME_PATH } from "@/lib/auth/public-routes";

function SignInContent() {
  const searchParams = useSearchParams();
  const redirectUrl = searchParams.get("redirect_url") || ATLAS_APP_HOME_PATH;

  return (
    <AuthShell
      title="ログイン"
      subtitle="Googleまたはメールアドレスで、MINERVOTアカウントにサインインしてください"
    >
      <SignInContinueNotice />
      <SignIn
        appearance={atlasClerkAppearance}
        routing="path"
        path="/sign-in"
        signUpUrl="/sign-up"
        forceRedirectUrl={redirectUrl}
        fallbackRedirectUrl={ATLAS_APP_HOME_PATH}
      />
    </AuthShell>
  );
}

export function SignInPageClient() {
  return (
    <Suspense
      fallback={
        <AuthShell title="ログイン" subtitle="読み込み中…">
          <div className="h-40 animate-pulse rounded-xl bg-[var(--surface-muted)]" />
        </AuthShell>
      }
    >
      <SignInContent />
    </Suspense>
  );
}
