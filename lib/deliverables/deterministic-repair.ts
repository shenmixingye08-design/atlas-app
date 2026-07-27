import type { WordTemplateId } from "./word-templates";
import { detectWordPurpose } from "./word-templates";

/**
 * Deterministic structure repair — NO AI.
 * Ensures template-expected sections exist as 要確認 placeholders when missing,
 * without inventing facts (names, amounts, dates).
 */

export type RequiredSectionSpec = {
  title: string;
  aliases: string[];
  placeholderBody: string;
};

const TEMPLATE_REQUIRED_SECTIONS: Partial<
  Record<WordTemplateId, RequiredSectionSpec[]>
> = {
  "sales-report": [
    {
      title: "訪問概要",
      aliases: ["訪問", "概要", "訪問概要", "本日の訪問"],
      placeholderBody: "要確認：訪問先・日時・担当者を追記してください。",
    },
    {
      title: "提案内容",
      aliases: ["提案", "提案内容", "ご提案"],
      placeholderBody: "要確認：提案した内容を追記してください。",
    },
    {
      title: "次のアクション",
      aliases: ["次のアクション", "アクション", "今後の対応"],
      placeholderBody: "要確認：次のアクションと担当・期限を追記してください。",
    },
  ],
  "meeting-minutes": [
    {
      title: "会議情報",
      aliases: ["会議情報", "基本情報", "開催概要"],
      placeholderBody: "要確認：会議名・日時・参加者を追記してください。",
    },
    {
      title: "決定事項",
      aliases: ["決定事項", "決議", "決定"],
      placeholderBody: "要確認：決定事項を追記してください。",
    },
    {
      title: "アクション項目",
      aliases: ["アクション", "担当", "宿題", "ToDo"],
      placeholderBody: "要確認：担当・期限付きのアクションを追記してください。",
    },
  ],
  proposal: [
    {
      title: "課題",
      aliases: ["課題", "問題点", "ニーズ", "背景"],
      placeholderBody: "要確認：お客様の課題を追記してください。",
    },
    {
      title: "提案内容",
      aliases: ["提案内容", "ご提案", "ソリューション"],
      placeholderBody: "要確認：提案内容を追記してください。",
    },
    {
      title: "次のステップ",
      aliases: ["次のステップ", "次のアクション", "今後の進め方"],
      placeholderBody: "要確認：次のステップを追記してください。",
    },
  ],
  estimate: [
    {
      title: "見積明細",
      aliases: ["見積", "明細", "費用", "価格", "お見積り"],
      placeholderBody: "要確認：品目・数量・単価を表形式で追記してください。架空の金額は入れません。",
    },
    {
      title: "注記",
      aliases: ["注記", "注意事項", "前提条件"],
      placeholderBody: "要確認：有効期限・支払条件などの注記を追記してください。",
    },
  ],
  contract: [
    {
      title: "当事者",
      aliases: ["当事者", "甲", "乙", "契約当事者"],
      placeholderBody: "要確認：甲・乙の名称を追記してください。架空の社名は入れません。",
    },
    {
      title: "契約条件",
      aliases: ["契約条件", "条件", "条項", "合意事項"],
      placeholderBody: "要確認：契約条件を追記してください。",
    },
    {
      title: "署名欄",
      aliases: ["署名", "署名欄", "記名押印"],
      placeholderBody: "要確認：署名・押印欄の日付と氏名は未記入のまま確認してください。",
    },
  ],
  "customer-letter": [
    {
      title: "本文",
      aliases: ["本文", "ご案内", "案内"],
      placeholderBody: "要確認：案内本文を追記してください。",
    },
  ],
  manual: [
    {
      title: "手順",
      aliases: ["手順", "ステップ", "操作手順"],
      placeholderBody: "要確認：手順を番号付きで追記してください。",
    },
  ],
};

function hasSection(content: string, aliases: string[]): boolean {
  const lower = content.toLowerCase();
  return aliases.some((alias) => {
    const a = alias.toLowerCase();
    return (
      lower.includes(`## ${a}`) ||
      lower.includes(`# ${a}`) ||
      lower.includes(`### ${a}`) ||
      new RegExp(`(^|\\n)\\s*${alias}\\s*($|\\n)`, "i").test(content)
    );
  });
}

/**
 * Append missing required section stubs. Never invents factual data.
 */
export function applyDeterministicStructureRepair(input: {
  content: string;
  assignment?: string;
  templateId?: WordTemplateId | null;
}): { content: string; addedSections: string[]; templateId: WordTemplateId } {
  const purpose = detectWordPurpose({
    assignment: input.assignment ?? "",
    content: input.content,
    explicitTemplateId: input.templateId ?? null,
  });
  const templateId = purpose.templateId;
  const required = TEMPLATE_REQUIRED_SECTIONS[templateId] ?? [];
  if (required.length === 0) {
    return { content: input.content, addedSections: [], templateId };
  }

  let next = input.content.trim();
  const added: string[] = [];
  for (const section of required) {
    if (hasSection(next, section.aliases)) continue;
    next = `${next}\n\n## ${section.title}\n${section.placeholderBody}\n`;
    added.push(section.title);
  }
  return { content: next.trim(), addedSections: added, templateId };
}
