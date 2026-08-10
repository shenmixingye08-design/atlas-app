"use client";

/**
 * Official Clerk Sign-in Token consumer for Production.
 *
 * When `__clerk_ticket` is present, runs SignInFuture.ticket() + finalize().
 * When absent, renders children unchanged (Google SignIn UI untouched).
 *
 * This is NOT an auth bypass — it only redeems Clerk Backend sign-in tokens.
 */

import { useAuth, useSignIn } from "@clerk/nextjs";
import { useRouter, useSearchParams } from "next/navigation";
import { useEffect, useRef, useState, type ReactNode } from "react";

import { AuthShell } from "@/components/auth/auth-shell";
import { ATLAS_APP_HOME_PATH } from "@/lib/auth/public-routes";

type SignInTicketConsumerProps = {
  children: ReactNode;
};

export function SignInTicketConsumer({ children }: SignInTicketConsumerProps) {
  const { signIn } = useSignIn();
  const { isSignedIn } = useAuth();
  const searchParams = useSearchParams();
  const router = useRouter();
  const ticket = searchParams.get("__clerk_ticket");
  const redirectUrl =
    searchParams.get("redirect_url") || ATLAS_APP_HOME_PATH;
  const [errorText, setErrorText] = useState<string | null>(null);
  const startedRef = useRef(false);

  useEffect(() => {
    if (!ticket || isSignedIn || !signIn || startedRef.current) {
      if (ticket && isSignedIn) {
        router.replace(redirectUrl);
      }
      return;
    }

    startedRef.current = true;

    void (async () => {
      try {
        const { error } = await signIn.ticket({ ticket });
        if (error) {
          const msg =
            typeof error === "object" &&
            error &&
            "message" in error &&
            typeof (error as { message?: unknown }).message === "string"
              ? (error as { message: string }).message
              : "ticket_redeem_error";
          setErrorText(msg.slice(0, 180));
          startedRef.current = false;
          return;
        }
        if (signIn.status !== "complete") {
          setErrorText(`ticket_incomplete:${signIn.status}`);
          startedRef.current = false;
          return;
        }
        await signIn.finalize({
          navigate: async ({ decorateUrl }) => {
            const url = decorateUrl(redirectUrl);
            if (url.startsWith("http")) {
              window.location.href = url;
              return;
            }
            router.replace(url);
          },
        });
      } catch (err) {
        setErrorText(
          err instanceof Error ? err.message.slice(0, 180) : "ticket_threw",
        );
        startedRef.current = false;
      }
    })();
  }, [ticket, signIn, isSignedIn, redirectUrl, router]);

  if (ticket && !isSignedIn && !errorText) {
    return (
      <AuthShell title="ログイン" subtitle="サインインを完了しています…">
        <div
          className="h-24 animate-pulse rounded-xl bg-[var(--surface-muted)]"
          data-testid="sign-in-ticket-working"
          aria-busy="true"
        />
      </AuthShell>
    );
  }

  if (ticket && errorText) {
    return (
      <>
        <p className="sr-only" data-testid="sign-in-ticket-error">
          {errorText}
        </p>
        {children}
      </>
    );
  }

  return <>{children}</>;
}
