"use client";

import { useState } from "react";

import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { resetOnboardingForRedo } from "@/lib/onboarding";
import { ui } from "@/lib/i18n";

type OnboardingSettingsProps = {
  onRedo: () => void;
};

export function OnboardingSettings({ onRedo }: OnboardingSettingsProps) {
  const [confirming, setConfirming] = useState(false);

  const handleRedo = () => {
    if (!confirming) {
      setConfirming(true);
      return;
    }
    resetOnboardingForRedo();
    setConfirming(false);
    onRedo();
  };

  return (
    <Card padding="lg" className="border-[var(--border-subtle)]">
      <h2 className="text-lg font-semibold text-foreground">{ui.onboarding.settingsTitle}</h2>
      <p className="mt-2 text-sm text-[var(--foreground-muted)]">
        {ui.onboarding.settingsDesc}
      </p>
      <div className="mt-5 flex flex-wrap gap-3">
        <Button variant={confirming ? "primary" : "secondary"} size="sm" onClick={handleRedo}>
          {confirming ? ui.onboarding.redoConfirm : ui.onboarding.redo}
        </Button>
        {confirming && (
          <Button variant="secondary" size="sm" onClick={() => setConfirming(false)}>
            {ui.onboarding.cancel}
          </Button>
        )}
      </div>
    </Card>
  );
}
