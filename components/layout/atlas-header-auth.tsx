"use client";

import {
  Show,
  SignInButton,
  SignUpButton,
  UserButton,
} from "@clerk/nextjs";
import Link from "next/link";

import { useTheme } from "@/components/theme/theme-provider";
import { ATLAS_APP_HOME_PATH } from "@/lib/auth/public-routes";
import { getAtlasClerkAppearance } from "@/lib/clerk/appearance";
import { cn } from "@/lib/design-system/cn";

type AtlasHeaderAuthProps = {
  /** shell = post-login top bar (theme tokens); landing = marketing nav */
  variant?: "shell" | "landing";
};

export function AtlasHeaderAuth({ variant = "landing" }: AtlasHeaderAuthProps) {
  const { resolved } = useTheme();
  const isShell = variant === "shell";
  const appearance = getAtlasClerkAppearance(resolved);

  return (
    <div className="flex items-center gap-1 sm:gap-2">
      <Show when="signed-out">
        <SignInButton mode="redirect">
          <button
            type="button"
            className={cn(
              "touch-target rounded-full px-3 py-1.5 text-xs transition-colors duration-200 focus-ring sm:px-4 sm:py-2 sm:text-sm",
              isShell
                ? "text-[var(--text-secondary)] hover:bg-[var(--accent-muted)] hover:text-[var(--accent)]"
                : "text-[#75686B] hover:text-[#74172A]",
            )}
          >
            ログイン
          </button>
        </SignInButton>

        <SignUpButton mode="redirect">
          <button
            type="button"
            className={cn(
              "touch-target rounded-full px-3 py-1.5 text-xs font-medium transition-all duration-300 focus-ring sm:px-4 sm:py-2 sm:text-sm",
              isShell
                ? "hidden border border-[var(--accent)] bg-[var(--accent)] text-[var(--accent-foreground)] shadow-[var(--shadow-sm)] hover:bg-[var(--accent-hover)] sm:inline-flex"
                : "hidden border border-[#74172A] bg-[#74172A] text-white shadow-[0_10px_28px_rgba(116,23,42,0.2)] hover:-translate-y-0.5 hover:bg-[#5F1222] hover:shadow-[0_14px_34px_rgba(116,23,42,0.28)] active:scale-[0.98] sm:inline-flex",
            )}
          >
            新規登録
          </button>
        </SignUpButton>
      </Show>

      <Show when="signed-in">
        <UserButton appearance={appearance} />
      </Show>
    </div>
  );
}

/** Compact auth links for the landing page nav. */
export function AtlasLandingAuth() {
  const { resolved } = useTheme();
  const appearance = getAtlasClerkAppearance(resolved);

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

        <UserButton appearance={appearance} />
      </Show>
    </div>
  );
}
