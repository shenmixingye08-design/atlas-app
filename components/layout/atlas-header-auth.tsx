"use client";

import {
  Show,
  SignInButton,
  SignUpButton,
  UserButton,
} from "@clerk/nextjs";
import Link from "next/link";

import { atlasClerkAppearance } from "@/lib/clerk/appearance";
import { ATLAS_APP_HOME_PATH } from "@/lib/auth/public-routes";

export function AtlasHeaderAuth() {
  return (
    <div className="flex items-center gap-2 sm:gap-3">
      <Show when="signed-out">
        <SignInButton mode="redirect">
          <button
            type="button"
            className="rounded-full px-3 py-1.5 text-xs text-[var(--foreground-muted)] transition-colors duration-[var(--motion-fast)] hover:text-foreground sm:px-4 sm:py-2 sm:text-sm focus-ring"
          >
            ログイン
          </button>
        </SignInButton>
        <SignUpButton mode="redirect">
          <button
            type="button"
            className="hidden rounded-full bg-accent px-3 py-1.5 text-xs font-medium text-white transition-all duration-[var(--motion-base)] hover:bg-[var(--accent-hover)] active:scale-[0.98] sm:inline-flex sm:px-4 sm:py-2 sm:text-sm focus-ring"
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
            className="touch-target rounded-full px-4 py-2 text-sm text-[var(--foreground-muted)] transition-colors hover:text-foreground focus-ring"
          >
            ログイン
          </button>
        </SignInButton>
        <SignUpButton mode="redirect">
          <button
            type="button"
            className="touch-target rounded-full bg-accent px-4 py-2 text-sm font-medium text-white shadow-[var(--shadow-sm)] transition-all hover:bg-[var(--accent-hover)] active:scale-[0.98] focus-ring"
          >
            無料で始める
          </button>
        </SignUpButton>
      </Show>
      <Show when="signed-in">
        <Link
          href={ATLAS_APP_HOME_PATH}
          className="touch-target rounded-full bg-accent px-4 py-2 text-sm font-medium text-white shadow-[var(--shadow-sm)] transition-all hover:bg-[var(--accent-hover)] active:scale-[0.98] focus-ring"
        >
          ATLASを開く
        </Link>
        <UserButton appearance={atlasClerkAppearance} />
      </Show>
    </div>
  );
}
