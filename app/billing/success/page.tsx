import { auth } from "@clerk/nextjs/server";
import { redirect } from "next/navigation";

import { completeMockCheckout } from "@/lib/billing/service";
import { isPlanId } from "@/lib/billing/plans";
import { BILLING_SETTINGS_PATH } from "@/lib/billing/stripe/config";
import { finalizeCheckoutSessionForUser } from "@/lib/billing/stripe/finalize-checkout-session";
import { isAtlasProduction } from "@/lib/runtime/is-production";

type PageProps = {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
};

/**
 * Stripe success_url landing. Verifies the Checkout Session, syncs plan state if
 * the webhook is slightly behind, then sends the user to settings/billing.
 * Production URLs must be atlasapp.jp so Clerk cookies remain available.
 */
export default async function BillingSuccessPage({ searchParams }: PageProps) {
  const params = await searchParams;
  const sessionId =
    typeof params.session_id === "string" ? params.session_id.trim() : null;
  const mode = typeof params.mode === "string" ? params.mode : null;
  const planParam = typeof params.plan === "string" ? params.plan : null;

  const { userId } = await auth();

  if (!userId) {
    const returnPath = sessionId
      ? `/billing/success?session_id=${encodeURIComponent(sessionId)}`
      : "/billing/success";
    redirect(`/sign-in?redirect_url=${encodeURIComponent(returnPath)}`);
  }

  if (
    mode === "mock" &&
    planParam &&
    isPlanId(planParam) &&
    !isAtlasProduction()
  ) {
    completeMockCheckout(userId, planParam);
    redirect(`${BILLING_SETTINGS_PATH}?checkout=success&plan=${planParam}`);
  }

  if (sessionId && sessionId.startsWith("cs_")) {
    const result = await finalizeCheckoutSessionForUser({
      userId,
      sessionId,
    });
    if (result.planId) {
      redirect(
        `${BILLING_SETTINGS_PATH}?checkout=success&plan=${result.planId}`,
      );
    }
  }

  redirect(`${BILLING_SETTINGS_PATH}?checkout=success`);
}
