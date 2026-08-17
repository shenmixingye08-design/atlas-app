/**
 * X automation copy quality — prompt rules, angle rotation, and
 * lightweight checks. Does not post, schedule, or change approval.
 */

export const X_AUTOMATION_POST_ANGLES = [
  "chore_relatable",
  "automation_benefit",
  "x_post_example",
  "time_saved",
  "secretary_usage",
  "solo_work_pain",
  "product_improvement",
  "actual_work",
  "handy_tip",
] as const;

export type XAutomationPostAngle = (typeof X_AUTOMATION_POST_ANGLES)[number];

export const X_AUTOMATION_POST_ANGLE_GUIDANCE: Record<
  XAutomationPostAngle,
  string
> = {
  chore_relatable:
    "面倒な仕事あるある。小さな手間への共感から入り、1つの具体作業だけ触れる。",
  automation_benefit:
    "自動化のメリット。毎回自分で始める負担が減る話に絞る。効果は断定しない。",
  x_post_example:
    "X投稿自動化の実例。「何を書こう」で止まる話など、投稿作業だけをテーマにする。",
  time_saved:
    "時間の話。取れがちな時間に触れるが、「必ず削減できる」とは書かない。",
  secretary_usage:
    "AI秘書の使い方。チャットではなく、具体的な仕事を渡す使い方を1つ紹介する。",
  solo_work_pain:
    "一人で仕事を回す人の悩み。専用ラベルは使わず、本人が自分ごとと思える言い方。",
  product_improvement:
    "MINERVOTの開発・改善。完成したら知らせる、少しずつ任せる、など確認できる範囲だけ。",
  actual_work:
    "実際に自動化している仕事内容。依頼テーマに沿った作業を1つだけ具体的に書く。",
  handy_tip:
    "便利な使い方紹介。全部を詰め込まず、始めやすい使い方を1つ。",
};

/** Confirmed MINERVOT facts only. Do not invent capabilities beyond this. */
export const X_AUTOMATION_POST_CONFIRMED_FACTS = [
  "MINERVOTはお客様専属のAI秘書",
  "依頼した仕事を進め、完成したらお知らせする",
  "触れられる具体作業の例: X投稿、定期作業、メール、予定管理、資料作成",
  "1投稿ではこのうち1テーマだけ扱う",
] as const;

export const X_POST_FORBIDDEN_CLAIM_PATTERNS: readonly RegExp[] = [
  /24時間対応/,
  /完全放置/,
  /何でもできる/,
  /必ず時間を削減/,
  /完全自律/,
  /100\s*%/,
  /必ず成功/,
  /副業者専用/,
  /個人事業主専用/,
];

export const X_POST_BROCHURE_PATTERNS: readonly RegExp[] = [
  /まずはご希望をお聞かせください/,
  /業務効率化を強力にサポート/,
  /24時間対応でカスタマイズ可能/,
  /カスタマイズ可能です/,
  /ぜひご?利用ください/,
  /様々な業務を効率化/,
  /お客様専属のAI秘書です[\s\S]{0,40}できます[\s\S]{0,40}利用してください/,
];

export function selectXAutomationPostAngle(
  seed: number,
): XAutomationPostAngle {
  const length = X_AUTOMATION_POST_ANGLES.length;
  const index = ((Math.trunc(seed) % length) + length) % length;
  return X_AUTOMATION_POST_ANGLES[index]!;
}

export function hashXPostSeedText(value: string): number {
  let hash = 0;
  for (let i = 0; i < value.length; i += 1) {
    hash = (hash * 31 + value.charCodeAt(i)) | 0;
  }
  return Math.abs(hash);
}

export function deriveXAutomationPostAngleSeed(input: {
  angleSeed?: number;
  runId?: string | null;
  recentTexts?: string[];
  topic?: string;
}): number {
  if (typeof input.angleSeed === "number" && Number.isFinite(input.angleSeed)) {
    return Math.trunc(input.angleSeed);
  }
  let seed = 0;
  if (input.runId?.trim()) {
    seed += hashXPostSeedText(input.runId.trim());
  } else {
    seed += Math.floor(Date.now() / 3_600_000);
  }
  seed += input.recentTexts?.length ?? 0;
  if (input.recentTexts?.[0]) {
    seed += hashXPostSeedText(input.recentTexts[0]);
  }
  if (input.topic?.trim()) {
    seed += hashXPostSeedText(input.topic.trim());
  }
  return seed;
}

export function findForbiddenXPostClaims(text: string): string[] {
  return X_POST_FORBIDDEN_CLAIM_PATTERNS.filter((pattern) =>
    pattern.test(text),
  ).map((pattern) => pattern.source);
}

export function isBrochureLikeXPost(text: string): boolean {
  return X_POST_BROCHURE_PATTERNS.some((pattern) => pattern.test(text));
}

export function buildXAutomationPostGenerationInstructions(): string {
  return `【最重要】出力はお客様への返答ではなく、X（旧Twitter）向けの投稿本文1件だけ。
秘書口調（かしこまりました / お待たせいたしました / ご確認をお願いいたします）は使わない。
企業パンフレットや定型営業文にしない。少し会話的で、読みやすく、短めに書く。

切り口:
- 同じAutomationでも実行ごとに切り口を変える。今回指定された切り口だけを使う。
- 1投稿1テーマ。機能を並べて紹介しない。
- 「MINERVOTは○○なAI秘書です。○○ができます。ぜひ利用してください。」という紹介文だけにしない。

口調:
- 日本語。60〜180文字程度を中心。不必要に長くしない。
- 改行は読みやすい範囲。本文中にハッシュタグを連打しない（後段で0〜2個だけ付ける。なしでもよい）。
- 毎回CTAを付けない。絵文字は毎回大量に使わない。過剰な敬語を避ける。宣伝臭を抑える。
- 固定テンプレート化しない。

避けたい定型:
- 「24時間対応でカスタマイズ可能です。」
- 「まずはご希望をお聞かせください。」
- 「業務効率化を強力にサポートします。」

虚偽・誇張禁止（根拠なく書かない）:
- 24時間対応 / 完全放置可能 / 何でもできる / 必ず時間を削減できる / 完全自律 / 100%成功
- 実装を確認できない機能・性能・数値・実績

事実の範囲:
- お客様の元依頼と、確認済みのMINERVOT情報だけを使う。
- 確認済み: 専属のAI秘書。依頼した仕事を進め、完成したらお知らせする。
- 具体例に使える作業: X投稿、定期作業、メール、予定管理、資料作成。ただし1投稿では1つ。
- 「副業者専用」「個人事業主専用」とは書かない。一人で仕事・副業・事業を回し、SNSや事務に時間を取られている人が「自分に便利かも」と思える内容にする。

Memory:
- 好みの文体・長さ・表現・過去の修正傾向があれば補助利用する。
- Memoryが無くても投稿本文は必ず完成させる。Memoryは必須ではない。

重複:
- 直近投稿とほぼ同じ文章・同じ言い回しの連発を避ける。
- 切り口と具体例を変えて、別の1テーマにする。

出力ルール:
- 本文のみ（前置き・説明・鉤括弧・コードブロックは書かない）。
- 全体で280文字以内（日本語1文字も1文字として数える）。`;
}

export function buildXAutomationPostGenerationInput(input: {
  automationName: string;
  topic: string;
  generateInstruction: string;
  angle: XAutomationPostAngle;
  memoryInjection?: string | null;
  recentTexts?: string[];
}): string {
  const recent =
    input.recentTexts && input.recentTexts.length > 0
      ? input.recentTexts
          .slice(0, 8)
          .map((text, index) => `${index + 1}. ${text.replace(/\s+/g, " ")}`)
          .join("\n")
      : "（まだありません。メモリや履歴がなくても本文は完成させる）";
  const memory = input.memoryInjection?.trim();
  return [
    `自動化名: ${input.automationName || "（なし）"}`,
    `テーマ: ${input.topic || "（指定なし）"}`,
    `今回の切り口: ${input.angle} — ${X_AUTOMATION_POST_ANGLE_GUIDANCE[input.angle]}`,
    `お客様の依頼:`,
    input.generateInstruction || "（なし）",
    "",
    "確認済み情報（これ以外の機能は足さない）:",
    ...X_AUTOMATION_POST_CONFIRMED_FACTS.map((fact) => `- ${fact}`),
    memory
      ? `\n文体・好み・長さ・表現・過去の修正傾向（補助。無い項目は無視）:\n${memory}`
      : "\n文体メモリ: なし（メモリなしでも投稿本文は必ず完成させる）",
    "",
    "直近の投稿（これらとほぼ同じ文章にしない）:",
    recent,
  ].join("\n");
}

/**
 * Deterministic mock/fallback copy. Used only when the LLM is mocked.
 * Production generation uses the prompt; this keeps tests and mock mode varied.
 */
export function buildXAutomationPostFallbackText(input: {
  angle: XAutomationPostAngle;
  topic?: string;
}): string {
  const topic = (input.topic || "MINERVOT").trim();
  const samples: Record<XAutomationPostAngle, string> = {
    chore_relatable: `毎日のX投稿、地味に「何を書こう」で時間が溶ける。
${topic}なら、テーマだけ決めておけば文章作成から投稿まで進められる。
小さい作業から任せていくのが、いちばん続きやすい。`,
    automation_benefit: `同じ作業を毎回ゼロから始めると、判断より準備で消耗する。
${topic}は依頼した定期作業を進めて、できたものをお知らせする。
自動化の利点は、気合ではなく先に仕組みを置けること。`,
    x_post_example: `X投稿の自動化は、難しい分析より「毎朝の一文」からが現実的。
テーマを決めておけば、${topic}が本文を用意して投稿まで担える。
まずはこの一本だけ任せる、で十分始まる。`,
    time_saved: `一人で回してると、投稿文やメールの下書きだけで午前が終わる日がある。
${topic}に文章作成を渡すと、自分は確認に回れる。
時間は「必ず減る」より、取られがちな作業から外していく感じ。`,
    secretary_usage: `${topic}は雑談相手というより、具体的な仕事を渡すAI秘書。
たとえば予定の整理や資料の下書きを依頼して、完成を待つ使い方。
チャットで相談し続けるより、作業を渡した方が早い。`,
    solo_work_pain: `一人だとSNSも事務も自分。全部を一気に手放す必要はない。
まず毎日のX投稿だけ${topic}に渡す、くらいで負担の形が変わる。
「自分に便利かも」と思えた作業からでいい。`,
    product_improvement: `${topic}は、使ってみて面倒だった作業から自動化していく前提。
完成したら知らせるので、最初から全部任せる必要はない。
開発側も、その「小さな一仕事」が続くかを見ている。`,
    actual_work: `いま任せているのは、定期のX投稿文づくり。
「${topic}について」とテーマを置いておけば、本文はこちらで用意できる。
メールや資料まで一度に詰め込まない方が、投稿としては読みやすい。`,
    handy_tip: `便利な使い方は、毎日のX投稿だけ先に任せることから。
${topic}にテーマを渡しておけば、あとは文章作成と投稿を進められる。
メールや予定管理は、必要になった作業から足せばいい。`,
  };
  return samples[input.angle];
}
