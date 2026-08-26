import type { PlanId } from "@/lib/billing/plans/types";

export type CancelAlternative = {
  id: "guide" | "bug_report" | "lower_plan" | "use_until_period_end";
  label: string;
  href: string | null;
};

/** Only real options. No pause, refund, or invented discount. */
export function cancelAlternatives(input: {
  planId: PlanId;
  reasonId: string | null;
}): CancelAlternative[] {
  const options: CancelAlternative[] = [];
  if (input.reasonId === "too_difficult") {
    options.push({ id: "guide", label: "使い方ガイドを見る", href: "/projects" });
  }
  if (input.reasonId === "not_working") {
    options.push({ id: "bug_report", label: "不具合を報告する", href: "/contact" });
  }
  if (input.planId === "standard" || input.planId === "premium") {
    options.push({
      id: "lower_plan",
      label: "下位プランを確認する",
      href: "/settings/billing",
    });
  }
  options.push({
    id: "use_until_period_end",
    label: "次回請求前まで現在のプランを利用できます",
    href: null,
  });
  return options;
}
