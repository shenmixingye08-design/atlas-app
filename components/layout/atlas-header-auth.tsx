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
                : "text-[var(--text-secondary)] hover:text-[var(--primary)]",
            )}
          >
            ログイン
          </button>
        </SignInButton>

        <SignUpButton mode="redirect">
          <button
            type="button"
            className={cn(
              "touch-target rounded-full px-3 py-1.5 text-xs font-medium transition-[transform,opacity,border-color,box-shadow] duration-[var(--motion-normal)] focus-ring sm:px-4 sm:py-2 sm:text-sm",
              isShell
                ? "hidden border border-[var(--accent)] bg-[var(--accent)] text-[var(--accent-foreground)] shadow-[var(--shadow-sm)] hover:bg-[var(--accent-hover)] sm:inline-flex"
                : "hidden border border-[var(--primary)] bg-[var(--primary)] text-white shadow-[var(--shadow-subtle)] [@media(hover:hover)]:hover:-translate-y-px hover:bg-[var(--primary-hover)]  active:scale-[0.98] sm:inline-flex",
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
    <div className="flex items-center gap-1 sm:gap-3">
      <Show when="signed-out">
        <SignInButton mode="redirect">
          <button
            type="button"
            className="touch-target rounded-full px-3 py-2 text-xs text-[var(--text-secondary)] transition-colors hover:text-[var(--primary)] focus-ring sm:px-4 sm:text-sm"
          >
            ログイン
          </button>
        </SignInButton>

        <SignUpButton mode="redirect">
          <button
            type="button"
            className="touch-target hidden rounded-[var(--radius-large)] border border-[var(--primary)] bg-[var(--primary)] px-3 py-2 text-xs font-medium text-white shadow-[var(--shadow-subtle)] transition-[transform,opacity,border-color,box-shadow] duration-[var(--motion-normal)] [@media(hover:hover)]:hover:-translate-y-px hover:bg-[var(--primary-hover)]  active:scale-[0.98] focus-ring min-[400px]:inline-flex sm:px-4 sm:text-sm"
          >
            無料で始める
          </button>
        </SignUpButton>
      </Show>

      <Show when="signed-in">
        <Link
          href={ATLAS_APP_HOME_PATH}
          className="touch-target rounded-[var(--radius-large)] border border-[var(--primary)] bg-[var(--primary)] px-3 py-2 text-xs font-medium text-white shadow-[var(--shadow-subtle)] transition-[transform,opacity,border-color,box-shadow] duration-[var(--motion-normal)] [@media(hover:hover)]:hover:-translate-y-px hover:bg-[var(--primary-hover)]  active:scale-[0.98] focus-ring sm:px-4 sm:text-sm"
        >
          MINERVOTを開く
        </Link>

        <UserButton appearance={appearance} />
      </Show>
    </div>
  );
}
