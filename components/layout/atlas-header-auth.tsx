"use client";

import {
  Show,
  SignInButton,
  SignUpButton,
  UserButton,
} from "@clerk/nextjs";
import Link from "next/link";

import { ATLAS_APP_HOME_PATH } from "@/lib/auth/public-routes";
import { atlasClerkAppearance } from "@/lib/clerk/appearance";

export function AtlasHeaderAuth() {
  return (
    <div className="flex items-center gap-2 sm:gap-3">
      <Show when="signed-out">
        <SignInButton mode="redirect">
          <button
            type="button"
            className="rounded-full px-3 py-1.5 text-xs text-[#75686B] transition-colors duration-200 hover:text-[#74172A] sm:px-4 sm:py-2 sm:text-sm focus-ring"
          >
            ログイン
          </button>
        </SignInButton>

        <SignUpButton mode="redirect">
          <button
            type="button"
            className="hidden rounded-full border border-[#74172A] bg-[#74172A] px-3 py-1.5 text-xs font-medium text-white shadow-[0_10px_28px_rgba(116,23,42,0.2)] transition-all duration-300 hover:-translate-y-0.5 hover:bg-[#5F1222] hover:shadow-[0_14px_34px_rgba(116,23,42,0.28)] active:scale-[0.98] sm:inline-flex sm:px-4 sm:py-2 sm:text-sm focus-ring"
          >
            新規登録
          </button>
        </SignUpButton>
      </Show>

      <Show when="signed-in">
        <UserButton appearance={atlasClerkAppearance} />
      </Show>
    </div>
  );
}

/** Compact auth links for the landing page nav. */
export function AtlasLandingAuth() {
  return (
    <div className="flex items-center gap-2 sm:gap-3">
      <Show when="signed-out">
        <SignInButton mode="redirect">
          <button
            type="button"
            className="touch-target rounded-full px-4 py-2 text-sm text-[#75686B] transition-colors hover:text-[#74172A] focus-ring"
          >
            ログイン
          </button>
        </SignInButton>

        <SignUpButton mode="redirect">
          <button
            type="button"
            className="touch-target rounded-full border border-[#74172A] bg-[#74172A] px-4 py-2 text-sm font-medium text-white shadow-[0_10px_28px_rgba(116,23,42,0.2)] transition-all duration-300 hover:-translate-y-0.5 hover:bg-[#5F1222] hover:shadow-[0_14px_34px_rgba(116,23,42,0.28)] active:scale-[0.98] focus-ring"
          >
            無料で始める
          </button>
        </SignUpButton>
      </Show>

      <Show when="signed-in">
        <Link
          href={ATLAS_APP_HOME_PATH}
          className="touch-target rounded-full border border-[#74172A] bg-[#74172A] px-4 py-2 text-sm font-medium text-white shadow-[0_10px_28px_rgba(116,23,42,0.2)] transition-all duration-300 hover:-translate-y-0.5 hover:bg-[#5F1222] hover:shadow-[0_14px_34px_rgba(116,23,42,0.28)] active:scale-[0.98] focus-ring"
        >
          MINERVOTを開く
        </Link>

        <UserButton appearance={atlasClerkAppearance} />
      </Show>
    </div>
  );
}
