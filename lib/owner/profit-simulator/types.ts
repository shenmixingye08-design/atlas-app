import type { PlanId } from "@/lib/billing/plans/types";

export type PlanSubscriberCounts = Record<PlanId, number>;

export type ProfitSimulatorInput = {
  subscribers: PlanSubscriberCounts;
  /** Monthly AI API cost (JPY). */
  apiCostJpy: number;
  /** Monthly server / infra cost (JPY). */
  serverCostJpy: number;
  /** Monthly Stripe transaction fees (JPY). */
  stripeFeeJpy: number;
  /**
   * When true, {@link apiCostJpy} is month-to-date and extrapolated for
   * end-of-month profit forecast.
   */
  apiCostIsMonthToDate?: boolean;
};

export type ProfitPlanRow = {
  planId: PlanId;
  planName: string;
  subscribers: number;
  unitPriceJpy: number;
  revenueJpy: number;
};

export type ProfitCostRow = {
  id: "api" | "server" | "stripe";
  label: string;
  amountJpy: number;
};

export type ProfitSimulatorResult = {
  revenueJpy: number;
  mrrJpy: number;
  apiCostJpy: number;
  projectedApiCostJpy: number;
  totalCostJpy: number;
  profitJpy: number;
  profitMarginPercent: number;
  /** Projected profit at month end (API extrapolated when month-to-date). */
  endOfMonthProfitForecastJpy: number;
  paidSubscribers: number;
  totalSubscribers: number;
  planRows: readonly ProfitPlanRow[];
  costRows: readonly ProfitCostRow[];
  /** Paid subscribers needed to cover costs at current avg revenue per paid user. */
  breakEvenPaidSubscribers: number | null;
  avgRevenuePerPaidUserJpy: number;
  avgCostPerUserJpy: number;
  monthProgressPercent: number;
};

export type ProfitSimulatorScenario = {
  input: ProfitSimulatorInput;
  result: ProfitSimulatorResult;
  label: string;
  source: "live" | "custom";
};

export type ProfitSimulatorOptions = {
  now?: Date;
};
