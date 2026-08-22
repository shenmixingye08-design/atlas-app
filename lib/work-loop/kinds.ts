/**
 * Honest automatable kinds. Catalog "exists" ≠ we may propose Automation.
 */

export type AutomatableKind =
  | "x_post"
  | "gmail_draft"
  | "calendar_create"
  | "wordpress_draft"
  | "word"
  | "excel"
  | "pdf"
  | "pptx";

export type WorkKind = AutomatableKind | "unsupported";

const DATE_NOISE =
  /今日の|きょうの|本日の|今週の|来週の|今月の|来月の|\d{4}年|\d{1,2}月\d{1,2}日|\d{1,2}月|\d{1,2}日/g;

export function stripVolatileTokens(text: string): string {
  return text
    .replace(DATE_NOISE, " ")
    .replace(/\s+/g, " ")
    .trim();
}

export function classifyWorkKind(input: {
  assignment: string;
  title?: string;
  deliverableType?: string | null;
  services?: readonly string[];
}): WorkKind {
  const hay = `${input.title ?? ""} ${input.assignment} ${input.deliverableType ?? ""} ${(input.services ?? []).join(" ")}`;

  if (/google drive|ドライブから|driveの|driveを確認/i.test(hay)) {
    return "unsupported";
  }
  if (/予定をまとめ|週次まとめ|カレンダーの予定を読/i.test(hay) && !/予定を(作|追加|登録)/.test(hay)) {
    return "unsupported";
  }
  if (/dropbox.*(整理|ダウンロード)|整理して.*dropbox/i.test(hay)) {
    return "unsupported";
  }

  if (/(?:^|[^\w])x(?:へ|に|で|を)|twitter|ツイート|エックス投稿|sns投稿/i.test(hay)) {
    return "x_post";
  }
  if (/gmail|メール下書き|メールを用意|定型メール/i.test(hay)) {
    return "gmail_draft";
  }
  if (/カレンダーに(追加|登録)|予定を(作|追加|登録)|calendar.*(create|追加)/i.test(hay)) {
    return "calendar_create";
  }
  if (/wordpress|ワードプレス|ブログ記事/i.test(hay)) {
    return "wordpress_draft";
  }
  if (/pptx|スライド|powerpoint|ppt/i.test(hay) || input.deliverableType === "pptx") {
    return "pptx";
  }
  if (/xlsx|excel|家計簿|表計算/i.test(hay) || input.deliverableType === "xlsx") {
    return "excel";
  }
  if (/\bpdf\b/i.test(hay) || input.deliverableType === "pdf") {
    return "pdf";
  }
  if (/docx|word|報告書|週報|営業報告/i.test(hay) || input.deliverableType === "docx") {
    return "word";
  }
  return "unsupported";
}

export function isAutomatableKind(kind: WorkKind): kind is AutomatableKind {
  return kind !== "unsupported";
}

export function kindNeedsGoogle(kind: WorkKind): boolean {
  return kind === "gmail_draft" || kind === "calendar_create";
}

export function kindNeedsX(kind: WorkKind): boolean {
  return kind === "x_post";
}

export function kindNeedsBlog(kind: WorkKind): boolean {
  return kind === "wordpress_draft";
}

export function kindHasExternalSideEffect(kind: WorkKind): boolean {
  return (
    kind === "x_post" ||
    kind === "gmail_draft" ||
    kind === "calendar_create" ||
    kind === "wordpress_draft"
  );
}

export function workFingerprint(input: {
  kind: WorkKind;
  assignment: string;
  deliverableFormat?: string | null;
}): string {
  const assignment = stripVolatileTokens(input.assignment)
    .toLowerCase()
    .replace(/[^\p{L}\p{N}\s]/gu, " ")
    .replace(/\s+/g, " ")
    .trim();
  const tokens = assignment
    .split(" ")
    .filter((token) => token.length >= 2)
    .slice(0, 8);
  return [input.kind, input.deliverableFormat ?? "", tokens.join("|")].join("::");
}
