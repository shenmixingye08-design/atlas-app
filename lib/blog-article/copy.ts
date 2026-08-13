/** Japanese blog copy helpers. No clickbait, no invented facts. */

const CLICKBAIT =
  /【保存版】|必見|衝撃|ヤバい| secretly|今すぐ登録しないと|損します/;

const UNSOURCED_CLAIM =
  /(?:調査によると|統計では|専門家は|世界の\d+%|市場規模は)\s*[^。]{0,40}/;

const NUMBER_CLAIM =
  /(?:前年比|市場規模|市場|利用率|導入率|導入社数)\s*[0-9０-９,.]+(?:%|％|社|人|件|億円|万円)?/g;

export function sanitizeBlogTitle(title: string): string {
  const cleaned = title
    .replace(CLICKBAIT, "")
    .replace(/\s{2,}/g, " ")
    .replace(/^#+\s*/, "")
    .trim();
  return cleaned.slice(0, 42) || "記事";
}

export function titleLooksStuffed(title: string): boolean {
  const tokens = title.split(/[\s・、,]+/).filter((token) => token.length >= 2);
  const freq = new Map<string, number>();
  for (const token of tokens) {
    freq.set(token, (freq.get(token) ?? 0) + 1);
    if ((freq.get(token) ?? 0) >= 3) return true;
  }
  return false;
}

export function excerptFrom(text: string, max = 120): string {
  const plain = text
    .replace(/^#+\s+/gm, "")
    .replace(/[*_`>#-]/g, "")
    .replace(/\s+/g, " ")
    .trim();
  if (plain.length <= max) return plain;
  const cut = plain.slice(0, max - 1).replace(/[、,\s]\S*$/, "");
  return `${cut}…`;
}

export function slugFromTitle(title: string): string {
  const ascii = title
    .toLowerCase()
    .replace(/https?:\/\/\S+/g, "")
    .replace(/[^\p{Letter}\p{Number}]+/gu, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 60);
  if (/[a-z0-9]/.test(ascii) && ascii.replace(/-/g, "").length >= 4) {
    return ascii;
  }
  let hash = 0;
  for (let i = 0; i < title.length; i += 1) {
    hash = (hash * 33 + title.charCodeAt(i)) >>> 0;
  }
  return `article-${hash.toString(16).slice(0, 8)}`;
}

export function collectFactNotes(body: string, assignment: string): string[] {
  const notes: string[] = [];
  const hay = `${assignment}\n${body}`;
  if (UNSOURCED_CLAIM.test(body)) {
    notes.push("出典が確認できない一般論は断定していません。");
  }
  const numbers = body.match(NUMBER_CLAIM) ?? [];
  for (const claim of numbers.slice(0, 3)) {
    if (!assignment.includes(claim.replace(/\s+/g, ""))) {
      notes.push(`数値「${claim.trim()}」は入力に無いため要確認です。`);
    }
  }
  if (/（要確認）/.test(body)) {
    notes.push("本文の数値は入力で確認できないため、要確認としています。");
  }
  if (/最新価格|法律|省令|判決/.test(hay) && !/要確認|確認が必要/.test(body)) {
    notes.push("価格・法令は変動するため、公開前に一次情報を確認してください。");
  }
  return [...new Set(notes)].slice(0, 4);
}

export function softenUnsourcedClaims(body: string, assignment: string): string {
  if (/要確認/.test(body)) return body;
  const numbers = body.match(/[0-9０-９]{2,}(?:%|％|万人|億円)/g) ?? [];
  let next = body;
  for (const value of numbers) {
    if (!assignment.includes(value)) {
      next = next.replace(value, `${value}（要確認）`);
    }
  }
  return next;
}

export function defaultCtaForIntent(
  intent: string,
  memoryCta: string | null,
): string | null {
  if (memoryCta?.trim()) return memoryCta.trim();
  if (intent === "product" || intent === "problem_solution") {
    return "詳しい進め方は、関連する案内ページもあわせてご確認ください。";
  }
  return null;
}

export { CLICKBAIT };
