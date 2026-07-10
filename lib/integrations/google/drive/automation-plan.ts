import type { DeliverableFormat } from "@/lib/deliverables/types";

import type { DriveAutomationSaveTrigger, DriveCategoryId } from "./types";

/**
 * Automation hook design — after deliverable completion, save to Drive and notify user.
 */
export function buildDriveAutomationSaveTrigger(input: {
  category: DriveCategoryId;
  format: DeliverableFormat;
}): DriveAutomationSaveTrigger {
  return {
    category: input.category,
    kind: "post_deliverable_save",
    deliverableFormat: input.format,
    notifyWithDriveUrl: true,
  };
}

export function describeDriveAutomationFlow(category: DriveCategoryId): string {
  return `営業資料完成 → Google Drive（${category}）へ保存 → 保存URL取得 → ユーザーへ通知`;
}
