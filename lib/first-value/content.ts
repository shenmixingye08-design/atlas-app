import type { FirstValueCandidate } from "./candidates";

/** Deterministic deliverable body — guarantees first-value completion without LLM. */
export function buildFirstValueDeliverableBody(input: {
  candidate: FirstValueCandidate;
  title: string;
  content: string;
}): string {
  const title = input.title.trim() || input.candidate.defaultTitle;
  const body = input.content.trim() || input.candidate.defaultContentHint;
  const now = new Date().toISOString().slice(0, 10);

  return [
    `# ${title}`,
    "",
    `作成日: ${now}`,
    `種別: ${input.candidate.label}`,
    "",
    "## ご依頼内容",
    "",
    body,
    "",
    "## MINERVOTがご用意した内容",
    "",
    "かしこまりました。以下のとおり、初回の成果物として整理いたしました。",
    "",
    "### 要点",
    "",
    `- タイトル: ${title}`,
    `- 仕事の種類: ${input.candidate.label}`,
    `- ご依頼の要旨: ${body.slice(0, 280)}`,
    "",
    "### 次のアクション",
    "",
    "1. 内容をご確認ください",
    "2. 必要なら修正点をお知らせください",
    "3. ダウンロードしてご利用ください",
    "",
    "— MINERVOT（あなた専属のAI秘書）",
  ].join("\n");
}
