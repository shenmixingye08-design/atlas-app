"use client";

import { ACTIVATION_STEPS, type ActivationStepId } from "@/lib/activation";
import { cn } from "@/lib/design-system/cn";

export function ActivationProgress({
  currentStepId,
}: {
  currentStepId: ActivationStepId;
}) {
  const currentIndex =
    ACTIVATION_STEPS.find((step) => step.id === currentStepId)?.index ?? 1;

  return (
    <div
      className="space-y-2"
      aria-label={`初回体験 ${currentIndex}/4`}
    >
      <p className="text-[length:var(--text-caption)] font-semibold text-[var(--brand)]">
        {currentIndex}/4{" "}
        {ACTIVATION_STEPS.find((step) => step.id === currentStepId)?.label}
      </p>
      <ol className="flex gap-1.5" aria-hidden>
        {ACTIVATION_STEPS.map((step) => {
          const done = step.index < currentIndex;
          const active = step.index === currentIndex;
          return (
            <li
              key={step.id}
              className={cn(
                "h-1.5 flex-1 rounded-full transition-colors",
                done || active
                  ? "bg-[var(--brand)]"
                  : "bg-[var(--border-strong)]",
              )}
            />
          );
        })}
      </ol>
    </div>
  );
}
