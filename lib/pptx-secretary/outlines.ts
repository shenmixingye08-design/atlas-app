import type { PptxIntent } from "./detect-intent";
import { PPTX_LIMITS } from "./limits";
import type {
  PresentationKind,
  PresentationModel,
  SlideModel,
  SlideType,
} from "./types";
import { resolveTheme, themeForKind } from "./themes";

type OutlineStep = {
  type: SlideType;
  title: string;
  bullets: string[];
  visual?: SlideModel["visuals"][number];
  chart?: SlideModel["charts"][number];
  notesHint: string;
};

function clampBullets(items: string[]): string[] {
  return items
    .map((item) => item.trim().slice(0, PPTX_LIMITS.maxBulletChars))
    .filter(Boolean)
    .slice(0, PPTX_LIMITS.maxBulletsPerSlide);
}

function storyForKind(kind: PresentationKind, intent: PptxIntent): OutlineStep[] {
  switch (kind) {
    case "sales_pitch":
    case "proposal":
    case "service_intro":
      return [
        { type: "title", title: intent.title, bullets: [intent.audience, intent.purpose], notesHint: "今日のゴールを一文で伝える" },
        { type: "agenda", title: "本日の流れ", bullets: ["課題の確認", "解決策", "導入効果", "次のステップ"], notesHint: "時間配分に触れる" },
        { type: "bullets", title: "お客様の課題", bullets: ["現場の負担が増えている", "情報が分散し判断が遅れる", "習慣的な作業に時間を取られる"], notesHint: "顧客の言葉で課題を確認" },
        { type: "bullets", title: "現状の問題", bullets: ["属人化し再現できない", "提出物の品質がばらつく", "確認・修正の往復が多い"], notesHint: "放置した場合の影響を添える" },
        { type: "bullets", title: "解決策の全体像", bullets: ["依頼を理解し成果物まで代行", "必要な確認だけを最小限に", "再利用できる形で残す"], notesHint: "解決の原則を簡潔に" },
        {
          type: "process",
          title: "利用イメージ",
          bullets: ["依頼する", "確認する", "提出する"],
          visual: { type: "process", items: ["短い依頼を送る", "不足情報のみ確認", "提出可能な資料が完成"], title: "3ステップ" },
          notesHint: "デモや画面の話へつなぐ",
        },
        { type: "kpi_cards", title: "期待できる効果", bullets: ["作業時間の削減", "提出品質の均一化", "判断待ちの減少"], notesHint: "数値は顧客データがある場合のみ具体化" },
        ...(intent.needsPricing
          ? [{ type: "comparison" as const, title: "料金の考え方", bullets: ["用途に応じたプラン", "必要な機能から選定", "まずは小さく開始"], notesHint: "勝手な金額は言わない" }]
          : []),
        {
          type: "process",
          title: "導入手順",
          bullets: ["現状ヒアリング", "初期設定", "運用開始"],
          visual: { type: "timeline", items: ["Week 1 ヒアリング", "Week 2 設定", "Week 3 運用"], title: "導入ロードマップ" },
          notesHint: "次の打ち合わせ日程を提案",
        },
        { type: "faq", title: "よくある質問", bullets: ["既存資料は使えるか", "セキュリティはどうか", "どの業務から始めるか"], notesHint: "不安を先回りして解消" },
        { type: "cta", title: "次のアクション", bullets: ["課題の優先順位を一緒に整理", "サンプル資料を確認", "導入キックオフを設定"], notesHint: "具体的な次の一歩を依頼" },
        { type: "closing", title: "ご清聴ありがとうございました", bullets: [intent.title], notesHint: "連絡先と感謝で締める" },
      ];
    case "monthly_report":
    case "internal_meeting":
      return [
        { type: "title", title: intent.title, bullets: ["結論から共有します"], notesHint: "結論を先に述べる" },
        { type: "bullets", title: "結論", bullets: ["目標に対する進捗を確認", "ボトルネックを特定", "次月の打ち手を合意"], notesHint: "意思決定ポイントを明示" },
        {
          type: "chart",
          title: "KPIハイライト",
          bullets: ["主要指標の推移", "目標差分", "注目ポイント"],
          chart: {
            type: "bar",
            title: "KPI（例・要差替）",
            categories: ["指標A", "指標B", "指標C"],
            series: [{ name: "実績", values: [0, 0, 0] }],
            unit: "",
          },
          notesHint: "実データがある場合のみ数値を更新。0はプレースホルダ",
        },
        { type: "bullets", title: "実績サマリー", bullets: ["達成できたこと", "未達の領域", "前月比の変化"], notesHint: "事実と解釈を分けて話す" },
        { type: "bullets", title: "問題点", bullets: ["進捗遅延の箇所", "品質のばらつき", "リソース不足"], notesHint: "責任追及ではなく改善視点" },
        { type: "bullets", title: "原因", bullets: ["前提条件の変化", "プロセスの詰まり", "情報連携の遅れ"], notesHint: "再発防止に繋げる" },
        { type: "bullets", title: "改善策", bullets: ["優先度の再設定", "定例での可視化", "自動化できる作業の切り出し"], notesHint: "誰がいつまでにを明確に" },
        {
          type: "timeline",
          title: "次月計画",
          bullets: ["重点テーマ", "マイルストーン", "必要な支援"],
          visual: { type: "roadmap", items: ["Week1 着手", "Week2 中間確認", "Week4 振り返り"], title: "次月ロードマップ" },
          notesHint: "合意事項をメモするよう促す",
        },
        { type: "closing", title: "議論したいこと", bullets: ["優先順位の確認", "支援が必要な領域"], notesHint: "質問を受け付ける" },
      ];
    case "training":
    case "seminar":
    case "school":
      return [
        { type: "title", title: intent.title, bullets: ["学習目標を共有します"], notesHint: "到達目標を読み上げる" },
        { type: "bullets", title: "学習目標", bullets: ["基礎を理解する", "手順を再現できる", "現場で応用できる"], notesHint: "受講後の変化を具体化" },
        { type: "bullets", title: "基礎知識", bullets: ["用語の定義", "全体の流れ", "注意点"], notesHint: "質問を挟む余白を取る" },
        {
          type: "process",
          title: "手順",
          bullets: ["準備", "実行", "確認"],
          visual: { type: "flow", items: ["準備する", "手順どおり進める", "結果を確認する"], title: "基本フロー" },
          notesHint: "デモに切り替える合図",
        },
        { type: "bullets", title: "具体例", bullets: ["良い例", "避けるべき例", "現場での応用"], notesHint: "受講者の業務に引き寄せる" },
        { type: "bullets", title: "演習", bullets: ["短い課題に挑戦", "ペアで確認", "気づきを共有"], notesHint: "時間を区切って進行" },
        { type: "bullets", title: "まとめ", bullets: ["今日の要点", "明日からの一歩", "参考資料"], notesHint: "行動宣言を促す" },
        { type: "closing", title: "ご清聴ありがとうございました", bullets: ["質問を受け付けます"], notesHint: "Q&Aへ" },
      ];
    case "company_intro":
      return [
        { type: "title", title: intent.title, bullets: ["私たちについて"], notesHint: "第一印象を簡潔に" },
        { type: "agenda", title: "本日の内容", bullets: ["ミッション", "事業", "強み", "実績の考え方", "一緒にできること"], notesHint: "時間に応じて省略点を伝える" },
        { type: "bullets", title: "ミッション", bullets: ["お客様の時間を生み出す", "習慣的な作業を減らす", "継続的に改善する"], notesHint: "理念を短く" },
        { type: "bullets", title: "事業概要", bullets: ["AI秘書としての伴走", "成果物作成の代行", "業務の記憶と再利用"], notesHint: "提供範囲を明確に" },
        { type: "comparison", title: "選ばれる理由", bullets: ["会話で終わらせない", "提出品質まで伴走", "必要なAIだけ使う"], notesHint: "差別化を事実ベースで" },
        { type: "bullets", title: "提供価値", bullets: ["時間", "効率", "記憶", "継続", "分析"], notesHint: "価値の言葉を揃える" },
        { type: "cta", title: "ご一緒できること", bullets: ["課題整理", "トライアル", "定例運用"], notesHint: "次の接点を提案" },
        { type: "closing", title: "ありがとうございました", bullets: [], notesHint: "名刺交換・連絡先" },
      ];
    case "investor":
    case "business_plan":
      return [
        { type: "title", title: intent.title, bullets: [intent.purpose], notesHint: "問題意識から入る" },
        { type: "bullets", title: "課題", bullets: ["市場の非効率", "ユーザーの負担", "既存手段の限界"], notesHint: "なぜ今かを説明する" },
        { type: "bullets", title: "ソリューション", bullets: ["依頼理解から成果物まで", "コストを抑えたAI活用", "継続利用される設計"], notesHint: "プロダクトの核" },
        { type: "bullets", title: "市場と顧客", bullets: ["対象セグメント", "導入シーン", "拡大余地"], notesHint: "根拠のない市場規模は言わない" },
        { type: "process", title: "ビジネスモデル", bullets: ["提供価値", "収益の考え方", "運用"], visual: { type: "funnel", items: ["認知", "体験", "継続"], title: "獲得ファネル" }, notesHint: "数字は実データがある時のみ" },
        { type: "timeline", title: "ロードマップ", bullets: ["短期", "中期", "検証指標"], visual: { type: "roadmap", items: ["今期", "来期", "再来期"], title: "成長ロードマップ" }, notesHint: "マイルストーンを合意" },
        { type: "cta", title: "お願いしたいこと", bullets: ["議論したい論点", "必要な支援"], notesHint: "明確なAsk" },
        { type: "closing", title: "Thank you", bullets: [], notesHint: "Q&A" },
      ];
    case "product":
      return [
        { type: "title", title: intent.title, bullets: ["商品の価値を短時間で"], notesHint: "誰の何を解決するかを先に" },
        { type: "bullets", title: "こんな方へ", bullets: ["忙しく資料作成が負担", "品質を揃えたい", "繰り返し作業を減らしたい"], notesHint: "ペルソナを確認" },
        { type: "bullets", title: "特長", bullets: ["短い依頼で開始", "用途に合う構成", "提出まで伴走"], notesHint: "デモへつなぐ" },
        { type: "process", title: "使い方", bullets: ["依頼", "確認", "完成"], visual: { type: "process", items: ["依頼する", "確認する", "使う"], title: "利用手順" }, notesHint: "画面を見せる" },
        { type: "cta", title: "次の一歩", bullets: ["無料で試す", "相談する"], notesHint: "CTAを一つに絞る" },
        { type: "closing", title: "ご清聴ありがとうございました", bullets: [], notesHint: "締め" },
      ];
    default:
      return [
        { type: "title", title: intent.title, bullets: [intent.purpose], notesHint: "目的を共有" },
        { type: "agenda", title: "アジェンダ", bullets: ["背景", "要点", "まとめ"], notesHint: "流れを示す" },
        { type: "bullets", title: "背景", bullets: ["現状", "課題", "目的"], notesHint: "前提を揃える" },
        { type: "bullets", title: "要点", bullets: ["伝えたいこと1", "伝えたいこと2", "伝えたいこと3"], notesHint: "本題" },
        { type: "bullets", title: "まとめ", bullets: ["結論", "次のアクション"], notesHint: "行動で締める" },
        { type: "closing", title: "ご清聴ありがとうございました", bullets: [], notesHint: "質疑" },
      ];
  }
}

function toSlide(step: OutlineStep, index: number, seconds: number): SlideModel {
  return {
    slide_number: index + 1,
    type: step.type,
    title: step.title.slice(0, PPTX_LIMITS.maxTitleChars),
    subtitle: step.type === "title" ? step.bullets[0] : undefined,
    content: clampBullets(step.type === "title" ? step.bullets.slice(1) : step.bullets).map(
      (text) => ({ text, level: 0 as const }),
    ),
    visuals: step.visual ? [step.visual] : [],
    charts: step.chart ? [step.chart] : [],
    speaker_notes: [
      step.notesHint,
      step.bullets.length ? `補足: ${step.bullets.slice(0, 2).join(" / ")}` : "",
      "次のスライドへ自然につなぎます。",
      `目安: 約${Math.max(20, Math.round(seconds))}秒`,
    ]
      .filter(Boolean)
      .join("\n"),
    source_references: [],
    layout: step.type,
    estimated_seconds: seconds,
  };
}

/** Build structured presentation from intent — no invented metrics. */
export function buildPresentationFromIntent(
  intent: PptxIntent,
  options?: { brand?: PresentationModel["theme"]["brand"]; contentHints?: string[] },
): PresentationModel {
  const steps = storyForKind(intent.kind, intent);
  const trimmed = steps.slice(0, Math.max(4, intent.targetSlides));
  const secondsEach = (intent.durationMinutes * 60) / trimmed.length;
  const slides = trimmed.map((step, index) => toSlide(step, index, secondsEach));

  if (options?.contentHints?.length) {
    const hintSlide = slides.find((s) => s.type === "bullets");
    if (hintSlide) {
      hintSlide.content = clampBullets(options.contentHints).map((text) => ({
        text,
        level: 0 as const,
      }));
      hintSlide.source_references = ["user_provided_content"];
    }
  }

  const theme = resolveTheme(themeForKind(intent.kind), options?.brand ?? {});

  return {
    presentation_title: intent.title,
    purpose: intent.purpose,
    audience: intent.audience,
    language: intent.language,
    aspect_ratio: intent.aspectRatio,
    kind: intent.kind,
    duration_minutes: intent.durationMinutes,
    theme,
    slides,
    warnings: [
      ...(intent.needsMetrics
        ? ["数値・実績は元データがある場合のみ反映します。未提供の数字はプレースホルダです。"]
        : []),
      ...(intent.needsPricing
        ? ["料金の具体額は未提供のため、考え方のみ記載しています。"]
        : []),
    ],
    assumptions: [
      `アスペクト比は${intent.aspectRatio}`,
      `発表時間は約${intent.durationMinutes}分`,
      "言語は日本語（指定時は英語）",
      "フォントは Yu Gothic（環境により代替フォント）",
      `テーマ: ${theme.style}`,
    ],
  };
}
