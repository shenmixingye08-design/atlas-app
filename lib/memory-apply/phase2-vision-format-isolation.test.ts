/**
 * Last-export Excel must not reclassify the next image as a table.
 * This request's 契約書 / グラフ / Word wins (A-05 + B-08).
 */

import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));
vi.mock("@/lib/persistence/durable-domain", () => ({
  persistDurableDomain: vi.fn(async () => "supabase"),
  loadDurableDomain: vi.fn(async () => null),
}));
vi.mock("@/lib/personal-memory/durable", () => ({
  ensurePersonalMemoryHydrated: vi.fn(async () => undefined),
  schedulePersistPersonalMemory: vi.fn(),
  persistPersonalMemoryNow: vi.fn(async () => "skipped"),
  wipePersonalMemoryDurable: vi.fn(),
}));

import { resolveMockLlmOutput } from "@/lib/ai/mock-responses";
import { rememberSuccessfulDeliverableFormat } from "@/lib/memory-apply/remembered-formats";
import {
  resolveVisionMemoryContext,
  visionAnalyzeSafeHints,
} from "@/lib/memory-apply/vision";
import {
  clearAllPersonalMemoryData,
  writePersonalMemorySettings,
} from "@/lib/personal-memory/store";
import { DEFAULT_PERSONAL_MEMORY_SETTINGS } from "@/lib/personal-memory/types";

const USER = "user_phase2_vision_iso";

function visionPrompt(assignment: string, extra = ""): string {
  return [
    "【ユーザー依頼】",
    assignment,
    extra,
    "",
    "【成果物・用途の指示】",
    "ユーザー依頼から必要な成果物形式（Excel/Word/PDF等）を読み取り",
    "",
    "【ヒント】",
    "想定用途: unknown",
  ].join("\n");
}

describe("Phase 2 vision format isolation", () => {
  beforeEach(() => {
    clearAllPersonalMemoryData(USER);
    writePersonalMemorySettings(USER, {
      ...DEFAULT_PERSONAL_MEMORY_SETTINGS,
      enabled: true,
    });
  });

  it("drops last-export Excel from vision analyze hints", () => {
    expect(
      visionAnalyzeSafeHints(["今後はExcel", "株式会社ミネルバ", "短め"]),
    ).toEqual(["株式会社ミネルバ", "短め"]);
  });

  it("mock keeps contract/chart when leftover Excel is in the same request", () => {
    const contract = JSON.parse(
      resolveMockLlmOutput(
        "vision_analyze",
        visionPrompt("この契約書を要約してWordにしてください", "今後はExcel"),
      ),
    ) as { detectedType: string };
    expect(contract.detectedType).toBe("contract");

    const chart = JSON.parse(
      resolveMockLlmOutput(
        "vision_analyze",
        visionPrompt(
          "このグラフを分析してレポートをWordで作成してください",
          "今後はExcel",
        ),
      ),
    ) as { detectedType: string };
    expect(chart.detectedType).toBe("chart");

    const table = JSON.parse(
      resolveMockLlmOutput(
        "vision_analyze",
        visionPrompt("この表画像をExcelにしてください"),
      ),
    ) as { detectedType: string };
    expect(table.detectedType).toBe("table");
  });

  it("remembered Excel is not injected into vision analyze context", async () => {
    await rememberSuccessfulDeliverableFormat({
      userId: USER,
      format: "xlsx",
      assignment: "このレシートを家計簿Excelにしてください",
    });
    const ctx = await resolveVisionMemoryContext({ userId: USER });
    expect(ctx.injectionText).toBe("");
    expect(ctx.hints.join(" ")).not.toMatch(/Excel|エクセル|xlsx/i);
  });
});
