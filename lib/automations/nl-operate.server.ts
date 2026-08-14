/**
 * Apply NL operate against existing Automation SoT.
 * Pause/resume uses setEnabled (no missed-run catch-up).
 */

import "server-only";

import { automationService } from "@/lib/automations/automation-service";
import {
  formatAutomationChoicePrompt,
  matchAutomationsForOperate,
  parseAutomationNlOperate,
  type AutomationNlOperateParse,
} from "@/lib/automations/nl-operate";
import { patchAutomationSchedule } from "@/lib/automations/schedule";
import {
  buildAutomationPreview,
  formatRegistrationSuccess,
  formatUserNextRun,
  resolveAutomationUserStatus,
} from "@/lib/automations/ux";
import { describeXSocialPreference } from "@/lib/memory-apply/x-social-preference";
import type { Automation } from "@/lib/automations/types";

export type AutomationNlOperateResult =
  | {
      ok: true;
      code: "updated" | "paused" | "resumed" | "deleted" | "asked" | "need_choice" | "need_confirm";
      message: string;
      automation: Automation | null;
      choices?: Automation[];
    }
  | { ok: false; code: string; message: string; httpStatus: number };

function resolveTarget(
  rows: Automation[],
  parsed: AutomationNlOperateParse,
): { target?: Automation; choices?: Automation[]; empty?: true } {
  const matched = matchAutomationsForOperate(rows, parsed);
  if (matched.length === 0) return { empty: true };
  if (matched.length > 1) return { choices: matched };
  return { target: matched[0] };
}

export async function operateAutomationFromNaturalLanguage(input: {
  userId: string;
  text: string;
  parsed?: AutomationNlOperateParse;
}): Promise<AutomationNlOperateResult> {
  const parsed = input.parsed ?? parseAutomationNlOperate(input.text);
  if (parsed.kind === "none") {
    return {
      ok: false,
      code: "not_operate",
      message: "操作として認識できませんでした。",
      httpStatus: 400,
    };
  }

  const rows = await automationService.listForUser(input.userId);
  const resolved = resolveTarget(rows, parsed);
  if (resolved.empty) {
    return {
      ok: false,
      code: "not_found",
      message: "対象の自動化が見つかりませんでした。",
      httpStatus: 404,
    };
  }
  if (resolved.choices) {
    return {
      ok: true,
      code: "need_choice",
      message: formatAutomationChoicePrompt(resolved.choices),
      automation: null,
      choices: resolved.choices,
    };
  }

  const target = resolved.target!;

  if (parsed.kind === "delete") {
    const preview = buildAutomationPreview(target);
    return {
      ok: true,
      code: "need_confirm",
      message: `「${preview.name}」（${preview.frequency}）を削除しますか？ 削除すると元に戻せません。止めるだけなら「一旦止めて」と言ってください。削除する場合は「消していい」と返信してください。`,
      automation: target,
    };
  }

  if (parsed.kind === "confirm_delete") {
    const removed = await automationService.deleteForUser(target.id, input.userId);
    if (!removed) {
      return {
        ok: false,
        code: "delete_failed",
        message: "削除できませんでした。",
        httpStatus: 500,
      };
    }
    return {
      ok: true,
      code: "deleted",
      message: `「${target.name}」を削除しました。`,
      automation: null,
    };
  }

  if (parsed.kind === "pause") {
    const updated = await automationService.setEnabledForUser(
      target.id,
      input.userId,
      false,
    );
    if (!updated) {
      return {
        ok: false,
        code: "pause_failed",
        message: "一時停止できませんでした。",
        httpStatus: 500,
      };
    }
    return {
      ok: true,
      code: "paused",
      message: `「${updated.name}」を一時停止しました。次回実行はありません。`,
      automation: updated,
    };
  }

  if (parsed.kind === "resume") {
    const updated = await automationService.setEnabledForUser(
      target.id,
      input.userId,
      true,
    );
    if (!updated) {
      return {
        ok: false,
        code: "resume_failed",
        message: "再開できませんでした。",
        httpStatus: 500,
      };
    }
    const next = formatUserNextRun({
      nextRun: updated.nextRun,
      enabled: updated.enabled,
      status: resolveAutomationUserStatus(updated),
    });
    return {
      ok: true,
      code: "resumed",
      message: `「${updated.name}」を再開しました。次回：${next}`,
      automation: updated,
    };
  }

  if (parsed.kind === "ask_next") {
    const next = formatUserNextRun({
      nextRun: target.nextRun,
      enabled: target.enabled,
      status: resolveAutomationUserStatus(target),
    });
    return {
      ok: true,
      code: "asked",
      message: `「${target.name}」の次回は${next}です。`,
      automation: target,
    };
  }

  if (parsed.kind === "update_time" || parsed.kind === "update_weekdays") {
    const schedule = patchAutomationSchedule(target.schedule, {
      hour: parsed.hour,
      minute: parsed.minute,
      weekdays: parsed.weekdays,
      dayOfWeek: parsed.dayOfWeek,
      frequency: parsed.frequency,
    });
    const updated = await automationService.updateForUser(target.id, input.userId, {
      schedule,
    });
    if (!updated) {
      return {
        ok: false,
        code: "update_failed",
        message: "変更できませんでした。",
        httpStatus: 500,
      };
    }
    return {
      ok: true,
      code: "updated",
      message: formatRegistrationSuccess(updated).replace("自動化しました", "自動化を更新しました"),
      automation: updated,
    };
  }

  if (parsed.kind === "update_approval" && parsed.approval) {
    const updated = await automationService.updateForUser(target.id, input.userId, {
      executionLevel: parsed.approval,
    });
    if (!updated) {
      return {
        ok: false,
        code: "update_failed",
        message: "確認方法を変更できませんでした。",
        httpStatus: 500,
      };
    }
    return {
      ok: true,
      code: "updated",
      message: formatRegistrationSuccess(updated).replace("自動化しました", "自動化を更新しました"),
      automation: updated,
    };
  }

  if (parsed.kind === "update_content") {
    const override = parsed.contentOverride ?? {};
    const labels = describeXSocialPreference({
      tone: null,
      length: override.length ?? null,
      emoji: override.emoji ?? null,
      hashtags: override.hashtags ?? null,
      hashtagsMax: override.hashtags === "none" ? 0 : null,
      lineBreaks: null,
      promotional: null,
      cta: null,
      theme: null,
      postingHour: null,
      approval: null,
    }).map((label) => `この自動化では${label}`);
    const previousSnapshot =
      target.workflow.metadata?.memorySnapshot &&
      typeof target.workflow.metadata.memorySnapshot === "object"
        ? (target.workflow.metadata.memorySnapshot as Record<string, unknown>)
        : {};
    const updated = await automationService.updateForUser(target.id, input.userId, {
      workflow: {
        ...target.workflow,
        metadata: {
          ...(target.workflow.metadata ?? {}),
          memoryOverrides: {
            ...((target.workflow.metadata?.memoryOverrides as Record<string, unknown>) ??
              {}),
            ...override,
          },
          memorySnapshot: {
            ...previousSnapshot,
            overriddenPreferences: override,
            source: "automation_override",
          },
          appliedPreferenceLabels: labels,
        },
      },
    });
    if (!updated) {
      return {
        ok: false,
        code: "update_failed",
        message: "内容を変更できませんでした。",
        httpStatus: 500,
      };
    }
    return {
      ok: true,
      code: "updated",
      message: `この自動化だけ反映しました。${labels.join("、") || "内容を更新しました。"}`,
      automation: updated,
    };
  }

  return {
    ok: false,
    code: "not_operate",
    message: "操作として認識できませんでした。",
    httpStatus: 400,
  };
}
