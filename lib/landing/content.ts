import { listPlanDefinitions } from "@/lib/billing/plans/registry";

export const LANDING_CAPABILITIES = [
  {
    id: "documents",
    icon: "📄",
    title: "資料を作る",
    description:
      "PDF・Word・Excel・PowerPointなどの資料作成をサポートします。",
  },
  {
    id: "organize",
    icon: "🗂️",
    title: "情報を整理する",
    description:
      "写真・PDF・資料から必要な情報を整理し、分かりやすくまとめます。",
  },
  {
    id: "remember",
    icon: "🧠",
    title: "仕事を記憶する",
    description:
      "仕事の進め方や習慣を学習し、次回以降の作業へ反映します。",
  },
  {
    id: "analyze",
    icon: "📊",
    title: "分析する",
    description:
      "蓄積された仕事を分析し、改善点や傾向をご報告します。",
  },
  {
    id: "improve",
    icon: "💡",
    title: "改善を提案する",
    description:
      "仕事の結果をもとに、次回より効率的な進め方をご提案します。",
  },
  {
    id: "habit",
    icon: "🔁",
    title: "習慣を支える",
    description:
      "毎日・毎週・毎月の繰り返し作業を継続してサポートします。",
  },
] as const;

export const LANDING_WORKFLOW_STEPS = [
  {
    id: "request",
    icon: "✍️",
    label: "依頼する",
    detail: "お客様が実現したい仕事を、普段の言葉でご入力ください。",
  },
  {
    id: "upload",
    icon: "📎",
    label: "資料を送る",
    detail:
      "必要に応じて、写真・PDF・Word・Excel・PowerPoint・動画などをご提供ください。",
  },
  {
    id: "progress",
    icon: "⚙️",
    label: "MINERVOTが進める",
    detail:
      "ご依頼内容と資料を理解し、整理・作成・分析など、必要な仕事を進めます。",
  },
  {
    id: "review",
    icon: "✅",
    label: "確認して次回へ活かす",
    detail:
      "完成した内容をご確認ください。修正内容や仕事の進め方は、次回以降のご依頼へ反映できるようにします。",
  },
] as const;

export const LANDING_LEARNING_CARDS = [
  {
    id: "from-documents",
    icon: "📄",
    title: "資料から学ぶ",
    description: "過去の資料を参考に、文章や構成、仕事の流れを理解します。",
  },
  {
    id: "from-habits",
    icon: "🔁",
    title: "習慣を学ぶ",
    description: "毎日・毎週・毎月の仕事を覚え、繰り返し作業を減らします。",
  },
  {
    id: "from-corrections",
    icon: "✏️",
    title: "修正から学ぶ",
    description:
      "お客様が修正した内容を参考に、次回以降はよりご希望に近い内容をご用意します。",
  },
  {
    id: "from-results",
    icon: "📈",
    title: "結果から学ぶ",
    description: "仕事の結果を分析し、次回の改善へ活かします。",
  },
] as const;

export type LandingExampleStatus = "available" | "partial" | "upcoming";

export const LANDING_EXAMPLE_STATUS_LABEL: Record<LandingExampleStatus, string> = {
  available: "利用できます",
  partial: "一部対応",
  upcoming: "順次対応",
};

/**
 * 依頼例カードの実装ステータスは、現状のコード実装に基づく。
 * - available: 記載フローがそのまま利用可能
 * - partial: テキスト依頼等で一部のみ可能（ファイル入力・専用記録は未実装など）
 * - upcoming: 専用モジュール／入出力が未実装
 */
export const LANDING_REQUEST_EXAMPLES = [
  {
    id: "receipt",
    icon: "🧾",
    title: "レシートの写真",
    input: "レシートの写真",
    request: "今月の家計簿へ追加してください",
    result: "支出内容を読み取り、分類して記録します。",
    // 家計簿モジュール・OCR・写真入力なし（domains/user-memory の分類スタブのみ）
    status: "upcoming" as const satisfies LandingExampleStatus,
  },
  {
    id: "pdf-to-excel",
    icon: "📑",
    title: "PDF資料",
    input: "PDF・画像・各種資料",
    request: "内容をExcelへ分かりやすく整理してください",
    result: "必要な情報を抽出し、表形式にまとめます。",
    // DeliverableFormat に xlsx なし、PDF/画像入力パースなし、excel connector は coming_soon
    status: "upcoming" as const satisfies LandingExampleStatus,
  },
  {
    id: "past-posts",
    icon: "💬",
    title: "過去の投稿資料",
    input: "過去の投稿文や投稿画面",
    request: "この表現に合わせて、新しい投稿文を作成してください",
    result: "文章の特徴を参考にしながら、新しい内容をご用意します。",
    // SNS文案生成・Work Memory・ナレッジ再利用は可。画面キャプチャ解析・画像入力は未対応
    status: "partial" as const satisfies LandingExampleStatus,
  },
  {
    id: "video",
    icon: "🎬",
    title: "動画",
    input: "完成した動画",
    request: "投稿に必要な内容をまとめてください",
    result: "タイトル・説明文・投稿文などの準備をお手伝いします。",
    // テキスト依頼での文案生成は可。動画ファイル解析・アップロードは未実装
    status: "partial" as const satisfies LandingExampleStatus,
  },
  {
    id: "vehicle-log",
    icon: "🚗",
    title: "車両日報",
    input: "日報や走行距離が分かる写真",
    request: "この車両の記録へ追加してください",
    result: "走行距離や給油、点検に関する情報を継続して整理します。",
    // 車両記録モジュール・写真OCRなし（domains/user-memory の分類スタブのみ）
    status: "upcoming" as const satisfies LandingExampleStatus,
  },
  {
    id: "business-docs",
    icon: "📁",
    title: "業務資料",
    input: "過去の資料と今回必要な情報",
    request: "いつもの形式で資料を作成してください",
    result: "過去の仕事の進め方を参考に、今回の資料をご用意します。",
    // PDF/Word/PPT生成・Work Memory・ナレッジは可。過去資料ファイルの直接解析は未対応
    status: "partial" as const satisfies LandingExampleStatus,
  },
] as const;

export const LANDING_TRUST_ITEMS = [
  {
    id: "isolation",
    icon: "🔒",
    title: "お客様ごとに分離",
    // Work Memory / Memory は userId 単位で分離（lib/work-memory, テストで検証）
    description:
      "資料・仕事の記憶・文章の特徴は、他のお客様と混在しないように管理します。",
  },
  {
    id: "no-cross-use",
    icon: "🗂️",
    title: "資料を他のお客様へ利用しない",
    // ユーザー横断の学習・再利用パイプラインは未実装。記憶はユーザー単位で注入
    description:
      "ご提供いただいた資料や文章は、他のお客様向けの作成や学習には利用しません。",
  },
  {
    id: "memory-control",
    icon: "✏️",
    title: "記憶は管理できます",
    // /settings/work-memory で確認・編集・無効化・削除が実装済み
    description:
      "保存された仕事の記憶は、確認・編集・無効化・削除ができます。",
  },
  {
    id: "no-silent-actions",
    icon: "✋",
    title: "勝手に実行しない",
    // 既定は approve_then_run。full_auto も選択可能なため「絶対に確認なしでは動かない」とは言わない
    description:
      "送信・投稿・削除・公開などの重要な操作は、確認を基本とする設計です。自動実行は、依頼範囲からお客様が選んだ場合に限ります。",
  },
] as const;

export const LANDING_REASONS = [
  {
    id: "one-secretary",
    icon: "👤",
    title: "一人のAI秘書",
    description: "仕事が変わっても、同じMINERVOTが継続してサポートします。",
  },
  {
    id: "work-memory",
    icon: "🧠",
    title: "仕事を記憶",
    description: "会話ではなく、仕事の進め方や習慣を学習します。",
  },
  {
    id: "growth",
    icon: "📈",
    title: "成長するサポート",
    description: "結果を分析し、次回へ活かせる改善提案をご用意します。",
  },
  {
    id: "simple",
    icon: "📎",
    title: "シンプルな操作",
    description: "写真・資料・依頼内容を送るだけで、仕事を進められます。",
  },
  {
    id: "personal",
    icon: "✨",
    title: "あなた専用",
    description:
      "使うほど、お客様に合わせた仕事の進め方へ近づいていきます。",
  },
] as const;

export const LANDING_PAIN_SOLUTIONS = [
  {
    pain: "毎日のSNS投稿が負担になっている",
    solution: "MINERVOTが投稿文案を毎日自動で用意。承認後に投稿まで実行します。",
  },
  {
    pain: "資料・ブログ作成に何時間もかかる",
    solution: "AI秘書が下書きから完成まで担当。あなたは最終確認だけで済みます。",
  },
  {
    pain: "ルーティン業務を忘れてしまう",
    solution: "定期仕事を一度登録すれば、決まった時間に自動で動きます。",
  },
  {
    pain: "ツールを何個も行き来している",
    solution: "依頼・実行・保存・投稿をMINERVOTひとつに集約。切り替えは不要です。",
  },
] as const;

export const LANDING_AI_TEAM = [
  {
    id: "sns",
    icon: "📱",
    role: "SNS担当",
    description: "毎日の投稿文案を作成し、スケジュールに合わせて配信します。",
    examples: ["X投稿", "Instagram文案", "週次まとめ投稿"],
  },
  {
    id: "blog",
    icon: "📝",
    role: "ブログ担当",
    description: "記事の構成から下書きまで。SEOを意識した文章を自動生成します。",
    examples: ["週次レポート", "製品紹介記事", "WordPress投稿"],
  },
  {
    id: "sales",
    icon: "📊",
    role: "資料担当",
    description: "営業資料・提案書・プレゼンを短時間で作成します。",
    examples: ["提案資料", "PPT骨子", "顧客向けレポート"],
  },
  {
    id: "secretary",
    icon: "🗂️",
    role: "秘書",
    description: "メール返信・スケジュール整理・ファイル管理を代行します。",
    examples: ["メール返信", "議事録", "Drive整理"],
  },
] as const;

export const LANDING_AUDIENCE = [
  {
    id: "freelancer",
    icon: "💼",
    title: "個人事業主",
    description: "請求書・資料・投稿作成など",
    href: "/solutions/freelancer",
  },
  {
    id: "office-worker",
    icon: "🏢",
    title: "会社員",
    description: "資料整理・Excel・議事録",
    href: "/solutions/office-worker",
  },
  {
    id: "executive",
    icon: "🧭",
    title: "経営者",
    description: "日々の仕事管理・資料整理・分析",
    href: "/solutions/executive",
  },
  {
    id: "creator",
    icon: "✨",
    title: "クリエイター",
    description: "投稿準備・資料整理・分析",
    href: "/solutions/creator",
  },
  {
    id: "restaurant",
    icon: "🍽️",
    title: "飲食店",
    description: "売上整理・SNS・資料管理",
    href: "/solutions/restaurant",
  },
  {
    id: "construction-realestate",
    icon: "🏗️",
    title: "建設・不動産",
    description: "写真整理・契約資料・報告書",
    href: "/solutions/construction-realestate",
  },
  {
    id: "household",
    icon: "🏠",
    title: "ご家庭",
    description: "家計簿・書類整理・車両管理",
    href: "/solutions/household",
  },
  {
    id: "student",
    icon: "📚",
    title: "学生",
    description: "レポート・資料整理・学習サポート",
    href: "/solutions/student",
  },
] as const;

export const LANDING_RESULTS = [
  { value: "2.5時間", label: "1日あたりの業務時間を削減", sub: "※利用者平均（推定）" },
  { value: "30件+", label: "月間の自動化タスク", sub: "SNS・ブログ・資料など" },
  { value: "毎日", label: "決まった時間に仕事が進む", sub: "定期自動化で習慣化" },
] as const;

export function getLandingPlans() {
  return listPlanDefinitions();
}

export function formatLandingPrice(jpy: number): string {
  if (jpy === 0) return "無料";
  return `¥${jpy.toLocaleString("ja-JP")}`;
}
