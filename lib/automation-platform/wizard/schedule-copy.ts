import type { AutomationWizardDraft } from "./types";

const DAY_LABELS = ["日", "月", "火", "水", "木", "金", "土"] as const;

function pad(n: number): string {
  return String(n).padStart(2, "0");
}

export function formatTimeLabel(hour: number, minute: number): string {
  return `${pad(hour)}:${pad(minute)}`;
}

/** Human-readable schedule — never expose cron. */
export function describeSchedule(draft: AutomationWizardDraft): string {
  if (draft.triggerType === "manual") {
    return "必要なときに手動で実行します";
  }

  const time = formatTimeLabel(draft.hour, draft.minute);
  const tz = draft.timezone === "Asia/Tokyo" ? "（日本時間）" : `（${draft.timezone}）`;

  switch (draft.frequency) {
    case "once":
      return draft.runAt
        ? `指定日時（${new Date(draft.runAt).toLocaleString("ja-JP")}）に1回だけ実行します${tz}`
        : "指定日時に1回だけ実行します";
    case "daily":
      return `毎日 ${time} に実行します${tz}`;
    case "weekdays":
      return `平日のみ ${time} に実行します${tz}`;
    case "weekly":
    case "custom_days": {
      const days = (draft.daysOfWeek.length ? draft.daysOfWeek : [1])
        .map((d) => `${DAY_LABELS[d] ?? "?"}曜日`)
        .join("・");
      return `毎週${days}の ${time} に実行します${tz}`;
    }
    case "monthly":
      return `毎月${draft.dayOfMonth}日の ${time} に実行します${tz}`;
    case "month_end":
      return `毎月末の ${time} に実行します${tz}`;
    default:
      return "実行タイミングを設定してください";
  }
}

export function describeSteps(draft: AutomationWizardDraft): string {
  const enabled = draft.steps.filter((step) => step.enabled);
  if (enabled.length === 0) return "やることがまだありません";
  return enabled.map((step, index) => `${index + 1}. ${step.name}`).join(" → ");
}

export function describeExecutionPolicy(draft: AutomationWizardDraft): string {
  switch (draft.executionMode) {
    case "review_before_run":
      return "毎回、実行前に内容を確認し、承認後に開始します";
    case "run_then_notify":
      return "指定の時間になると自動で実行し、完了後に通知します。外部送信・公開など安全上必要な確認は別途行います";
    case "approve_first_then_auto":
      return "初回だけ確認し、以降は自動で実行します（高リスク操作は毎回確認）";
    case "review_high_risk_only":
      return "ファイル作成などは自動で行い、投稿・送信・公開の前だけ確認します";
    case "review_selected_steps":
      return "指定した手順の前だけ確認します";
    default:
      return "実行前の確認方法を選んでください";
  }
}

export function buildHumanSummary(draft: AutomationWizardDraft): string {
  const schedule = describeSchedule(draft);
  const steps = describeSteps(draft);
  const approval = describeExecutionPolicy(draft);
  const notes = draft.freeformNotes.trim()
    ? `備考: ${draft.freeformNotes.trim()}`
    : "備考はありません。";

  return [
    `${draft.name || "名称未設定"}を自動化します。`,
    schedule + "。",
    `やること: ${steps}`,
    approval + "。",
    notes,
  ].join("\n");
}
