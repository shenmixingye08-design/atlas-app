import { describe, expect, it } from "vitest";

import { emptyDeliverable } from "@/lib/orchestration/deliverable-types";
import {
  getDeliverableExportText,
} from "@/lib/orchestration/deliverable-export";
import {
  deliverableIsDisplaySafe,
  isDeliverableJsonText,
  normalizeDeliverableForDisplay,
  sanitizeBodyTextForDisplay,
} from "@/lib/orchestration/deliverable-display";
import {
  assertSafeDeliverableForPersistence,
  assertSafeExportText,
  isForbiddenTitle,
  isJsonLikeForbiddenFallback,
  looksLikeDeliverableJson,
  normalizeDeliverablePayload,
} from "@/lib/orchestration/normalize-deliverable-payload";
import { parseWorkerDeliverablePayload } from "@/lib/orchestration/worker-output";

const SAMPLE = {
  type: "document",
  title: "太陽光提案書",
  summary: "建設会社向けの提案概要です。",
  content: "本文の第一段落です。\n\n第二段落では詳細を説明します。",
  markdown: "本文の第一段落です。\n\n第二段落では詳細を説明します。",
  plainText: "本文の第一段落です。 第二段落では詳細を説明します。",
  metadata: {
    tags: ["提案"],
    seo: { title: "太陽光提案書", description: "概要", keywords: ["太陽光"] },
    snsPost: "",
    topic: "太陽光",
    audience: "建設会社",
    sourceTaskId: null,
    workerCount: 1,
  },
};

function expectNoInternalJsonLeak(text: string): void {
  expect(text.trim().startsWith("{")).toBe(false);
  expect(text).not.toMatch(/^\s*\{\s*"type"\s*:/m);
  expect(isDeliverableJsonText(text)).toBe(false);
}

describe("normalizeDeliverablePayload — normal cases", () => {
  it("1. accepts a normal Deliverable object", () => {
    const result = normalizeDeliverablePayload(SAMPLE);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.deliverable.title).toBe("太陽光提案書");
    expect(result.deliverable.content).toContain("本文の第一段落");
    expectNoInternalJsonLeak(result.deliverable.content);
  });

  it("2. accepts a normal JSON string", () => {
    const result = normalizeDeliverablePayload(JSON.stringify(SAMPLE));
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.deliverable.title).toBe("太陽光提案書");
  });

  it("3. accepts ```json fenced JSON", () => {
    const fenced = `\`\`\`json\n${JSON.stringify(SAMPLE)}\n\`\`\``;
    const result = normalizeDeliverablePayload(fenced);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.deliverable.summary).toContain("建設会社");
  });

  it("4. extracts JSON surrounded by prose", () => {
    const wrapped = `以下が成果物です。\n${JSON.stringify(SAMPLE)}\n以上です。`;
    const result = normalizeDeliverablePayload(wrapped);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.deliverable.title).toBe("太陽光提案書");
    expect(result.repairedLegacyData).toBe(true);
  });

  it("5. accepts JSON with content body", () => {
    const result = normalizeDeliverablePayload({
      type: "document",
      title: "タイトル",
      summary: "概要",
      content: "ユーザー向け本文",
    });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.deliverable.content).toBe("ユーザー向け本文");
  });

  it("6. accepts JSON with markdown body", () => {
    const result = normalizeDeliverablePayload({
      type: "blog",
      title: "記事",
      summary: "概要",
      markdown: "# 見出し\n\n本文です",
    });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.deliverable.markdown).toContain("本文です");
  });

  it("7. unwraps double-stringified JSON", () => {
    const double = JSON.stringify(JSON.stringify(SAMPLE));
    const result = normalizeDeliverablePayload(double);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.deliverable.title).toBe("太陽光提案書");
    expect(result.repairedLegacyData).toBe(true);
  });

  it("8. keeps allowed metadata", () => {
    const result = normalizeDeliverablePayload(SAMPLE);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.deliverable.metadata.tags).toContain("提案");
    expect(result.deliverable.metadata.seo.keywords).toContain("太陽光");
  });

  it("9. accepts long Japanese text", () => {
    const long = "あ".repeat(5000);
    const result = normalizeDeliverablePayload({
      type: "report",
      title: "長文レポート",
      summary: "長い本文の要約",
      content: long,
    });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.deliverable.content.length).toBe(5000);
  });

  it("10. preserves newlines in body", () => {
    const result = normalizeDeliverablePayload({
      type: "document",
      title: "改行テスト",
      summary: "概要",
      content: "一行目\n\n二行目\n三行目",
    });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.deliverable.content).toContain("\n\n");
  });
});

describe("normalizeDeliverablePayload — abnormal cases", () => {
  it("11. rejects title '{'", () => {
    expect(isForbiddenTitle("{")).toBe(true);
    const persist = assertSafeDeliverableForPersistence({
      ...emptyDeliverable("document"),
      title: "{",
      summary: "概要",
      content: "本文",
    });
    // May repair title to fallback; must not keep "{"
    if (persist.ok) {
      expect(persist.deliverable.title).not.toBe("{");
    }
  });

  it("12. rejects summary containing full JSON", () => {
    const json = JSON.stringify(SAMPLE);
    const result = normalizeDeliverablePayload({
      ...emptyDeliverable("document"),
      title: "タイトル",
      summary: json,
      content: "本文",
    });
    if (result.ok) {
      expect(looksLikeDeliverableJson(result.deliverable.summary)).toBe(false);
      expect(result.deliverable.summary).not.toContain('"type"');
    }
  });

  it("13. expands or rejects content that is full JSON", () => {
    const json = JSON.stringify(SAMPLE);
    const result = normalizeDeliverablePayload({
      ...emptyDeliverable("document"),
      title: "{",
      summary: json,
      content: json,
    });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.deliverable.title).toBe("太陽光提案書");
    expect(result.deliverable.content).toContain("本文の第一段落");
    expectNoInternalJsonLeak(result.deliverable.content);
  });

  it("14. expands markdown that is full JSON", () => {
    const json = JSON.stringify(SAMPLE);
    const result = normalizeDeliverablePayload({
      ...emptyDeliverable("document"),
      markdown: json,
    });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expectNoInternalJsonLeak(result.deliverable.markdown);
  });

  it("15. expands plainText that is full JSON", () => {
    const json = JSON.stringify(SAMPLE);
    const result = normalizeDeliverablePayload({
      ...emptyDeliverable("document"),
      plainText: json,
    });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expectNoInternalJsonLeak(result.deliverable.plainText);
  });

  it("16. fails safely on truncated JSON", () => {
    const truncated = '{"type":"document","title":"x","content":"hello"';
    const result = normalizeDeliverablePayload(truncated);
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.safeMessage).toContain("再生成");
  });

  it("17. fails safely on invalid quotes", () => {
    const bad = "{'type':'document','title':'x','content':'y'}";
    const result = normalizeDeliverablePayload(bad);
    expect(result.ok).toBe(false);
  });

  it("18. rejects invalid type", () => {
    const result = normalizeDeliverablePayload({
      type: "spaceship",
      title: "x",
      content: "y",
    });
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.errorCode).toBe("INVALID_SCHEMA");
  });

  it("19. rejects empty JSON object", () => {
    const result = normalizeDeliverablePayload("{}");
    expect(result.ok).toBe(false);
  });

  it("20. rejects empty content and markdown", () => {
    const result = normalizeDeliverablePayload({
      type: "document",
      title: "タイトル",
      summary: "",
      content: "",
      markdown: "",
    });
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.errorCode).toBe("NO_USER_VISIBLE_CONTENT");
  });

  it("21. rejects nest unwrap overflow", () => {
    let nested: unknown = SAMPLE;
    for (let i = 0; i < 5; i += 1) {
      nested = JSON.stringify(nested);
    }
    const result = normalizeDeliverablePayload(nested);
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(["NESTED_JSON_LIMIT", "JSON_LIKE_UNPARSEABLE", "INVALID_JSON"]).toContain(
      result.errorCode,
    );
  });

  it("22. rejects arrays", () => {
    const result = normalizeDeliverablePayload([{ type: "document" }]);
    expect(result.ok).toBe(false);
  });

  it("23. rejects null", () => {
    const result = normalizeDeliverablePayload(null);
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.errorCode).toBe("EMPTY_RESPONSE");
  });

  it("24. rejects HTML-only responses", () => {
    const result = normalizeDeliverablePayload("<!DOCTYPE html><html><body>hi</body></html>");
    expect(result.ok).toBe(false);
  });

  it("25. does not false-positive normal prose mentioning JSON keys", () => {
    const prose =
      "この依頼では type や content という語を説明しますが、成果物そのものではありません。";
    expect(isJsonLikeForbiddenFallback(prose)).toBe(false);
    expect(looksLikeDeliverableJson(prose)).toBe(false);
    const payload = parseWorkerDeliverablePayload(prose, "説明文を書いて");
    expect(payload).not.toBeNull();
    expect(payload?.content).toContain("type");
    expect(payload?.title).not.toBe("{");
  });

  it("26. never adopts unparseable JSON-like text as body via worker parser", () => {
    const bad = '{\n  "type": "document",\n  "title": "x",\n  "content": ';
    expect(isJsonLikeForbiddenFallback(bad)).toBe(true);
    const payload = parseWorkerDeliverablePayload(bad, "提案書を作成");
    expect(payload).toBeNull();
  });

  it("27. repairs legacy broken stored shape", () => {
    const legacy = {
      type: "document",
      title: "{",
      summary: JSON.stringify(SAMPLE),
      content: JSON.stringify(SAMPLE),
      markdown: JSON.stringify(SAMPLE),
      plainText: JSON.stringify(SAMPLE),
      metadata: SAMPLE.metadata,
      downloads: [],
    };
    const result = normalizeDeliverablePayload(legacy);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.deliverable.title).toBe("太陽光提案書");
    expect(result.deliverable.summary).not.toContain('"type"');
    expectNoInternalJsonLeak(result.deliverable.content);
  });
});

describe("display / export guards", () => {
  it("28. FinalOutput-equivalent display never shows raw JSON", () => {
    const broken = {
      ...emptyDeliverable("document"),
      title: "{",
      summary: JSON.stringify(SAMPLE),
      content: JSON.stringify(SAMPLE),
      markdown: JSON.stringify(SAMPLE),
    };
    const normalized = normalizeDeliverableForDisplay(broken);
    expect(normalized.title).not.toBe("{");
    expect(normalized.summary).not.toContain('"type"');
    expect(sanitizeBodyTextForDisplay(normalized.content)).not.toMatch(/^\s*\{/);
    expect(deliverableIsDisplaySafe(normalized)).toBe(true);
  });

  it("29. Word/export path rejects raw JSON", () => {
    const json = JSON.stringify(SAMPLE);
    const guarded = assertSafeExportText(json);
    expect(guarded.ok).toBe(false);
  });

  it("30. PDF/export path rejects JSON-like markdown body", () => {
    const broken = {
      ...emptyDeliverable("document"),
      title: "{",
      content: JSON.stringify(SAMPLE),
      markdown: JSON.stringify(SAMPLE),
    };
    // After normalize, export should be clean user text — never raw JSON.
    const exportText = getDeliverableExportText(broken);
    expect(exportText).toContain("太陽光提案書");
    expectNoInternalJsonLeak(exportText);
    expect(assertSafeExportText(exportText).ok).toBe(true);
  });

  it("31. Google Drive guard rejects JSON before save", () => {
    const json = '```json\n{"type":"document","title":"x","content":"y"}\n```';
    expect(assertSafeExportText(json).ok).toBe(false);
    const repaired = normalizeDeliverablePayload(json);
    expect(repaired.ok).toBe(true);
    if (!repaired.ok) return;
    const exportText = getDeliverableExportText(repaired.deliverable);
    expect(assertSafeExportText(exportText).ok).toBe(true);
  });
});

describe("worker fallback regression (root cause)", () => {
  it("does not set title to '{' when JSON parse fails", () => {
    const broken = `{
  "type": "document",
  "title": "提案書",
  "summary": "概要",
  "content": "本文が途中で切れ
`;
    const payload = parseWorkerDeliverablePayload(broken, "提案書を作成して");
    expect(payload).toBeNull();
  });

  it("parses valid worker JSON into separated fields", () => {
    const payload = parseWorkerDeliverablePayload(JSON.stringify(SAMPLE), "提案書を作成して");
    expect(payload).not.toBeNull();
    expect(payload?.title).toBe("太陽光提案書");
    expect(payload?.content).toContain("本文の第一段落");
    expect(payload?.summary).not.toContain('"type"');
  });
});
