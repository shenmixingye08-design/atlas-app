/**
 * One user-facing Work. Internal steps stay hidden.
 * Drive/Calendar READ paths are fixture-only and never claimed as live automation.
 */

export type WorkStepKind =
  | "input"
  | "generate"
  | "artifact"
  | "external_action"
  | "persist"
  | "notify";

export type WorkStepResult = {
  kind: WorkStepKind;
  name: string;
  status: "succeeded" | "failed" | "skipped";
  sideEffect?: {
    provider: string;
    action: string;
    resourceId: string | null;
    executed: boolean;
  };
  reason?: string;
};

export type CrossServiceWorkRun = {
  workId: string;
  workName: string;
  userId: string;
  executionId: string;
  status: "succeeded" | "failed";
  steps: WorkStepResult[];
  userVisibleSteps: string[];
  notified: boolean;
  historyRecorded: boolean;
};

export type SideEffectLedger = Map<
  string,
  { resourceId: string; executedAt: string }
>;

export function mintExecutionId(nowMs = Date.now()): string {
  const rand =
    typeof crypto !== "undefined" && "randomUUID" in crypto
      ? crypto.randomUUID()
      : `${nowMs.toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
  return `exec_${rand}`;
}

export function sideEffectKey(input: {
  userId: string;
  provider: string;
  action: string;
  occurrenceKey: string;
}): string {
  return [input.userId, input.provider, input.action, input.occurrenceKey].join(
    ":",
  );
}

export function runSideEffectOnce(input: {
  ledger: SideEffectLedger;
  key: string;
  resourceId: string;
  now?: string;
}): { executed: boolean; reused: boolean; resourceId: string } {
  const existing = input.ledger.get(input.key);
  if (existing) {
    return { executed: false, reused: true, resourceId: existing.resourceId };
  }
  input.ledger.set(input.key, {
    resourceId: input.resourceId,
    executedAt: input.now ?? new Date().toISOString(),
  });
  return { executed: true, reused: false, resourceId: input.resourceId };
}

/**
 * CASE 1 — fixture Drive content → Word artifact → history → notify.
 * Production Drive automation READ is still unsupported.
 */
export function runWeeklyReportFromDriveFixture(input: {
  userId: string;
  workId: string;
  fixtureText: string;
  persistNotify?: boolean;
}): CrossServiceWorkRun {
  const executionId = mintExecutionId();
  const steps: WorkStepResult[] = [];
  const text = input.fixtureText.trim();
  steps.push({
    kind: "input",
    name: "drive_fixture",
    status: text ? "succeeded" : "failed",
    reason: text ? undefined : "fixture empty",
  });
  if (!text) {
    return {
      workId: input.workId,
      workName: "週報作成",
      userId: input.userId,
      executionId,
      status: "failed",
      steps,
      userVisibleSteps: ["週報作成"],
      notified: false,
      historyRecorded: false,
    };
  }
  const artifactOk = text.length > 8 && !/\bTODO\b|\bundefined\b/.test(text);
  steps.push({
    kind: "generate",
    name: "word_generate",
    status: artifactOk ? "succeeded" : "failed",
  });
  steps.push({
    kind: "artifact",
    name: "docx_persist",
    status: artifactOk && input.persistNotify !== false ? "succeeded" : "failed",
  });
  const succeeded = steps.every((step) => step.status === "succeeded");
  if (succeeded) {
    steps.push({ kind: "persist", name: "history", status: "succeeded" });
    steps.push({ kind: "notify", name: "notify", status: "succeeded" });
  }
  return {
    workId: input.workId,
    workName: "週報作成",
    userId: input.userId,
    executionId,
    status: succeeded ? "succeeded" : "failed",
    steps,
    userVisibleSteps: ["週報作成"],
    notified: succeeded,
    historyRecorded: succeeded,
  };
}

/**
 * CASE 2 — fixture calendar events → weekly summary → Gmail draft (never send).
 */
export function runCalendarWeeklyDraftFromFixture(input: {
  userId: string;
  workId: string;
  events: readonly { title: string; start: string }[];
  sendEmail?: boolean;
  approvalRequired: boolean;
}): CrossServiceWorkRun {
  const executionId = mintExecutionId();
  const steps: WorkStepResult[] = [
    {
      kind: "input",
      name: "calendar_fixture",
      status: input.events.length > 0 ? "succeeded" : "failed",
    },
  ];
  if (input.events.length === 0) {
    return {
      workId: input.workId,
      workName: "週次予定まとめ",
      userId: input.userId,
      executionId,
      status: "failed",
      steps,
      userVisibleSteps: ["週次予定まとめ"],
      notified: false,
      historyRecorded: false,
    };
  }
  const body = input.events.map((event) => `- ${event.start} ${event.title}`).join("\n");
  steps.push({
    kind: "generate",
    name: "weekly_summary",
    status: body.length > 0 ? "succeeded" : "failed",
  });
  const shouldSend = input.sendEmail === true && !input.approvalRequired;
  steps.push({
    kind: "external_action",
    name: shouldSend ? "gmail_send" : "gmail_draft",
    status: "succeeded",
    sideEffect: {
      provider: "gmail",
      action: shouldSend ? "send" : "draft",
      resourceId: shouldSend ? "msg_forbidden" : "draft_ok",
      executed: true,
    },
  });
  steps.push({ kind: "persist", name: "history", status: "succeeded" });
  steps.push({ kind: "notify", name: "notify", status: "succeeded" });
  return {
    workId: input.workId,
    workName: "週次予定まとめ",
    userId: input.userId,
    executionId,
    status: "succeeded",
    steps,
    userVisibleSteps: ["週次予定まとめ"],
    notified: true,
    historyRecorded: true,
  };
}

export function appsUserAvoided(run: CrossServiceWorkRun): readonly string[] {
  if (run.status !== "succeeded") return [];
  return ["ChatGPT", "Word", "保存ダイアログ"];
}
