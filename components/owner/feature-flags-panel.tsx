"use client";

import { useCallback, useEffect, useState } from "react";

import type {
  FeatureFlagId,
  FeatureFlagSnapshot,
  FeatureFlagState,
} from "@/lib/feature-flags";
import { FEATURE_FLAG_DEFINITIONS } from "@/lib/feature-flags";
import { cn } from "@/lib/design-system/cn";
import { ui } from "@/lib/i18n";
import { Card } from "@/components/ui/card";

const STATES: FeatureFlagState[] = ["on", "off", "beta"];

const STATE_LABELS: Record<FeatureFlagState, string> = {
  on: ui.featureFlags.stateOn,
  off: ui.featureFlags.stateOff,
  beta: ui.featureFlags.stateBeta,
};

const STATE_CLASSES: Record<FeatureFlagState, string> = {
  on: "border-emerald-400/40 bg-[var(--success-bg)] text-emerald-100",
  off: "border-[var(--border)] bg-[var(--surface-muted)] text-[var(--text-secondary)]",
  beta: "border-amber-400/40 bg-[var(--warning-bg)] text-amber-100",
};

async function fetchSnapshot(): Promise<FeatureFlagSnapshot> {
  const response = await fetch("/api/owner/feature-flags", { cache: "no-store" });
  if (!response.ok) {
    throw new Error("Failed to load feature flags");
  }
  return response.json() as Promise<FeatureFlagSnapshot>;
}

async function patchFlag(
  id: FeatureFlagId,
  state: FeatureFlagState,
): Promise<FeatureFlagSnapshot> {
  const response = await fetch("/api/owner/feature-flags", {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ id, state }),
  });

  if (!response.ok) {
    throw new Error("Failed to update feature flag");
  }

  return response.json() as Promise<FeatureFlagSnapshot>;
}

function FlagRow({
  id,
  label,
  description,
  category,
  state,
  busy,
  onChange,
}: {
  id: FeatureFlagId;
  label: string;
  description: string;
  category: "integration" | "capability";
  state: FeatureFlagState;
  busy: boolean;
  onChange: (id: FeatureFlagId, state: FeatureFlagState) => void;
}) {
  return (
    <li className="rounded-[var(--radius-xl)] border border-[var(--border)] bg-[var(--surface-muted)] p-5">
      <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
        <div className="min-w-0 space-y-1">
          <div className="flex flex-wrap items-center gap-2">
            <h3 className="text-base font-semibold text-foreground">{label}</h3>
            <span className="rounded-full bg-[var(--surface-muted)] px-2 py-0.5 text-xs text-[var(--text-secondary)]">
              {category === "integration"
                ? ui.featureFlags.categoryIntegration
                : ui.featureFlags.categoryCapability}
            </span>
          </div>
          <p className="text-sm text-[var(--text-muted)]">{description}</p>
        </div>

        <div
          className="flex shrink-0 gap-2"
          role="group"
          aria-label={ui.featureFlags.toggleGroup(label)}
        >
          {STATES.map((option) => {
            const selected = state === option;
            return (
              <button
                key={option}
                type="button"
                disabled={busy}
                onClick={() => onChange(id, option)}
                className={cn(
                  "rounded-full border px-4 py-2 text-sm font-medium transition-colors focus-ring disabled:opacity-50",
                  selected
                    ? STATE_CLASSES[option]
                    : "border-[var(--border)] text-[var(--text-secondary)] hover:border-[var(--border-strong)] hover:text-[var(--text-secondary)]",
                )}
                aria-pressed={selected}
              >
                {STATE_LABELS[option]}
              </button>
            );
          })}
        </div>
      </div>
    </li>
  );
}

export function FeatureFlagsPanel() {
  const [snapshot, setSnapshot] = useState<FeatureFlagSnapshot | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<FeatureFlagId | null>(null);

  const load = useCallback(async () => {
    setError(null);
    try {
      setSnapshot(await fetchSnapshot());
    } catch {
      setError(ui.error.generic);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const handleChange = async (id: FeatureFlagId, state: FeatureFlagState) => {
    setBusyId(id);
    setError(null);
    try {
      setSnapshot(await patchFlag(id, state));
    } catch {
      setError(ui.error.generic);
    } finally {
      setBusyId(null);
    }
  };

  const stateById = new Map(
    snapshot?.flags.map((record) => [record.id, record.state]) ?? [],
  );

  return (
    <div className="space-y-8">
      <header className="space-y-2">
        <p className="text-xs font-medium uppercase tracking-[0.2em] text-sky-300/80">
          {ui.featureFlags.eyebrow}
        </p>
        <h1 className="text-3xl font-semibold tracking-tight text-foreground">
          {ui.featureFlags.title}
        </h1>
        <p className="max-w-2xl text-sm leading-relaxed text-[var(--text-secondary)]">
          {ui.featureFlags.subtitle}
        </p>
      </header>

      {error && (
        <Card padding="md" className="border-rose-400/30 bg-[var(--error-bg)] text-rose-100">
          {error}
        </Card>
      )}

      <Card padding="lg" className="border-[var(--border)] bg-[var(--surface-muted)] text-foreground shadow-none">
        <div className="mb-6 flex flex-wrap items-center justify-between gap-3">
          <h2 className="text-lg font-semibold">{ui.featureFlags.listTitle}</h2>
          {snapshot && (
            <p className="text-xs text-[var(--text-secondary)]">
              {ui.featureFlags.updatedAt(snapshot.updatedAt)}
            </p>
          )}
        </div>

        {!snapshot ? (
          <p className="text-sm text-[var(--text-secondary)]">{ui.featureFlags.loading}</p>
        ) : (
          <ul className="space-y-3">
            {FEATURE_FLAG_DEFINITIONS.map((definition) => (
              <FlagRow
                key={definition.id}
                id={definition.id}
                label={definition.label}
                description={definition.description}
                category={definition.category}
                state={stateById.get(definition.id) ?? "on"}
                busy={busyId === definition.id}
                onChange={handleChange}
              />
            ))}
          </ul>
        )}
      </Card>

      <p className="text-xs text-[var(--text-muted)]">{ui.featureFlags.note}</p>
    </div>
  );
}
