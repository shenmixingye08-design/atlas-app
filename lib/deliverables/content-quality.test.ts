import { describe, expect, it } from "vitest";

import {
  contentRetryStrategyForAttempt,
  generateQualityWordContent,
  validateWordSourceContent,
} from "@/lib/deliverables/content-quality";

describe("word content quality gate", () => {
  it("accepts a normal Japanese business report", () => {
    const text = `# 営業報告書

## 概要
本日の営業活動について報告します。顧客訪問と提案内容をまとめました。

## 詳細
訪問先は株式会社サンプルです。課題は業務効率の改善で、提案は自動化の導入です。
次のアクションとして見積書を送付します。
`;
    const result = validateWordSourceContent(text);
    expect(result.ok).toBe(true);
  });

  it("rejects empty / json / html / placeholder / repetition", () => {
    expect(validateWordSourceContent("").ok).toBe(false);
    expect(validateWordSourceContent('{"type":"report","content":"x"}').ok).toBe(
      false,
    );
    expect(
      validateWordSourceContent("<!DOCTYPE html><html><title>Error 500</title></html>")
        .ok,
    ).toBe(false);
    expect(
      validateWordSourceContent(
        "本文です。".repeat(5) + " [TODO: ここに本文を入れる] " + "続き。".repeat(10),
      ).ok,
    ).toBe(false);
    expect(
      validateWordSourceContent("同じ文章を大量に繰り返しています。".repeat(40)).ok,
    ).toBe(false);
  });

  it("rejects headings-only documents", () => {
    const result = validateWordSourceContent(`# 題名\n## 見出し1\n## 見出し2\n`);
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.issues).toContain("headings_only");
    }
  });

  it("retries AI content until quality passes", async () => {
    let calls = 0;
    const good = `# 復旧本文

## 概要
本日の営業活動について報告します。顧客訪問と提案内容を整理しました。

## 詳細
訪問先は株式会社サンプルです。課題は業務効率の改善で、提案は自動化の導入です。
次のアクションとして見積書を送付し、関係者と共有します。
`;
    expect(validateWordSourceContent(good).ok).toBe(true);
    const result = await generateQualityWordContent({
      initialContent: "短すぎ",
      maxAttempts: 3,
      regenerate: async () => {
        calls += 1;
        if (calls < 2) return "まだ短い";
        return good;
      },
    });
    expect(result.ok).toBe(true);
    expect(calls).toBe(2);
  });

  it("maps retry strategies by attempt", () => {
    expect(contentRetryStrategyForAttempt(1)).toBe("same_model");
    expect(contentRetryStrategyForAttempt(2)).toBe("simplified_prompt");
    expect(contentRetryStrategyForAttempt(3)).toBe("fallback_model");
  });
});
