import { FIRST_OFFER_PATH, FIRST_REVENUE_CAMPAIGN_ID } from "./constants";
import { firstOfferCopy } from "./offer";

export type SprintPostKind =
  | "pain"
  | "howto"
  | "inside"
  | "compare"
  | "trial"
  | "faq"
  | "limits";

export type SprintPost = {
  day: number;
  kind: SprintPostKind;
  contentId: string;
  target: string;
  pain: string;
  hook: string;
  body: string;
  actualFeature: string;
  cta: string;
  landingURL: string;
  campaignId: string;
  utm: string;
  evidence: string;
  prohibitedClaimCheck: string;
  xShort: string;
  xLong: string;
  shorts15: string;
  shorts30: string;
  title: string;
  telop: string;
};

const KINDS: SprintPostKind[] = [
  "pain",
  "pain",
  "pain",
  "howto",
  "howto",
  "howto",
  "inside",
  "inside",
  "compare",
  "compare",
  "trial",
  "trial",
  "faq",
  "limits",
];

const HOOKS: Record<SprintPostKind, string[]> = {
  pain: [
    "投稿文を毎日ゼロから書いていませんか",
    "下書きのまま、投稿ボタンを押せずに終わっていませんか",
    "何を書くか思い出すだけで、夜が終わっていませんか",
  ],
  howto: [
    "登録後、用意した例で投稿案を1件作ります",
    "確認してから投稿します。先に自動投稿はしません",
    "X連携後に、確認した文面だけ任せられます",
  ],
  inside: [
    "未確認の利用者数は、宣伝に使いません",
    "Ownerが承認するまで、このLPは検索に出しません",
  ],
  compare: [
    "従来：考える→書く→迷う。MINERVOT：例を出す→確認する",
    "完成スライド自動生成は売りません。今回は投稿文だけです",
  ],
  trial: [
    "無料診断ではなく、この1機能だけを先に試せます",
    "個人名やメールは診断では聞きません。登録はClerkです",
  ],
  faq: ["無料の1回で投稿文を作れます。自動投稿は連携後です"],
  limits: ["フォロワー増加は約束しません。書ける範囲は実装済みの投稿案です"],
};

function utmFor(contentId: string): string {
  const params = new URLSearchParams({
    utm_source: "x",
    utm_medium: "social",
    utm_campaign: FIRST_REVENUE_CAMPAIGN_ID,
    utm_content: contentId,
    campaignId: FIRST_REVENUE_CAMPAIGN_ID,
    contentId,
  });
  return `${FIRST_OFFER_PATH}?${params.toString()}`;
}

export function buildSprintPosts(): SprintPost[] {
  const copy = firstOfferCopy();
  const cta = "無料で投稿案を1件作る";
  const evidence = "実装済み：FreeでX投稿文の作成。自動投稿はX連携後。未確認の人数は使わない。";
  const prohibited = "フォロワー保証・架空レビュー・偽の期限・未実装のPPT/カレンダーなし。";
  return KINDS.map((kind, index) => {
    const day = index + 1;
    const variants = HOOKS[kind];
    const hook = variants[(day - 1) % variants.length];
    const contentId = `fr_day_${String(day).padStart(2, "0")}_${kind}`;
    const landingURL = utmFor(contentId);
    return {
      day,
      kind,
      contentId,
      target: copy.audience,
      pain: copy.pain,
      hook,
      body: `${hook}\n${copy.availableNow[0]}\n${cta}`,
      actualFeature: copy.availableNow[0],
      cta,
      landingURL,
      campaignId: FIRST_REVENUE_CAMPAIGN_ID,
      utm: landingURL,
      evidence,
      prohibitedClaimCheck: prohibited,
      xShort: `${hook}\n${cta}`,
      xLong: `${hook}\n\n${copy.availableNow[0]}\nできないこと：${copy.unavailable.join(" / ")}\n\n${cta}\n${landingURL}`,
      shorts15: `${hook} 2分で投稿案1件。`,
      shorts30: `${hook} 登録後に例から1件作ります。未確認の実績は言いません。`,
      title: hook,
      telop: hook.slice(0, 18),
    };
  });
}

export function uniqueSprintContentIds(posts: SprintPost[]): boolean {
  const ids = posts.map((post) => post.contentId);
  return new Set(ids).size === ids.length;
}
