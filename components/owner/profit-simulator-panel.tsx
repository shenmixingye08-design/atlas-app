"use client";

import { useMemo, useState } from "react";

import type {
  ProfitSimulatorInput,
  ProfitSimulatorResult,
  ProfitSimulatorScenario,
} from "@/lib/owner/profit-simulator";
import {
  compareProfitResults,
  simulateProfit,
} from "@/lib/owner/profit-simulator";
import { formatOwnerJpy, formatOwnerPercent } from "@/lib/owner/format";
import { cn } from "@/lib/design-system/cn";
import { ui } from "@/lib/i18n";
import { Card } from "@/components/ui/card";

type ProfitSimulatorProps = {
  baseline: ProfitSimulatorScenario;
};

function NumberField({
  label,
  value,
  onChange,
  min = 0,
  step = 1,
  suffix,
}: {
  label: string;
  value: number;
  onChange: (value: number) => void;
  min?: number;
  step?: number;
  suffix?: string;
}) {
  return (
    <label className="block space-y-1.5">
      <span className="text-sm text-[var(--text-secondary)]">{label}</span>
      <div className="flex items-center gap-2">
        <input
          type="number"
          min={min}
          step={step}
          value={value}
          onChange={(event) => onChange(Number(event.target.value) || 0)}
          className="w-full rounded-[var(--radius-lg)] border border-[var(--border)] bg-[var(--surface-muted)] px-3 py-2 text-sm text-foreground outline-none focus:border-[var(--accent)]"
        />
        {suffix && <span className="shrink-0 text-xs text-[var(--text-secondary)]">{suffix}</span>}
      </div>
    </label>
  );
}

function ResultCard({
  label,
  value,
  hint,
  accent = "default",
}: {
  label: string;
  value: string;
  hint?: React.ReactNode;
  accent?: "default" | "revenue" | "cost" | "profit" | "forecast";
}) {
  const classes = {
    default: "border-[var(--border)] bg-[var(--surface-muted)]",
    revenue: "border-[var(--success)]/25 bg-[var(--success-bg)]",
    cost: "border-[var(--error)]/25 bg-[var(--error-bg)]",
    profit: "border-[var(--accent)]/25 bg-[var(--accent-muted)]",
    forecast: "border-violet-400/20 bg-violet-500/10",
  } as const;

  return (
    <Card
      padding="lg"
      className={cn("border text-foreground shadow-none", classes[accent])}
    >
      <p className="text-sm text-[var(--text-secondary)]">{label}</p>
      <p className="mt-2 text-2xl font-semibold tracking-tight">{value}</p>
      {hint && <div className="mt-1 text-xs text-[var(--text-secondary)]">{hint}</div>}
    </Card>
  );
}

function DeltaBadge({ value, suffix = "円" }: { value: number; suffix?: string }) {
  const positive = value >= 0;
  return (
    <span
      className={cn(
        "inline-flex rounded-full px-2 py-0.5 text-xs font-medium ring-1 ring-inset",
        positive
          ? "bg-[var(--success-bg)] text-[var(--success)] ring-[var(--success)]/25"
          : "bg-[var(--error-bg)] text-[var(--error)] ring-[var(--error)]/25",
      )}
    >
      {positive ? "+" : ""}
      {value.toLocaleString("ja-JP")}
      {suffix}
    </span>
  );
}

export function ProfitSimulatorPanel({ baseline }: ProfitSimulatorProps) {
  const [input, setInput] = useState<ProfitSimulatorInput>(baseline.input);

  const result: ProfitSimulatorResult = useMemo(
    () => simulateProfit(input),
    [input],
  );

  const delta = useMemo(
    () => compareProfitResults(baseline.result, result),
    [baseline.result, result],
  );

  const updateSubscriber = (
    plan: keyof ProfitSimulatorInput["subscribers"],
    value: number,
  ) => {
    setInput((current) => ({
      ...current,
      subscribers: { ...current.subscribers, [plan]: value },
    }));
  };

  const resetToBaseline = () => setInput(baseline.input);

  return (
    <div className="space-y-8 animate-fade-up">
      <header className="space-y-2">
        <p className="text-sm text-[var(--text-secondary)]">{ui.owner.simulatorEyebrow}</p>
        <h1 className="text-display text-foreground">{ui.owner.simulatorTitle}</h1>
        <p className="max-w-2xl text-body text-[var(--text-secondary)]">
          {ui.owner.simulatorSubtitle}
        </p>
      </header>

      <div className="grid gap-6 xl:grid-cols-2">
        <Card
          padding="lg"
          className="space-y-5 border border-[var(--border)] bg-[var(--surface-muted)] text-foreground shadow-none"
        >
          <div className="flex items-center justify-between gap-3">
            <h2 className="text-base font-semibold">{ui.owner.simulatorInputs}</h2>
            <button
              type="button"
              onClick={resetToBaseline}
              className="text-xs text-sky-300 hover:text-sky-200 focus-ring rounded-md"
            >
              {ui.owner.simulatorReset}
            </button>
          </div>

          <div className="grid gap-3 sm:grid-cols-2">
            <NumberField
              label={ui.owner.simulatorFreeCount}
              value={input.subscribers.free}
              onChange={(value) => updateSubscriber("free", value)}
            />
            <NumberField
              label={ui.owner.simulatorLightCount}
              value={input.subscribers.light}
              onChange={(value) => updateSubscriber("light", value)}
            />
            <NumberField
              label={ui.owner.simulatorStandardCount}
              value={input.subscribers.standard}
              onChange={(value) => updateSubscriber("standard", value)}
            />
            <NumberField
              label={ui.owner.simulatorPremiumCount}
              value={input.subscribers.premium}
              onChange={(value) => updateSubscriber("premium", value)}
            />
          </div>

          <div className="grid gap-3 sm:grid-cols-2">
            <NumberField
              label={ui.owner.simulatorApiCost}
              value={input.apiCostJpy}
              onChange={(value) =>
                setInput((current) => ({ ...current, apiCostJpy: value }))
              }
              suffix="JPY"
            />
            <NumberField
              label={ui.owner.simulatorServerCost}
              value={input.serverCostJpy}
              onChange={(value) =>
                setInput((current) => ({ ...current, serverCostJpy: value }))
              }
              suffix="JPY"
            />
            <NumberField
              label={ui.owner.simulatorStripeFee}
              value={input.stripeFeeJpy}
              onChange={(value) =>
                setInput((current) => ({ ...current, stripeFeeJpy: value }))
              }
              suffix="JPY"
            />
          </div>
        </Card>

        <div className="space-y-4">
          <div className="grid gap-4 sm:grid-cols-2">
            <ResultCard
              label={ui.owner.simulatorRevenue}
              value={formatOwnerJpy(result.revenueJpy)}
              hint={
                delta.revenueDeltaJpy !== 0 ? (
                  <DeltaBadge value={delta.revenueDeltaJpy} />
                ) : (
                  ui.owner.simulatorBaselineMatch
                )
              }
              accent="revenue"
            />
            <ResultCard
              label={ui.owner.simulatorProfit}
              value={formatOwnerJpy(result.profitJpy)}
              hint={
                delta.profitDeltaJpy !== 0 ? (
                  <DeltaBadge value={delta.profitDeltaJpy} />
                ) : undefined
              }
              accent="profit"
            />
            <ResultCard
              label={ui.owner.simulatorMargin}
              value={formatOwnerPercent(result.profitMarginPercent)}
              hint={ui.owner.simulatorMarginDelta(delta.marginDeltaPoints)}
            />
            <ResultCard
              label={ui.owner.simulatorEndOfMonthForecast}
              value={formatOwnerJpy(result.endOfMonthProfitForecastJpy)}
              hint={
                <>
                  {result.projectedApiCostJpy !== result.apiCostJpy && (
                    <span className="block">
                      {ui.owner.simulatorForecastApiHint(
                        formatOwnerJpy(result.projectedApiCostJpy),
                        result.monthProgressPercent,
                      )}
                    </span>
                  )}
                  {delta.forecastDeltaJpy !== 0 && (
                    <DeltaBadge value={delta.forecastDeltaJpy} />
                  )}
                </>
              }
              accent="forecast"
            />
          </div>

          <Card
            padding="lg"
            className="border border-[var(--border)] bg-[var(--surface-muted)] text-foreground shadow-none"
          >
            <p className="text-sm font-medium text-sky-100">
              {ui.owner.simulatorBreakEven}
            </p>
            <p className="mt-1 text-3xl font-semibold">
              {result.breakEvenPaidSubscribers ?? "—"}
              {result.breakEvenPaidSubscribers !== null && (
                <span className="ml-1 text-sm font-normal text-[var(--text-secondary)]">
                  {ui.owner.simulatorBreakEvenUnit}
                </span>
              )}
            </p>
            <p className="mt-2 text-xs text-[var(--text-secondary)]">
              {ui.owner.simulatorAvgMetrics(
                formatOwnerJpy(result.avgRevenuePerPaidUserJpy),
                formatOwnerJpy(result.avgCostPerUserJpy),
              )}
            </p>
          </Card>
        </div>
      </div>

      <Card
        padding="lg"
        className="space-y-5 border border-[var(--border)] bg-[var(--surface-muted)] text-foreground shadow-none"
      >
        <h2 className="text-base font-semibold">{ui.owner.simulatorBreakdown}</h2>

        <div className="grid gap-6 lg:grid-cols-2">
          <div>
            <p className="mb-2 text-sm font-medium text-[var(--text-secondary)]">
              {ui.owner.simulatorPlanRevenue}
            </p>
            <div className="overflow-x-auto">
              <table className="min-w-full text-sm">
                <thead>
                  <tr className="border-b border-[var(--border)] text-left text-[var(--text-secondary)]">
                    <th className="pb-2 pr-4 font-medium">{ui.owner.planColumn}</th>
                    <th className="pb-2 pr-4 font-medium">
                      {ui.owner.subscribersColumn}
                    </th>
                    <th className="pb-2 font-medium">{ui.owner.mrrColumn}</th>
                  </tr>
                </thead>
                <tbody>
                  {result.planRows.map((row) => (
                    <tr
                      key={row.planId}
                      className="border-b border-[var(--border)] last:border-0"
                    >
                      <td className="py-2 pr-4">{row.planName}</td>
                      <td className="py-2 pr-4 text-[var(--text-secondary)]">{row.subscribers}</td>
                      <td className="py-2">{formatOwnerJpy(row.revenueJpy)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>

          <div>
            <p className="mb-2 text-sm font-medium text-[var(--text-secondary)]">
              {ui.owner.simulatorCostBreakdown}
            </p>
            <ul className="space-y-2">
              {result.costRows.map((row) => (
                <li
                  key={row.id}
                  className="flex items-center justify-between rounded-[var(--radius-lg)] bg-[var(--surface-muted)] px-3 py-2 text-sm"
                >
                  <span className="text-[var(--text-secondary)]">{row.label}</span>
                  <span>{formatOwnerJpy(row.amountJpy)}</span>
                </li>
              ))}
              <li className="flex items-center justify-between border-t border-[var(--border)] px-3 pt-2 text-sm font-semibold">
                <span>{ui.owner.simulatorTotalCost}</span>
                <span>{formatOwnerJpy(result.totalCostJpy)}</span>
              </li>
            </ul>
          </div>
        </div>
      </Card>

      <p className="text-xs text-[var(--text-muted)]">{ui.owner.simulatorNote}</p>
    </div>
  );
}
