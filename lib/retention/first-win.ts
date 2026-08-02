import { isActivationCompleted } from "@/lib/activation/store";
import {
  completeOnboarding,
  seedProfileFromOnboarding,
} from "@/lib/onboarding";
import type { OnboardingEntryMode, OnboardingTaskId } from "@/lib/user-profile/types";

import { trackRetentionEvent } from "./analytics";
import { markRetentionDayComplete, markDailySuccess, saveWizardProfile } from "./store";
import { recordRetentionActivity } from "./metrics";
import { notifyFirstDeliverableComplete } from "./notifications";
import { resolveQuickWin, roleDefaults } from "./quick-win";
import type { RetentionIntegrationId, RetentionRoleId } from "./types";

export type CompleteRetentionWizardInput = {
  workDescription: string;
  company: string;
  roleId: RetentionRoleId;
  preferredTasks: OnboardingTaskId[];
  integrations: RetentionIntegrationId[];
  entryMode: OnboardingEntryMode;
};

/**
 * Finish AI-secretary setup and force the Quick Win path.
 * Never ends at "settings only".
 */
export function completeRetentionWizard(input: CompleteRetentionWizardInput): {
  quickWinHref: string;
  preferredTasks: OnboardingTaskId[];
} {
  const preferredTasks =
    input.preferredTasks.length > 0
      ? input.preferredTasks.filter((id) => id !== "undecided")
      : roleDefaults(input.roleId);

  const tasks: OnboardingTaskId[] =
    preferredTasks.length > 0 ? preferredTasks : ["sales_material"];

  seedProfileFromOnboarding(tasks);
  completeOnboarding({ preferredTasks: tasks, entryMode: input.entryMode });

  saveWizardProfile({
    workDescription: input.workDescription.trim(),
    company: input.company.trim(),
    roleId: input.roleId,
    preferredTasks: tasks,
    integrations: input.integrations,
  });

  recordRetentionActivity();
  trackRetentionEvent("retention_wizard_completed", {
    roleId: input.roleId,
    tasks: tasks.length,
    integrations: input.integrations.length,
    entryMode: input.entryMode,
  });

  const quickWin = resolveQuickWin({
    roleId: input.roleId,
    preferredTasks: tasks,
  });
  trackRetentionEvent("retention_quick_win_started", {
    quickWinId: quickWin.id,
    href: quickWin.href,
  });

  return { quickWinHref: quickWin.href, preferredTasks: tasks };
}

/** Call after a real first artifact is verified. */
export function recordFirstWinDeliverable(artifactHref: string): void {
  markRetentionDayComplete(1);
  markDailySuccess();
  recordRetentionActivity();
  notifyFirstDeliverableComplete(artifactHref);
  trackRetentionEvent("retention_daily_success", { day: 1, source: "activation" });
  trackRetentionEvent("retention_day_completed", { day: 1 });
}

export function ensureQuickWinNotSkipped(): {
  mustStartQuickWin: boolean;
  href: string;
} {
  if (isActivationCompleted()) {
    return { mustStartQuickWin: false, href: "/projects" };
  }
  const quickWin = resolveQuickWin({
    roleId: undefined,
    preferredTasks: [],
  });
  return { mustStartQuickWin: true, href: quickWin.href };
}
