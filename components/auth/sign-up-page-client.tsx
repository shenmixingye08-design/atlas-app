"use client";

import { SignUp } from "@clerk/nextjs";

import { useThemedClerkAppearance } from "@/components/auth/use-themed-clerk-appearance";
import { ATLAS_APP_HOME_PATH } from "@/lib/auth/public-routes";

export function SignUpPageClient() {
  const appearance = useThemedClerkAppearance();

  return (
    <SignUp
      appearance={appearance}
      routing="path"
      path="/sign-up"
      signInUrl="/sign-in"
      forceRedirectUrl={ATLAS_APP_HOME_PATH}
      fallbackRedirectUrl={ATLAS_APP_HOME_PATH}
    />
  );
}
