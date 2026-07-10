"use client";

import { useSearchParams } from "next/navigation";

import {
  ATLAS_LOGIN_CONTINUE_MESSAGE,
  ATLAS_LOGIN_CONTINUE_NOTICE,
} from "@/lib/auth/public-routes";

export function SignInContinueNotice() {
  const searchParams = useSearchParams();
  const notice = searchParams.get("notice");

  if (notice !== ATLAS_LOGIN_CONTINUE_NOTICE) {
    return null;
  }

  return (
    <p
      className="mb-4 rounded-xl border border-white/10 bg-white/5 px-4 py-3 text-center text-sm leading-relaxed text-zinc-300"
      role="status"
    >
      {ATLAS_LOGIN_CONTINUE_MESSAGE}
    </p>
  );
}
