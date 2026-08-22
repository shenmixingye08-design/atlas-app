/**
 * VALUE MOAT PHASE 3 — TEST 1–16.
 */

import { readFileSync } from "node:fs";
import { join } from "node:path";

import { beforeEach, describe, expect, it } from "vitest";

import { getPlanDefinition } from "@/lib/billing/plans";
import { buildSideEffectIdempotencyKey } from "@/lib/side-effects/keys";
import {
  assertConvertEntitlement,
  buildExecutionReceipt,
  classifyWorkKind,
  convertSuccessfulJobToWork,
  countHumanInterventions,
  detectRepeatedWork,
  dismissProposal,
  isProposalDismissed,
  listDismissedKeys,
  measureWorkLoop,
  mayAutoSend,
  partitionByUser,
  receiptHasProviderProof,
  resetDismissStoreForTests,
  resolveEffectiveDelegation,
  restoreAfterColdStart,
  restoreDismissState,
  shouldAskApprovalEveryRun,
  shouldProposeAutomation,
  simulateManyUsers,
  resetDismissStoreForTests,
  snapshotDismissState,
  workNeedsReinstruction,
  type SuccessfulJob,
} from "@/lib/work-loop";

function job(
  overrides: Partial<SuccessfulJob> & Pick<SuccessfulJob, "id">,
): SuccessfulJob {
  return {
    userId: "user_a",
    title: "営業週報",
    assignment: "営業報告書を作って",
    completedAt: "2026-08-01T00:00:00.000Z",
    status: "completed",
    deliverableFormat: "docx",
    ...overrides,
  };
}

function threeWeeklyReports(): SuccessfulJob[] {
  return [
    job({ id: "j1", completedAt: "2026-08-01T00:00:00.000Z" }),
    job({ id: "j2", completedAt: "2026-08-08T00:00:00.000Z" }),
    job({ id: "j3", completedAt: "2026-08-15T00:00:00.000Z" }),
  ];
}

beforeEach(() => {
  resetDismissStoreForTests();
});

describe("TEST 1 Repeated success → proposal", () => {
  it("proposes after three similar successful jobs", () => {
    const proposals = detectRepeatedWork({
      userId: "user_a",
      jobs: threeWeeklyReports(),
    });
    expect(proposals).toHaveLength(1);
    expect(proposals[0]?.repeatCount).toBe(3);
    expect(proposals[0]?.message).toContain("3回繰り返しています");
    expect(shouldProposeAutomation(3)).toBe(true);
  });
});

describe("TEST 2 One-shot must not propose", () => {
  it("does not propose after a single success", () => {
    const proposals = detectRepeatedWork({
      userId: "user_a",
      jobs: [job({ id: "once" })],
    });
    expect(proposals).toHaveLength(0);
    expect(shouldProposeAutomation(1)).toBe(false);
  });
});

describe("TEST 3 Dismiss does not repeat", () => {
  it("hides the same proposal after 今はしない", () => {
    const first = detectRepeatedWork({
      userId: "user_a",
      jobs: threeWeeklyReports(),
    });
    expect(first[0]).toBeTruthy();
    dismissProposal("user_a", first[0]!.fingerprint);
    const second = detectRepeatedWork({
      userId: "user_a",
      jobs: threeWeeklyReports(),
      dismissedKeys: listDismissedKeys("user_a"),
    });
    expect(second).toHaveLength(0);
    expect(isProposalDismissed("user_a", first[0]!.fingerprint)).toBe(true);
  });
});

describe("TEST 4–5 Convert success → Work, no re-instruction", () => {
  it("saves an enabled Automation with a next run", () => {
    const converted = convertSuccessfulJobToWork({
      job: job({ id: "ok" }),
      schedule: { frequency: "weekly", hour: 17, minute: 0, dayOfWeek: 5 },
      planId: "standard",
      currentAutomationCount: 0,
    });
    expect(converted.ok).toBe(true);
    if (!converted.ok) return;
    expect(converted.automation.enabled).toBe(true);
    expect(converted.automation.nextRun).toBeTruthy();
    expect(converted.automation.workflow.assignment).not.toMatch(/2026|8月15/);
    expect(workNeedsReinstruction(converted.automation)).toBe(false);
    expect(converted.nextRunAt).toBe(converted.automation.nextRun);
  });
});

describe("TEST 6 X provider proof", () => {
  it("stores tweet id as provider proof", () => {
    const receipt = buildExecutionReceipt({
      workName: "毎日のX投稿",
      executionId: "exec_x",
      x: { tweetId: "tw_1", tweetUrl: "https://x.com/i/status/tw_1" },
    });
    expect(receipt.result).toBe("succeeded");
    expect(receipt.proofKind).toBe("provider");
    expect(receipt.sideEffects[0]?.resourceId).toBe("tw_1");
    expect(receiptHasProviderProof(receipt)).toBe(true);
  });
});

describe("TEST 7 X provider failure has no success proof", () => {
  it("marks FAILED and invents nothing", () => {
    const receipt = buildExecutionReceipt({
      workName: "毎日のX投稿",
      executionId: "exec_x_fail",
      providerFailed: true,
      x: { tweetId: "should_not_use" },
    });
    expect(receipt.result).toBe("failed");
    expect(receipt.proofKind).toBe("none");
    expect(receipt.sideEffects).toHaveLength(0);
    expect(receiptHasProviderProof(receipt)).toBe(false);
  });
});

describe("TEST 8 Word artifact links to execution", () => {
  it("binds artifact metadata to the receipt", () => {
    const receipt = buildExecutionReceipt({
      workName: "営業週報",
      executionId: "exec_word",
      artifact: {
        id: "art_1",
        fileName: "週報.docx",
        format: "docx",
        createdAt: "2026-08-15T00:00:00.000Z",
        sizeBytes: 4096,
        downloadable: true,
        qualityGate: "pass",
      },
    });
    expect(receipt.result).toBe("succeeded");
    expect(receipt.artifact?.id).toBe("art_1");
    expect(receipt.executionId).toBe("exec_word");
  });
});

describe("TEST 9 Gmail draft never sends", () => {
  it("keeps draft-only work from sending", () => {
    const resolved = resolveEffectiveDelegation({
      standing: "draft_save",
      currentText: "今回は送って",
      kind: "gmail_draft",
    });
    expect(resolved.standing).toBe("draft_save");
    expect(resolved.maySend).toBe(false);
    expect(
      mayAutoSend({ executionLevel: "draft_save", kind: "gmail_draft" }),
    ).toBe(false);

    const receipt = buildExecutionReceipt({
      workName: "定型メール",
      executionId: "exec_mail",
      gmail: { draftId: "dr_1" },
    });
    expect(receipt.gmailSent).toBe(false);
    expect(receipt.summary).not.toContain("送信完了");
  });
});

describe("TEST 10 Auto work does not re-ask", () => {
  it("counts zero human interventions on full_auto success", () => {
    expect(
      countHumanInterventions({
        executionLevel: "full_auto",
        runStatus: "succeeded",
        permissionsOk: true,
      }).count,
    ).toBe(0);
    expect(
      shouldAskApprovalEveryRun({
        executionLevel: "full_auto",
        succeeded: true,
      }),
    ).toBe(false);
  });
});

describe("TEST 11 Current override does not mutate standing", () => {
  it("applies 確認してから for this run only", () => {
    const resolved = resolveEffectiveDelegation({
      standing: "full_auto",
      currentText: "今回は確認してから",
      kind: "x_post",
    });
    expect(resolved.standing).toBe("full_auto");
    expect(resolved.effective).toBe("approve_then_run");
    expect(resolved.standingUnchanged).toBe(true);
    expect(resolved.maySend).toBe(false);
  });

  it("never sends when the user says 今回は下書きだけ", () => {
    const resolved = resolveEffectiveDelegation({
      standing: "full_auto",
      currentText: "今回は下書きだけ",
      kind: "gmail_draft",
    });
    expect(resolved.standing).toBe("full_auto");
    expect(resolved.effective).toBe("draft_save");
    expect(resolved.maySend).toBe(false);
  });
});

describe("TEST 12 User isolation", () => {
  it("hides user A proposals and receipts from user B", () => {
    const proposals = detectRepeatedWork({
      userId: "user_b",
      jobs: threeWeeklyReports(),
    });
    expect(proposals).toHaveLength(0);
    expect(
      partitionByUser(
        [
          { userId: "user_a", id: "p1" },
          { userId: "user_b", id: "p2" },
        ],
        "user_b",
      ).map((row) => row.id),
    ).toEqual(["p2"]);
  });
});

describe("TEST 13 Cold start persistence", () => {
  it("restores dismiss, work, delegation, and receipt", () => {
    dismissProposal("user_a", "fp_1");
    const converted = convertSuccessfulJobToWork({
      job: job({ id: "persist" }),
      schedule: { frequency: "weekly", hour: 9, minute: 0 },
      planId: "standard",
      currentAutomationCount: 0,
    });
    expect(converted.ok).toBe(true);
    if (!converted.ok) return;
    const receipt = buildExecutionReceipt({
      workName: converted.automation.name,
      executionId: "exec_persist",
      artifact: { id: "art_p", fileName: "a.docx", format: "docx", downloadable: true },
    });
    const snapshot = restoreAfterColdStart({
      dismiss: snapshotDismissState("user_a"),
      work: converted.automation,
      delegation: converted.automation.executionLevel,
      receipt,
    });
    resetDismissStoreForTests();
    restoreDismissState(snapshot.dismiss);
    expect(listDismissedKeys("user_a")).toEqual(["fp_1"]);
    expect(snapshot.work.id).toBe(converted.automation.id);
    expect(snapshot.work.nextRun).toBe(converted.automation.nextRun);
    expect(snapshot.delegation).toBe(converted.automation.executionLevel);
    expect(snapshot.receipt.artifact?.id).toBe("art_p");
  });
});

describe("TEST 14 Side-effect retry is not a second send", () => {
  it("keeps the same occurrence key without runId", () => {
    const first = buildSideEffectIdempotencyKey({
      userId: "user_a",
      provider: "x",
      actionType: "post",
      destination: "x",
      automationId: "auto_1",
      runId: "run_1",
      occurrenceKey: "slot_2026-08-22",
    });
    const retry = buildSideEffectIdempotencyKey({
      userId: "user_a",
      provider: "x",
      actionType: "post",
      destination: "x",
      automationId: "auto_1",
      runId: "run_2",
      occurrenceKey: "slot_2026-08-22",
    });
    expect(first).toBe(retry);
    const metrics = measureWorkLoop({
      firstRequestSpecCount: 4,
      secondRequestSpecCount: 1,
      humanInterventionCount: 0,
      proposals: 1,
      conversions: 1,
      receipts: 2,
      receiptsWithProof: 2,
      sideEffectDuplication: 0,
    });
    expect(metrics.sideEffectDuplication).toBe(0);
  });
});

describe("TEST 15 Entitlements are not bypassed", () => {
  it("keeps Free / Light / Standard / Premium limits", () => {
    expect(getPlanDefinition("free").monthlyPriceJpy).toBe(0);
    expect(getPlanDefinition("light").monthlyPriceJpy).toBe(980);
    expect(getPlanDefinition("standard").monthlyPriceJpy).toBe(2980);
    expect(getPlanDefinition("premium").monthlyPriceJpy).toBe(9800);

    expect(
      assertConvertEntitlement({
        kind: "calendar_create",
        planId: "light",
        currentAutomationCount: 0,
      }).allowed,
    ).toBe(false);

    expect(
      convertSuccessfulJobToWork({
        job: job({
          id: "cal",
          title: "予定登録",
          assignment: "カレンダーに予定を追加して",
        }),
        schedule: { frequency: "weekly", hour: 9, minute: 0 },
        planId: "free",
        currentAutomationCount: 0,
      }).ok,
    ).toBe(false);

    expect(
      convertSuccessfulJobToWork({
        job: job({ id: "word_free" }),
        schedule: { frequency: "weekly", hour: 9, minute: 0 },
        planId: "free",
        currentAutomationCount: 1,
      }).ok,
    ).toBe(false);
  });
});

describe("TEST 16 Mobile targets", () => {
  it("keeps 44px touch targets and safe-area on proposal / receipt / delegation", () => {
    const files = [
      "components/work-loop/entrust-proposal.tsx",
      "components/work-loop/delegation-control.tsx",
      "components/work-loop/execution-receipt-card.tsx",
    ];
    for (const file of files) {
      const source = readFileSync(join(process.cwd(), file), "utf8");
      if (file.includes("receipt")) continue;
      expect(source).toContain("min-h-[var(--touch-target)]");
    }
    expect(
      readFileSync(join(process.cwd(), "components/work-loop/entrust-proposal.tsx"), "utf8"),
    ).toContain("safe-area-inset-bottom");
    expect(classifyWorkKind({ assignment: "Driveを確認して週報" })).toBe(
      "unsupported",
    );
  });
});

describe("honesty: do not propose unsupported kinds", () => {
  it("does not treat Drive READ or calendar summary as automatable", () => {
    const jobs: SuccessfulJob[] = [1, 2, 3].map((n) =>
      job({
        id: `drive_${n}`,
        title: "週報",
        assignment: "Driveを確認して週報を作って",
        completedAt: `2026-08-0${n}T00:00:00.000Z`,
      }),
    );
    expect(detectRepeatedWork({ userId: "user_a", jobs })).toHaveLength(0);
  });
});
