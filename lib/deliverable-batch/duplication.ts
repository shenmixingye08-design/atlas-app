import type { DeliverableBatchItem } from "./types";

function normalize(text: string): string {
  return text
    .normalize("NFKC")
    .toLowerCase()
    .replace(/[\s\u3000、。,.!！?？]/g, "");
}

function leading(text: string, n = 40): string {
  return normalize(text).slice(0, n);
}

function hashtagSet(text: string): string {
  return [...text.matchAll(/#[^\s#]+/g)]
    .map((match) => match[0].toLowerCase())
    .sort()
    .join(" ");
}

function ctaKey(text: string): string {
  const match = text.match(/(詳しくは|お問い合わせ|今すぐ|フォロー|リンクから)[^\n]{0,20}/);
  return match ? normalize(match[0]) : "";
}

export type DuplicateHit = {
  itemId: string;
  otherItemId: string;
  reason:
    | "exact"
    | "normalized"
    | "title"
    | "leading"
    | "similar_body"
    | "cta"
    | "hashtags";
};

export function findDuplicateItems(
  items: Array<Pick<DeliverableBatchItem, "id" | "title" | "sourceContent" | "status">>,
): DuplicateHit[] {
  const ready = items.filter(
    (item) =>
      (item.status === "ready" || item.status === "approved") &&
      (item.sourceContent ?? "").trim(),
  );
  const hits: DuplicateHit[] = [];
  for (let i = 0; i < ready.length; i += 1) {
    for (let j = i + 1; j < ready.length; j += 1) {
      const a = ready[i]!;
      const b = ready[j]!;
      const aText = a.sourceContent ?? "";
      const bText = b.sourceContent ?? "";
      if (aText === bText) {
        hits.push({ itemId: b.id, otherItemId: a.id, reason: "exact" });
        continue;
      }
      if (normalize(aText) === normalize(bText)) {
        hits.push({ itemId: b.id, otherItemId: a.id, reason: "normalized" });
        continue;
      }
      if (normalize(a.title) && normalize(a.title) === normalize(b.title)) {
        hits.push({ itemId: b.id, otherItemId: a.id, reason: "title" });
      }
      if (leading(aText) && leading(aText) === leading(bText)) {
        hits.push({ itemId: b.id, otherItemId: a.id, reason: "leading" });
      }
      const aNorm = normalize(aText);
      const bNorm = normalize(bText);
      if (aNorm.length > 80 && bNorm.length > 80) {
        const shared = [...aNorm].filter((ch, idx) => bNorm[idx] === ch).length;
        if (shared / Math.max(aNorm.length, bNorm.length) > 0.86) {
          hits.push({ itemId: b.id, otherItemId: a.id, reason: "similar_body" });
        }
      }
      const aCta = ctaKey(aText);
      const bCta = ctaKey(bText);
      if (aCta && aCta === bCta) {
        hits.push({ itemId: b.id, otherItemId: a.id, reason: "cta" });
      }
      const aTags = hashtagSet(aText);
      const bTags = hashtagSet(bText);
      if (aTags && aTags === bTags && aTags.split(" ").length >= 3) {
        hits.push({ itemId: b.id, otherItemId: a.id, reason: "hashtags" });
      }
    }
  }
  return hits;
}
