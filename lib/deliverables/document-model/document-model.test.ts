import { describe, expect, it } from "vitest";

import { cleanDeliverableSource } from "./clean-content";
import { detectDocumentType } from "./detect-document-type";
import { buildStructuredDocument } from "./structure-document";

describe("detectDocumentType", () => {
  it("detects proposal, minutes, manual, research", () => {
    expect(
      detectDocumentType({
        assignment: "営業提案書を作成",
        content: "# ご提案\n## 提案内容",
      }),
    ).toBe("proposal");
    expect(
      detectDocumentType({
        assignment: "会議議事録",
        content: "## 決定事項\n## 参加者",
      }),
    ).toBe("minutes");
    expect(
      detectDocumentType({
        assignment: "業務マニュアル",
        content: "## 手順\n## 事前準備",
      }),
    ).toBe("manual");
    expect(
      detectDocumentType({
        assignment: "市場調査レポート",
        content: "## 調査目的\n## 調査方法",
      }),
    ).toBe("research");
  });
});

describe("cleanDeliverableSource", () => {
  it("removes conversational AI preamble and markdown markers", () => {
    const cleaned = cleanDeliverableSource(
      "はい、以下に作成します。\n\n# 提案書\n\n**重要**な点は`これ`です。",
    );
    expect(cleaned).not.toContain("以下に作成します");
    expect(cleaned).toContain("提案書");
    expect(cleaned).not.toContain("**");
    expect(cleaned).not.toContain("`");
    expect(cleaned).toContain("重要な点はこれです。");
  });
});

describe("buildStructuredDocument", () => {
  it("maps proposal sections and keeps tables", () => {
    const doc = buildStructuredDocument({
      assignment: "新規サービスの提案書",
      title: "MINERVOT導入ご提案",
      designTemplate: "business",
      content: `# MINERVOT導入ご提案

はい、以下に作成します。

## エグゼクティブサマリー
導入により業務時間を削減できます。

## 背景
現状は手作業が多いです。

## 課題
- 報告作成に時間がかかる
- 情報が分散している

## 提案内容
専属AI秘書として業務を自動化します。

## 比較
| 項目 | 現行 | MINERVOT |
| --- | --- | --- |
| 作成時間 | 3時間 | 20分 |
| 品質 | ばらつき | 安定 |

## 次のアクション
1. デモ実施
2. 試験導入
`,
    });

    expect(doc.documentType).toBe("proposal");
    expect(doc.designTemplate).toBe("business");
    expect(doc.meta.authorLabel).toBe("MINERVOT");
    expect(doc.sections.some((section) => section.role === "summary")).toBe(true);
    expect(doc.sections.some((section) => section.role === "actions")).toBe(true);
    const comparison = doc.sections.find((section) =>
      section.blocks.some((block) => block.type === "table"),
    );
    expect(comparison).toBeTruthy();
    const blob = JSON.stringify(doc);
    expect(blob).not.toContain("以下に作成します");
    expect(blob).not.toContain("**");
  });

  it("structures minutes with meta fields", () => {
    const doc = buildStructuredDocument({
      assignment: "週次会議の議事録",
      content: `# 週次定例 議事録

会議名：週次定例
日時：2026年7月22日 10:00
参加者：山田、佐藤

## 議題
- 進捗確認
- 課題共有

## 決定事項
| 決定 | 担当 | 期限 |
| --- | --- | --- |
| 資料更新 | 山田 | 7/25 |

## アクション項目
1. 見積再作成
`,
    });

    expect(doc.documentType).toBe("minutes");
    expect(doc.meta.fields.some((field) => field.label === "会議名")).toBe(true);
    expect(doc.sections.some((section) => section.role === "decisions")).toBe(true);
  });
});
