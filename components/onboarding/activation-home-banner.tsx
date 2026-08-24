"use client";

import { useEffect, useState } from "react";

import {
  fetchActivationView,
  patchActivationProgress,
  type ActivationViewResponse,
} from "@/lib/activation/client";
import { ActivationChecklist } from "@/components/onboarding/activation-checklist";
import { ActivationPaywall } from "@/components/onboarding/activation-paywall";

export function ActivationHomeBanner() {
  const [view, setView] = useState<ActivationViewResponse | null>(null);

  useEffect(() => {
    void fetchActivationView()
      .then(setView)
      .catch(() => undefined);
  }, []);

  if (!view || view.progress.legacyUser) return null;

  const showPaywall =
    Boolean(view.progress.milestones.firstSuccessAt) &&
    !view.progress.paywallShownAfterSuccess &&
    view.planId === "free";

  return (
    <div className="space-y-4">
      <ActivationChecklist />
      {showPaywall ? (
        <ActivationPaywall
          planId={view.planId}
          reason="after_first_success"
          firstSuccess
          paid={false}
          onDismiss={() => {
            void patchActivationProgress({ paywallShownAfterSuccess: true });
            setView({
              ...view,
              progress: { ...view.progress, paywallShownAfterSuccess: true },
            });
          }}
        />
      ) : null}
    </div>
  );
}
