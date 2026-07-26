import { OwnerShell } from "@/components/owner/owner-shell";
import { ExecutiveMetricCard } from "@/components/owner/executive/metric-card";
import { requireAtlasOwner } from "@/lib/auth/require-atlas-owner";
import { getExecutiveDashboardSnapshot } from "@/lib/owner/executive";
import { formatOwnerJpy, formatOwnerPercent } from "@/lib/owner/format";

export const dynamic = "force-dynamic";

export default async function OwnerStripePage() {
  await requireAtlasOwner();
  const snapshot = await getExecutiveDashboardSnapshot("month");
  const s = snapshot.stripe;

  const cards = [
    {
      id: "today",
      label: "現在の売上（今日）",
      value: s.todayRevenueJpy != null ? formatOwnerJpy(s.todayRevenueJpy) : "—",
      availability: s.availability,
      statusMessage: s.statusMessage,
      hint: "Stripe Invoice",
      accent: "revenue" as const,
    },
    {
      id: "month",
      label: "今月売上",
      value: s.monthRevenueJpy != null ? formatOwnerJpy(s.monthRevenueJpy) : "—",
      availability: s.availability,
      statusMessage: s.statusMessage,
      hint: null,
      accent: "revenue" as const,
    },
    {
      id: "subs",
      label: "サブスク数",
      value: s.subscriptionCount?.toLocaleString("ja-JP") ?? "—",
      availability: "ok" as const,
      statusMessage: null,
      hint: null,
      accent: "default" as const,
    },
    {
      id: "renewal",
      label: "更新率",
      value:
        s.renewalRatePercent != null
          ? formatOwnerPercent(s.renewalRatePercent)
          : "—",
      availability: s.renewalRatePercent != null ? ("ok" as const) : ("empty" as const),
      statusMessage: null,
      hint: "100 − 解約率",
      accent: "default" as const,
    },
    {
      id: "churn",
      label: "解約率",
      value:
        s.churnRatePercent != null ? formatOwnerPercent(s.churnRatePercent) : "—",
      availability: s.churnRatePercent != null ? ("ok" as const) : ("empty" as const),
      statusMessage: null,
      hint: null,
      accent: "default" as const,
    },
    {
      id: "ltv",
      label: "LTV",
      value: s.ltvJpy != null ? formatOwnerJpy(s.ltvJpy) : "—",
      availability: s.ltvJpy != null ? ("ok" as const) : ("empty" as const),
      statusMessage: s.ltvJpy == null ? "解約率が0または未計測のため未計算" : null,
      hint: "ARPU ÷ 月次解約率",
      accent: "profit" as const,
    },
    {
      id: "arpu",
      label: "ARPU",
      value: s.arpuJpy != null ? formatOwnerJpy(s.arpuJpy) : "—",
      availability: s.arpuJpy != null ? ("ok" as const) : ("empty" as const),
      statusMessage: null,
      hint: "MRR ÷ 有料会員",
      accent: "default" as const,
    },
    {
      id: "mrr",
      label: "MRR",
      value: s.mrrJpy != null ? formatOwnerJpy(s.mrrJpy) : "—",
      availability: "ok" as const,
      statusMessage: null,
      hint: null,
      accent: "revenue" as const,
    },
  ];

  return (
    <OwnerShell active="stripe">
      <div className="space-y-6">
        <header>
          <h1 className="text-3xl font-semibold tracking-tight">Stripe管理</h1>
          <p className="mt-2 text-sm text-[var(--text-secondary)]">
            現金売上・サブスク指標。未接続時は推定しません。
          </p>
        </header>
        <section className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
          {cards.map((card, index) => (
            <ExecutiveMetricCard key={card.id} card={card} index={index} />
          ))}
        </section>
      </div>
    </OwnerShell>
  );
}
