import type { Metadata } from "next";

import { SignInPageClient } from "@/components/auth/sign-in-page-client";

export const metadata: Metadata = {
  title: "ログイン — MINERVOT",
  description: "MINERVOTアカウントにログインして、あなた専属のAI秘書をご利用ください。",
  robots: { index: false, follow: true },
};

export default function SignInPage() {
  return <SignInPageClient />;
}
