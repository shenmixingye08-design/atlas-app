"use client";

import { useCallback, useEffect, useState } from "react";

import type { BetaUserManagementSnapshot } from "@/lib/owner/beta-users/types";
import { cn } from "@/lib/design-system/cn";
import { formatOwnerPercent } from "@/lib/owner/format";
import { ui } from "@/lib/i18n";
import { Card } from "@/components/ui/card";

async function fetchSnapshot(): Promise<BetaUserManagementSnapshot> {
  const response = await fetch("/api/owner/beta-users", { cache: "no-store" });
  if (!response.ok) {
    throw new Error("Failed to load beta users");
  }
  return response.json() as Promise<BetaUserManagementSnapshot>;
}

async function patchBetaUser(input: {
  action: "add" | "remove";
  email: string;
}): Promise<BetaUserManagementSnapshot> {
  const response = await fetch("/api/owner/beta-users", {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(input),
  });

  if (!response.ok) {
    throw new Error("Failed to update beta user");
  }

  return response.json() as Promise<BetaUserManagementSnapshot>;
}

function SummaryCard({
  label,
  value,
  hint,
}: {
  label: string;
  value: string;
  hint?: string;
}) {
  return (
    <div className="rounded-[var(--radius-xl)] border border-[var(--border)] bg-[var(--surface-muted)] p-5">
      <p className="text-xs text-[var(--text-secondary)]">{label}</p>
      <p className="mt-2 text-2xl font-semibold text-foreground">{value}</p>
      {hint && <p className="mt-1 text-xs text-[var(--text-muted)]">{hint}</p>}
    </div>
  );
}

export function BetaUsersPanel() {
  const [snapshot, setSnapshot] = useState<BetaUserManagementSnapshot | null>(
    null,
  );
  const [error, setError] = useState<string | null>(null);
  const [emailInput, setEmailInput] = useState("");
  const [busy, setBusy] = useState(false);

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

  async function handleAdd(event: React.FormEvent) {
    event.preventDefault();
    if (!emailInput.trim()) return;

    setBusy(true);
    setError(null);
    try {
      setSnapshot(
        await patchBetaUser({ action: "add", email: emailInput.trim() }),
      );
      setEmailInput("");
    } catch {
      setError(ui.betaUsers.addError);
    } finally {
      setBusy(false);
    }
  }

  async function handleRemove(email: string) {
    setBusy(true);
    setError(null);
    try {
      setSnapshot(await patchBetaUser({ action: "remove", email }));
    } catch {
      setError(ui.betaUsers.removeError);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="space-y-8">
      <header className="space-y-2">
        <p className="text-xs font-medium uppercase tracking-[0.2em] text-sky-300/80">
          {ui.betaUsers.eyebrow}
        </p>
        <h1 className="text-3xl font-semibold tracking-tight text-foreground">
          {ui.betaUsers.title}
        </h1>
        <p className="max-w-2xl text-sm leading-relaxed text-[var(--text-secondary)]">
          {ui.betaUsers.subtitle}
        </p>
      </header>

      {error && (
        <Card padding="md" className="border-rose-400/30 bg-[var(--error-bg)] text-rose-100">
          {error}
        </Card>
      )}

      {!snapshot ? (
        <Card padding="lg" className="border-[var(--border)] bg-[var(--surface-muted)] text-foreground shadow-none">
          <p className="text-sm text-[var(--text-secondary)]">{ui.betaUsers.loading}</p>
        </Card>
      ) : (
        <>
          <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
            <SummaryCard
              label={ui.betaUsers.betaCountLabel}
              value={snapshot.betaParticipantCount.toLocaleString("ja-JP")}
              hint={
                snapshot.isEstimated ? ui.betaUsers.estimatedBadge : undefined
              }
            />
            <SummaryCard
              label={ui.betaUsers.generalCountLabel}
              value={snapshot.generalUserCount.toLocaleString("ja-JP")}
            />
            <SummaryCard
              label={ui.betaUsers.participationRateLabel}
              value={
                snapshot.participationRatePercent === null
                  ? "—"
                  : formatOwnerPercent(snapshot.participationRatePercent)
              }
            />
            <SummaryCard
              label={ui.betaUsers.betaFeaturesLabel}
              value={String(snapshot.betaFeatures.length)}
            />
          </div>

          <Card padding="lg" className="border-[var(--border)] bg-[var(--surface-muted)] text-foreground shadow-none">
            <h2 className="mb-4 text-lg font-semibold">
              {ui.betaUsers.featuresTitle}
            </h2>
            {snapshot.betaFeatures.length === 0 ? (
              <p className="text-sm text-[var(--text-secondary)]">{ui.betaUsers.noBetaFeatures}</p>
            ) : (
              <ul className="space-y-3">
                {snapshot.betaFeatures.map((feature) => (
                  <li
                    key={feature.featureId}
                    className="flex flex-wrap items-center justify-between gap-2 rounded-[var(--radius-lg)] border border-[var(--border)] bg-[var(--surface-muted)] px-4 py-3"
                  >
                    <span className="font-medium text-foreground">{feature.label}</span>
                    <span className="rounded-full bg-[var(--warning-bg)] px-2.5 py-0.5 text-xs font-medium text-amber-100 ring-1 ring-inset ring-[var(--warning)]/25">
                      {ui.featureFlags.stateBeta}
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </Card>

          <Card padding="lg" className="border-[var(--border)] bg-[var(--surface-muted)] text-foreground shadow-none">
            <div className="mb-6 flex flex-wrap items-end justify-between gap-4">
              <div>
                <h2 className="text-lg font-semibold">{ui.betaUsers.usersTitle}</h2>
                <p className="mt-1 text-xs text-[var(--text-secondary)]">
                  {ui.betaUsers.generatedAt(snapshot.generatedAt)}
                </p>
              </div>
              <form
                onSubmit={(event) => void handleAdd(event)}
                className="flex flex-wrap items-center gap-2"
              >
                <input
                  type="email"
                  value={emailInput}
                  onChange={(event) => setEmailInput(event.target.value)}
                  placeholder={ui.betaUsers.emailPlaceholder}
                  className="rounded-full border border-[var(--border)] bg-[var(--surface-muted)] px-4 py-2 text-sm text-foreground placeholder:text-[var(--text-muted)] focus:border-[var(--accent)] focus:outline-none"
                  disabled={busy}
                />
                <button
                  type="submit"
                  disabled={busy || !emailInput.trim()}
                  className={cn(
                    "rounded-full px-4 py-2 text-sm font-medium transition-colors",
                    busy || !emailInput.trim()
                      ? "cursor-not-allowed bg-[var(--surface-muted)] text-[var(--text-muted)]"
                      : "bg-sky-500/20 text-sky-100 ring-1 ring-sky-400/30 hover:bg-sky-500/30",
                  )}
                >
                  {ui.betaUsers.addUser}
                </button>
              </form>
            </div>

            {snapshot.betaUsers.length === 0 ? (
              <p className="text-sm text-[var(--text-secondary)]">{ui.betaUsers.noBetaUsers}</p>
            ) : (
              <ul className="space-y-2">
                {snapshot.betaUsers.map((entry) => (
                  <li
                    key={entry.email}
                    className="flex flex-wrap items-center justify-between gap-3 rounded-[var(--radius-lg)] border border-[var(--border)] bg-[var(--surface-muted)] px-4 py-3"
                  >
                    <div className="min-w-0">
                      <p className="truncate font-medium text-foreground">{entry.email}</p>
                      <p className="text-xs text-[var(--text-secondary)]">
                        {entry.source === "env"
                          ? ui.betaUsers.sourceEnv
                          : ui.betaUsers.sourceRuntime}
                      </p>
                    </div>
                    <button
                      type="button"
                      onClick={() => void handleRemove(entry.email)}
                      disabled={busy}
                      className="rounded-full px-3 py-1.5 text-xs font-medium text-rose-100 ring-1 ring-inset ring-[var(--error)]/25 hover:bg-[var(--error-bg)] disabled:opacity-50"
                    >
                      {ui.betaUsers.removeUser}
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </Card>
        </>
      )}

      <p className="text-xs text-[var(--text-muted)]">{ui.betaUsers.note}</p>
    </div>
  );
}
