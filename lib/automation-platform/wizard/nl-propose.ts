import { createStepFromCapability, createEmptyWizardDraft } from "./builders";
import {
  extractCalendarEventTitle,
  requiresGoogleCalendarAction,
} from "@/lib/automations/detect-external-intent";
import type { AutomationWizardDraft } from "./types";

/**
 * Rule-based proposal from natural language.
 * Does not call LLM (cost policy). Never auto-activates.
 * Unknown items stay unset for user confirmation.
 */
export function proposeWizardFromNaturalLanguage(
  text: string,
): AutomationWizardDraft {
  const draft = createEmptyWizardDraft({
    naturalLanguageSeed: text,
    freeformNotes: text,
    activateOnCreate: false,
    currentStepId: "timing",
  });

  const lower = text;

  // Schedule
  if (/手動|自分で実行|必要なとき/.test(lower)) {
    draft.triggerType = "manual";
  } else if (/毎日/.test(lower)) {
    draft.frequency = "daily";
  } else if (/平日/.test(lower)) {
    draft.frequency = "weekdays";
  } else if (/月末/.test(lower)) {
    draft.frequency = "month_end";
  } else if (/毎月/.test(lower)) {
    draft.frequency = "monthly";
  } else if (/毎週/.test(lower)) {
    draft.frequency = "weekly";
  } else if (/一回|一度だけ|1回/.test(lower)) {
    draft.frequency = "once";
  }

  const dayMap: Record<string, number> = {
    日: 0,
    月: 1,
    火: 2,
    水: 3,
    木: 4,
    金: 5,
    土: 6,
  };
  for (const [label, value] of Object.entries(dayMap)) {
    if (new RegExp(`${label}曜日`).test(lower)) {
      draft.daysOfWeek = [value];
      draft.frequency = "weekly";
    }
  }

  const timeMatch = lower.match(/(\d{1,2})\s*[:時]\s*(\d{2})?/);
  if (timeMatch) {
    draft.hour = Math.min(23, Number.parseInt(timeMatch[1]!, 10));
    draft.minute = timeMatch[2] ? Number.parseInt(timeMatch[2], 10) : 0;
  }

  // Steps — order matters for typical pipelines
  const steps = [];
  if (/売上|データ|読み込|抽出/.test(lower)) {
    steps.push(createStepFromCapability("data_extract"));
  }
  if (/Excel|エクセル|表にまと/.test(lower)) {
    steps.push(createStepFromCapability("excel_generate"));
  }
  if (/PowerPoint|パワポ|スライド/.test(lower)) {
    steps.push(createStepFromCapability("powerpoint_generate"));
  }
  if (/Word|文書|報告書|提案書/.test(lower)) {
    steps.push(createStepFromCapability("word_generate"));
  }
  if (/PDF/.test(lower)) {
    steps.push(createStepFromCapability("pdf_generate"));
  }
  if (/Dropbox|ドロップボックス|保存/.test(lower) && /Dropbox|ドロップボックス|フォルダ/.test(lower)) {
    steps.push(createStepFromCapability("dropbox"));
  } else if (/保存/.test(lower) && /Dropbox|ドライブ|フォルダ/.test(lower)) {
    steps.push(createStepFromCapability("dropbox"));
  }
  if (requiresGoogleCalendarAction(lower)) {
    const calendar = createStepFromCapability("google_calendar");
    const eventTitle = extractCalendarEventTitle(lower);
    calendar.configuration = {
      action: "create",
      ...(eventTitle ? { eventTitle } : {}),
    };
    steps.push(calendar);
  }
  if (/メール|Gmail/.test(lower)) {
    const mail = createStepFromCapability("gmail");
    mail.configuration = {
      mode: /送らず|下書き/.test(lower) ? "draft" : "draft",
    };
    steps.push(mail);
  }
  if (/投稿|ツイート|Xへ|Xに/.test(lower)) {
    steps.push(createStepFromCapability("x_post"));
  }
  if (/通知|知らせ/.test(lower)) {
    steps.push(createStepFromCapability("notify"));
  }

  // Never fall back to orchestrate when a Calendar external was requested —
  // that path caused production fake-success (2026-08-13).
  if (steps.length === 0) {
    steps.push(createStepFromCapability("orchestrate"));
  }

  draft.steps = steps;
  draft.name = deriveName(lower, steps.map((s) => s.name).join("・"));
  draft.description = "自然文からの提案です。内容を確認・修正してください。";
  draft.executionMode = /確認|承認/.test(lower)
    ? "review_before_run"
    : "run_then_notify";

  return draft;
}

function deriveName(text: string, stepLabel: string): string {
  if (requiresGoogleCalendarAction(text)) return "Googleカレンダー予定作成";
  if (/売上/.test(text)) return "売上まとめの自動化";
  if (/投稿/.test(text)) return "SNS投稿の自動化";
  if (/報告/.test(text)) return "報告書作成の自動化";
  return stepLabel ? `${stepLabel}の自動化` : "新しい自動化";
}

export type ProposalUnsetField = {
  field: string;
  label: string;
};

export function listUnsetProposalFields(
  draft: AutomationWizardDraft,
): ProposalUnsetField[] {
  const unset: ProposalUnsetField[] = [];
  if (draft.frequency === "once" && !draft.runAt) {
    unset.push({ field: "runAt", label: "実行日時" });
  }
  for (const step of draft.steps) {
    if (step.type === "gmail" && !step.configuration.to) {
      unset.push({ field: `step:${step.id}:to`, label: "メール宛先" });
    }
    if (step.type === "dropbox" && !step.configuration.folderPath) {
      unset.push({ field: `step:${step.id}:folder`, label: "保存先フォルダ" });
    }
  }
  return unset;
}
