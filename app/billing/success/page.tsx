import Link from "next/link";
import { auth } from "@clerk/nextjs/server";
import { redirect } from "next/navigation";

import { AtlasAppShell } from "@/components/layout/atlas-app-shell";
import { completeMockCheckout } from "@/lib/billing/service";
import { isPlanId } from "@/lib/billing/plans";
import { ui } from "@/lib/i18n";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";

type PageProps = {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
};

export default async function BillingSuccessPage({ searchParams }: PageProps) {
  const params = await searchParams;
  const { userId } = await auth();

  if (!userId) {
    redirect("/sign-in");
  }

  const mode = typeof params.mode === "string" ? params.mode : null;
  const planParam = typeof params.plan === "string" ? params.plan : null;

  if (mode === "mock" && planParam && isPlanId(planParam)) {
    completeMockCheckout(userId, planParam);
  }

  return (
    <AtlasAppShell active="settings" width="default">
      <Card padding="lg" className="mx-auto max-w-lg text-center shadow-[var(--shadow-soft)]">
        <h1 className="text-title text-foreground">{ui.billing.successTitle}</h1>
        <p className="mt-3 text-body text-[var(--foreground-muted)]">
          {ui.billing.successSubtitle}
        </p>
        <div className="mt-8">
          <Link href="/settings/billing">
            <Button>{ui.billing.backToBilling}</Button>
          </Link>
        </div>
      </Card>
    </AtlasAppShell>
  );
}
