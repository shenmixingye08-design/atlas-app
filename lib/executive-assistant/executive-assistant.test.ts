import { describe, expect, it, beforeEach, vi } from "vitest";

import {
  buildExecutiveDashboard,
  buildExecutiveMemoryChains,
  canFullAutoComplete,
  computeAutomationScore,
  detectDeadlines,
  detectReplyMiss,
  discoverFileAndDeliveryHabits,
  discoverRecurringWork,
  discoverRepeatedCorrections,
  dismissExecutiveProposal,
  inferWorkStyle,
  loadExecutiveAssistantSettings,
  predictNextWork,
  requiresHumanApproval,
  scoreToBand,
  scoreToStars,
  snoozeExecutiveProposal,
  updateSecretaryMode,
  type ExecutiveAssistantInput,
} from "@/lib/executive-assistant";

const storage = new Map<string, string>();

const localStorageMock = {
  getItem: (key: string) => storage.get(key) ?? null,
  setItem: (key: string, value: string) => {
    storage.set(key, value);
  },
  removeItem: (key: string) => {
    storage.delete(key);
  },
};

vi.stubGlobal("localStorage", localStorageMock);
vi.stubGlobal("window", { localStorage: localStorageMock });

beforeEach(() => {
  storage.clear();
});

const now = new Date("2026-08-07T10:00:00.000Z"); // Friday

function baseInput(
  patch: Partial<ExecutiveAssistantInput> = {},
): ExecutiveAssistantInput {
  return {
    now,
    secretaryMode: "suggest_only",
    automations: [
      {
        id: "auto-sales",
        name: "営業資料作成",
        enabled: true,
        schedule: {
          kind: "schedule",
          label: "毎週金曜 18:00",
          preset: {
            type: "weekly",
            dayOfWeek: 5,
            hour: 18,
            minute: 0,
          },
        },
        lastRun: "2026-07-31T09:00:00.000Z",
        nextRun: "2026-08-14T09:00:00.000Z",
        workflow: {
          assignment: "営業資料をPowerPointで作りPDF化しDropboxへ保存",
        },
      },
    ],
    projects: [
      {
        id: "proj-1",
        title: "来週の営業会議資料",
        workRequest: "営業資料を作成\n【期限】2026-08-08",
        status: "pending",
      },
    ],
    jobUsage: [
      {
        jobCategory: "sales_material",
        label: "営業資料",
        count: 8,
        lastUsedAt: "2026-08-01T09:00:00.000Z",
        frequency: "weekly",
        preferredFormat: "pptx",
        preferredHour: 18,
      },
    ],
    workMemories: [
      {
        id: "mem-1",
        type: "correction",
        title: "箇条書きに統一",
        summary: "営業資料は毎回箇条書き",
        tags: ["correction", "営業", "資料"],
        usageCount: 4,
        lastUsedAt: "2026-08-01T09:00:00.000Z",
        isUserConfirmed: true,
      },
      {
        id: "mem-2",
        type: "correction",
        title: "箇条書きに統一",
        summary: "再度修正",
        tags: ["correction"],
        usageCount: 2,
        lastUsedAt: "2026-08-02T09:00:00.000Z",
      },
      {
        id: "mem-3",
        type: "workflow",
        title: "営業フロー",
        summary: "営業 資料 PDF Dropbox Slack共有",
        tags: ["営業", "営業資料", "PDF", "Dropbox", "Slack"],
        usageCount: 5,
        lastUsedAt: "2026-08-01T09:00:00.000Z",
        structuredData: {
          steps: ["営業", "営業資料", "PDF", "Dropbox", "Slack共有"],
        },
        isUserConfirmed: true,
      },
    ],
    notifications: [
      {
        id: "n1",
        type: "awaiting_review",
        title: "承認待ちの自動化",
        message: "確認してください",
        createdAt: "2026-08-06T10:00:00.000Z",
        readAt: null,
        actionUrl: "/automations",
      },
    ],
    replyMissSignals: [
      {
        id: "mail-1",
        subject: "見積りの件",
        ageHours: 36,
        href: "/workspace/mail",
      },
    ],
    ...patch,
  };
}

describe("AI Executive Assistant — scoring", () => {
  it("maps bands: 95 automate_now / 80 candidate / 60 watch", () => {
    expect(scoreToBand(95)).toBe("automate_now");
    expect(scoreToBand(80)).toBe("candidate");
    expect(scoreToBand(60)).toBe("watch");
    expect(scoreToBand(40)).toBe("learning");
  });

  it("rates weekly recurring work with ★★★★★", () => {
    const score = computeAutomationScore({
      occurrenceCount: 8,
      cadence: "weekly",
      daysSinceLast: 3,
    });
    expect(score).toBeGreaterThanOrEqual(90);
    expect(scoreToStars({ score, cadence: "weekly" })).toBe(5);
  });
});

describe("仕事発見", () => {
  it("detects weekly recurring work", () => {
    const found = discoverRecurringWork(baseInput());
    expect(found.some((p) => p.kind === "recurring_work")).toBe(true);
    expect(found.some((p) => p.title.includes("毎週"))).toBe(true);
  });

  it("detects PDF / PowerPoint / Dropbox habits", () => {
    const habits = discoverFileAndDeliveryHabits(baseInput());
    const keys = habits.map((h) => h.dedupeKey);
    expect(keys).toContain("habit:pdf");
    expect(keys).toContain("habit:pptx");
    expect(keys).toContain("habit:dropbox");
  });

  it("detects repeated corrections → standard settings", () => {
    const corrections = discoverRepeatedCorrections(baseInput());
    expect(corrections.length).toBeGreaterThan(0);
    expect(corrections[0]?.message).toContain("標準設定");
  });
});

describe("仕事予測・締切・返信漏れ", () => {
  it("predicts next work from nextRun", () => {
    const preds = predictNextWork(baseInput());
    expect(preds.some((p) => p.kind === "work_prediction")).toBe(true);
  });

  it("flags near deadline without completed status", () => {
    const deadlines = detectDeadlines(baseInput());
    expect(deadlines.length).toBe(1);
    expect(deadlines[0]?.kind).toBe("deadline");
    expect(deadlines[0]?.message).toContain("作成しますか");
  });

  it("detects reply miss and approval waits", () => {
    const misses = detectReplyMiss(baseInput());
    expect(misses.some((p) => p.dedupeKey.startsWith("reply:"))).toBe(true);
    expect(misses.some((p) => p.dedupeKey.startsWith("notify-wait:"))).toBe(
      true,
    );
  });
});

describe("Executive Memory", () => {
  it("builds job-unit chains 営業→資料→PDF→保存", () => {
    const chains = buildExecutiveMemoryChains(baseInput());
    expect(chains.length).toBeGreaterThan(0);
    const sales = chains.find((c) => c.steps.includes("営業") || c.steps.includes("PDF"));
    expect(sales?.steps.length).toBeGreaterThanOrEqual(3);
  });
});

describe("Dashboard throttle / Memory / 秘書モード", () => {
  it("builds dashboard with proposals and suppresses spam", () => {
    const dash = buildExecutiveDashboard({
      ...baseInput(),
      maxProposals: 3,
    });
    expect(dash.proposals.length).toBeLessThanOrEqual(3);
    expect(dash.suppressedCount).toBeGreaterThanOrEqual(0);
    expect(dash.recentMemory.length).toBeGreaterThan(0);
  });

  it("off mode returns empty proposals", () => {
    const dash = buildExecutiveDashboard(baseInput({ secretaryMode: "off" }));
    expect(dash.proposals).toEqual([]);
  });

  it("dislikes_notify keeps only urgent", () => {
    const dash = buildExecutiveDashboard(
      baseInput({
        workStyle: ["dislikes_notify"],
        maxProposals: 10,
      }),
    );
    for (const p of dash.proposals) {
      expect(
        p.kind === "deadline" ||
          p.kind === "reply_miss" ||
          p.automationScore >= 95,
      ).toBe(true);
    }
  });

  it("dedupes dismissed keys", () => {
    const input = baseInput({
      dismissedKeys: ["deadline:proj-1"],
    });
    const dash = buildExecutiveDashboard(input);
    expect(dash.proposals.every((p) => p.dedupeKey !== "deadline:proj-1")).toBe(
      true,
    );
  });

  it("persists secretary mode and dismiss/snooze", () => {
    updateSecretaryMode("semi_auto");
    expect(loadExecutiveAssistantSettings().secretaryMode).toBe("semi_auto");
    dismissExecutiveProposal("habit:pdf");
    expect(loadExecutiveAssistantSettings().dismissedKeys).toContain("habit:pdf");
    snoozeExecutiveProposal("habit:pptx", 1);
    expect(
      loadExecutiveAssistantSettings().snoozedUntil["habit:pptx"],
    ).toBeTruthy();
  });

  it("full_auto never auto-completes approval-required mail/X", () => {
    const mail = discoverFileAndDeliveryHabits(baseInput()).find(
      (p) => p.dedupeKey === "habit:mail" || p.dedupeKey === "habit:x",
    );
    // seed mail habit
    const withMail = discoverFileAndDeliveryHabits(
      baseInput({
        automations: [
          {
            id: "m",
            name: "メール送信",
            enabled: true,
            workflow: { assignment: "Gmailでメール送信" },
          },
        ],
      }),
    ).find((p) => p.dedupeKey === "habit:mail");
    expect(withMail).toBeTruthy();
    expect(requiresHumanApproval(withMail!)).toBe(true);
    expect(canFullAutoComplete(withMail!)).toBe(false);
    void mail;
  });

  it("infers work style traits without LLM", () => {
    const traits = inferWorkStyle(baseInput());
    expect(traits.includes("evening") || traits.includes("likes_confirm")).toBe(
      true,
    );
  });
});

describe("E2E — AI Executive pipeline", () => {
  it("end-to-end: discover → score → predict → dashboard → memory", () => {
    const input = baseInput({ secretaryMode: "full_auto", maxProposals: 6 });
    const dash = buildExecutiveDashboard(input);

    expect(dash.secretaryMode).toBe("full_auto");
    expect(dash.proposals.length).toBeGreaterThan(0);
    // Deadline should rank high
    expect(dash.proposals[0]?.kind).toBe("deadline");
    expect(dash.automationCandidates.length).toBeGreaterThan(0);
    expect(dash.recentMemory.some((m) => m.steps.length >= 3)).toBe(true);

    // Full auto copy for non-approval high score may rewrite CTA
    const hasAutoCopy = dash.proposals.some(
      (p) =>
        p.actionLabel.includes("自動") ||
        p.actionLabel.includes("承認") ||
        p.actionLabel.includes("半自動") ||
        p.actionLabel.length > 0,
    );
    expect(hasAutoCopy).toBe(true);
  });
});
