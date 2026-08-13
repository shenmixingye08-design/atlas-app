/**
 * Blog intent from assignment + title. Deterministic — no extra LLM call.
 * Separate from Word document intent.
 */

export type BlogIntent =
  | "seo_guide"
  | "howto"
  | "comparison"
  | "product"
  | "news"
  | "expert"
  | "column"
  | "faq"
  | "listicle"
  | "problem_solution";

const RULES: Array<{ intent: BlogIntent; pattern: RegExp }> = [
  { intent: "howto", pattern: /手順|やり方|方法|how to|初心者向け/i },
  { intent: "comparison", pattern: /比較|違い|vs\.?|選び方|対比/i },
  { intent: "product", pattern: /紹介|サービス紹介|商品|料金|プラン/i },
  { intent: "news", pattern: /ニュース|速報|発表|アップデート/i },
  { intent: "faq", pattern: /FAQ|よくある質問|Q&A/i },
  { intent: "listicle", pattern: /\d+選|まとめ\s*\d+|リスト/i },
  { intent: "seo_guide", pattern: /SEO|検索され|検索意図|キーワード/i },
  { intent: "problem_solution", pattern: /課題|悩み|解決|削減/i },
  { intent: "expert", pattern: /解説|仕組み|専門|技術/i },
  { intent: "column", pattern: /コラム|体験|エッセイ|思う/i },
];

function matchIntent(hay: string): BlogIntent | null {
  for (const rule of RULES) {
    if (rule.pattern.test(hay)) return rule.intent;
  }
  return null;
}

export function resolveBlogIntent(input: {
  assignment?: string | null;
  title?: string | null;
  body?: string | null;
}): BlogIntent {
  // Assignment/title win over body so a how-to phrase inside an SEO article
  // does not reclassify the whole piece.
  const fromRequest = matchIntent(
    [input.assignment, input.title].filter(Boolean).join("\n"),
  );
  if (fromRequest) return fromRequest;
  return matchIntent(input.body?.slice(0, 400) ?? "") ?? "expert";
}

export function suggestedHeadingOutline(intent: BlogIntent): string[] {
  switch (intent) {
    case "howto":
      return ["必要なもの", "手順", "つまずきやすい点"];
    case "comparison":
      return ["比較の観点", "違い", "選び方"];
    case "product":
      return ["誰向けか", "できること", "向いていない場合"];
    case "faq":
      return ["よくある質問"];
    case "listicle":
      return ["選定の基準", "各項目", "まとめ"];
    case "news":
      return ["何が変わったか", "影響", "今後の確認点"];
    case "seo_guide":
      return ["検索意図", "押さえる要点", "実践手順"];
    case "problem_solution":
      return ["いま起きていること", "原因", "具体的な進め方"];
    case "column":
      return ["きっかけ", "考えたこと", "実務への落とし込み"];
    default:
      return ["要点", "詳しく", "次に確認すること"];
  }
}
