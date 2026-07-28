import { describe, expect, it } from "vitest";

import { getDeliverableExportText } from "./deliverable-export";
import {
  isForbiddenTitle,
  isJsonLikeForbiddenFallback,
  looksLikeDeliverableJson,
} from "./normalize-deliverable-payload";

/**
 * Production Word failure repro: Commander deliverables sometimes omit
 * summary/content (or persist with undefined). getDeliverableExportText used
 * to throw TypeError on .trim(), aborting Word export after AI succeeded.
 */
describe("Word export undefined field safety", () => {
  it("isJsonLikeForbiddenFallback tolerates undefined/null", () => {
    expect(isJsonLikeForbiddenFallback(undefined as unknown as string)).toBe(
      false,
    );
    expect(isJsonLikeForbiddenFallback(null as unknown as string)).toBe(false);
    expect(looksLikeDeliverableJson(undefined as unknown as string)).toBe(
      false,
    );
    expect(isForbiddenTitle(undefined as unknown as string)).toBe(false);
  });

  it("getDeliverableExportText does not throw when summary/content missing", () => {
    const partial = {
      type: "document",
      title: "結果",
      markdown:
        "本文です。十分に長い内容をここに書きます。テスト用の段落です。".repeat(
          3,
        ),
      plainText: "本文です。",
      html: "<p>本文</p>",
      metadata: {
        tags: [],
        seo: { title: "", description: "", keywords: [] },
        snsPost: "",
        topic: "",
        audience: "",
        sourceTaskId: null,
        workerCount: 1,
      },
      downloads: [],
    };

    expect(() => getDeliverableExportText(partial as never)).not.toThrow();
    const text = getDeliverableExportText(partial as never);
    expect(text.trim().length).toBeGreaterThan(20);
  });
});
