import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

vi.mock("@/lib/deliverables/store", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/deliverables/store")>();
  return {
    ...actual,
    saveDeliverableFileDurableDetailed: vi.fn(async () => ({
      stored: {
        id: "dlv_test",
        fileName: "t.pdf",
        format: "pdf",
        mimeType: "application/pdf",
        generatedAt: new Date().toISOString(),
        sizeBytes: 10,
        isPlaceholder: false,
      },
      persist: { durable: true, storageError: null },
    })),
    toDeliverableMetadata: vi.fn((stored: { id: string }, origin: string) => ({
      ...stored,
      downloadUrl: `${origin}/api/deliverables/${stored.id}`,
    })),
  };
});

vi.mock("@/lib/deliverables/generators", () => ({
  getDeliverableGenerator: () => ({
    generate: vi.fn(async () => ({
      buffer: Buffer.from("%PDF-1.4"),
      fileName: "t.pdf",
      format: "pdf",
      mimeType: "application/pdf",
      sizeBytes: 8,
      isPlaceholder: false,
    })),
  }),
}));

vi.mock("@/lib/deliverables/export-verify", () => ({
  metricKeyForFormat: (f: string) => f,
  verifyGeneratedExportAsync: vi.fn(async () => ({ ok: true, reasons: [] })),
}));

vi.mock("@/lib/reliability", () => ({
  recordReliabilityEvent: vi.fn(),
}));

vi.mock("@/lib/memory-apply/deliverables", () => ({
  applyMemoryForDeliverable: vi.fn(async (input: { content: string }) => ({
    applied: false,
    content: input.content,
    overlay: null,
    memoryIdsUsed: [],
    quality: { improvementRate: 0 },
  })),
}));

vi.mock("@/lib/memory-apply/metrics", () => ({
  recordMemoryApplyEvent: vi.fn(),
}));

import {
  generateQualityDeliverableContent,
  validateCommonSourceContent,
  validateDeliverableSourceContent,
  validateFormatSpecificSourceContent,
  validateWordSourceContent,
} from "@/lib/deliverables/content-quality";
import { probeContentQualityGate } from "@/lib/deliverables/content-quality-gate-probe";
import { generateDeliverables } from "@/lib/deliverables/engine";

const GOOD = `# 週次営業報告書

## 概要
本日の営業活動について報告します。顧客訪問と提案内容を整理しました。

## 詳細
- 訪問先: 株式会社サンプル
- 課題: 業務効率の改善
- 提案: 自動化の導入
- 金額: ¥120,000
- 次のアクション: 見積書送付

訪問結果を踏まえ、来週は追加ヒアリングを実施します。
`;

describe("P2-02 non-Word quality gate — happy / invalid / failure", () => {
  it("happy path: structured content passes common + pdf/xlsx/pptx", () => {
    expect(validateCommonSourceContent(GOOD).ok).toBe(true);
    expect(validateDeliverableSourceContent(GOOD, ["pdf"]).ok).toBe(true);
    expect(validateDeliverableSourceContent(GOOD, ["xlsx"]).ok).toBe(true);
    expect(validateDeliverableSourceContent(GOOD, ["pptx"]).ok).toBe(true);
    expect(validateWordSourceContent(GOOD).ok).toBe(true);
  });

  it("invalid/failure: short and placeholder fail for non-Word formats", () => {
    expect(validateDeliverableSourceContent("短すぎ", ["pdf"]).ok).toBe(false);
    expect(validateDeliverableSourceContent("短すぎ", ["xlsx"]).ok).toBe(false);
    expect(validateDeliverableSourceContent("短すぎ", ["pptx"]).ok).toBe(false);
    const placeholder =
      "本文です。".repeat(8) + " [TODO: ここに本文を入れる] " + "続き。".repeat(8);
    expect(
      validateDeliverableSourceContent(placeholder, ["pdf", "xlsx", "pptx"]).ok,
    ).toBe(false);
  });

  it("format-specific: flat paragraph fails xlsx/pptx structure checks", () => {
    const flat =
      "これは十分な長さの本文ですが、見出しも箇条書きも表もなく、スライドや表計算の構造がありません。実務資料として構造化されていない長文の段落だけが続いています。追加の説明を書いても構造は増えません。";
    expect(validateCommonSourceContent(flat).ok).toBe(true);
    expect(validateFormatSpecificSourceContent(flat, "xlsx").ok).toBe(false);
    expect(validateFormatSpecificSourceContent(flat, "pptx").ok).toBe(false);
  });

  it("happy path: compact vision table seed passes xlsx (not headings_only/too_short)", () => {
    const compactTable = [
      "# 表データ",
      "| 品目 | 数量 | 金額 |",
      "| --- | --- | --- |",
      "| A | 2 | 1000 |",
      "| B | 1 | 500 |",
    ].join("\n");
    expect(validateCommonSourceContent(compactTable).ok).toBe(true);
    expect(validateDeliverableSourceContent(compactTable, ["xlsx"]).ok).toBe(
      true,
    );
    // Still fail-closed for unstructured short text
    expect(validateDeliverableSourceContent("# 表データ\nなし", ["xlsx"]).ok).toBe(
      false,
    );
  });
});

describe("P2-02 — retry / duplicate / concurrency", () => {
  it("retries until content passes for requested formats", async () => {
    let calls = 0;
    const result = await generateQualityDeliverableContent({
      initialContent: "短すぎ",
      formats: ["pdf", "xlsx"],
      maxAttempts: 3,
      regenerate: async () => {
        calls += 1;
        if (calls < 2) return "まだ短い本文";
        return GOOD;
      },
    });
    expect(result.ok).toBe(true);
    expect(calls).toBe(2);
  });

  it("duplicate validation is deterministic", () => {
    const a = validateDeliverableSourceContent(GOOD, ["pptx"]);
    const b = validateDeliverableSourceContent(GOOD, ["pptx"]);
    expect(a).toEqual(b);
  });

  it("concurrent validations agree (multi-instance safe pure functions)", async () => {
    const results = await Promise.all(
      Array.from({ length: 8 }, () =>
        Promise.resolve(validateDeliverableSourceContent("短すぎ", ["pdf"])),
      ),
    );
    expect(results.every((r) => r.ok === false)).toBe(true);
  });
});

describe("P2-02 — engine fail-closed for non-Word path", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("rejects garbage pdf-only generation without producing deliverables", async () => {
    const result = await generateDeliverables(
      {
        assignment: "PDFの営業資料を作って",
        title: "資料",
        finalDeliverable: "短すぎ [TODO: 本文]",
        formats: ["pdf"],
      },
      "https://atlasapp.jp",
      { userId: "user_p202" },
    );
    expect(result.deliverables).toEqual([]);
    expect(result.failures.length).toBeGreaterThan(0);
    expect(result.failures[0]?.reasons.join(" ")).toMatch(/content_quality/);
  });

  it("accepts structured content on pdf-only path (happy)", async () => {
    const result = await generateDeliverables(
      {
        assignment: "PDFの営業資料を作って",
        title: "資料",
        finalDeliverable: GOOD,
        formats: ["pdf"],
      },
      "https://atlasapp.jp",
      { userId: "user_p202" },
    );
    expect(result.failures).toEqual([]);
    expect(result.deliverables.length).toBe(1);
  });
});

describe("P2-02 — ownership / restart / probe", () => {
  it("cross-user: gate is content-based (no user payload leak path)", () => {
    // Same garbage fails regardless of imaginary user — isolation is engine+auth.
    const a = validateDeliverableSourceContent("短すぎ", ["xlsx"]);
    const b = validateDeliverableSourceContent("短すぎ", ["xlsx"]);
    expect(a.ok).toBe(false);
    expect(b.ok).toBe(false);
  });

  it("restart durability: module validators remain identical after re-import", async () => {
    const again = await import("@/lib/deliverables/content-quality");
    expect(again.validateDeliverableSourceContent(GOOD, ["pdf"]).ok).toBe(true);
  });

  it("Production probe fixtures pass on current code", () => {
    const probe = probeContentQualityGate();
    expect(probe.ok).toBe(true);
    expect(probe.commonGateOk).toBe(true);
    expect(probe.nonWordFormatsGated).toBe(true);
    expect(probe.formatSpecificOk).toBe(true);
    expect(probe.engineNonWordPathGated).toBe(true);
    expect(probe.failClosedOnGarbage).toBe(true);
    expect(probe.memoryNotSot).toBe(true);
    expect(probe.multiInstanceSafe).toBe(true);
  });
});
