import { describe, expect, it } from "vitest";

import { detectDeliverableFormats } from "./detect-formats";
import { resolveGenerationFormats } from "./resolve-formats";
import { isExplicitWordRequest } from "./word-intent";

describe("Word format detection", () => {
  const wordCases = [
    "Wordで作って",
    "ワードで作って",
    "Wordファイルにして",
    "docxで作成",
    ".docxで出力",
    "Microsoft Word形式",
    "文章をWordにまとめて",
    "営業報告書をWordで作成してください",
    "議事録をワードファイルでください",
    "Ｗｏｒｄで作って",
    "wordで作って！",
  ];

  for (const assignment of wordCases) {
    it(`detects Word intent: ${assignment}`, () => {
      expect(isExplicitWordRequest(assignment)).toBe(true);
      const detected = detectDeliverableFormats(assignment);
      expect(detected.formats).toContain("docx");
      expect(detected.matchedRule).toBe("word_explicit");
      expect(detected.formats).toEqual(["docx"]);
    });
  }

  it("does not treat WordPress alone as Word", () => {
    expect(isExplicitWordRequest("WordPressの記事を書いて")).toBe(false);
    const detected = detectDeliverableFormats("WordPressの記事を書いて");
    expect(detected.matchedRule).not.toBe("word_explicit");
  });

  it("does not treat キーワード alone as Word", () => {
    expect(isExplicitWordRequest("SEOキーワードを整理して")).toBe(false);
    const detected = detectDeliverableFormats("SEOキーワードを整理して");
    expect(detected.matchedRule).not.toBe("word_explicit");
  });

  it("does not force word_explicit for non-Word assignments", () => {
    expect(isExplicitWordRequest("今日の天気を教えて")).toBe(false);
    const detected = detectDeliverableFormats("今日の天気を教えて");
    expect(detected.matchedRule).not.toBe("word_explicit");
  });

  it("does not mark casual chat as explicit Word even if defaults include docx", () => {
    expect(isExplicitWordRequest("こんにちは、進捗を教えて")).toBe(false);
    expect(detectDeliverableFormats("こんにちは、進捗を教えて").matchedRule).not.toBe(
      "word_explicit",
    );
  });

  it("keeps report formats when Word is not explicit", () => {
    const detected = detectDeliverableFormats("営業報告書を作成してください");
    expect(detected.matchedRule).toBe("report");
    expect(detected.formats).toEqual(["pdf", "docx"]);
  });

  it("ensures override still includes docx when assignment is Word-explicit", () => {
    const resolved = resolveGenerationFormats(
      "営業報告書をWordで作成してください",
      ["pdf"],
    );
    expect(resolved.formats).toContain("docx");
    expect(resolved.matchedRule).toContain("word");
  });
});
