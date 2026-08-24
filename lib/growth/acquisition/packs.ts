import { randomUUID } from "node:crypto";

import { marketingFacts } from "./evidence";
import { ACQUISITION_CAMPAIGN_ID, DIAGNOSIS_PATH } from "./constants";
import type { AcquisitionChannel } from "./constants";
import type { DiagnosisArchetype, PackItemStatus } from "./types";

export type MediaPackItem = {
  contentId: string;
  channel: AcquisitionChannel;
  title: string;
  body: string;
  cta: string;
  utmUrl: string;
  script15?: string;
  script30?: string;
  hook3s?: string;
  telops?: string[];
  cuts?: string[];
  narration?: string;
  description?: string;
  hashtags?: string[];
  youtubeTitles?: string[];
  pinnedComment?: string;
  chapters?: string[];
  thumb?: string;
  blogOutline?: string[];
  screenHref: string;
  autoPublish: boolean;
  canQueueToRevenueAgent: boolean;
  requiresPostUrl: boolean;
  status: PackItemStatus;
};

export type MediaPack = {
  packId: string;
  parentCampaignId: string;
  axis: DiagnosisArchetype | "general";
  items: MediaPackItem[];
};

const AXIS_HOOK: Record<DiagnosisArchetype | "general", string> = {
  broadcast: "毎日のX投稿文を、毎回ゼロから考えていませんか。",
  documents: "資料の見出しを、毎回白紙から書いていませんか。",
  schedule: "今日やることが並ばず、着手が後ろにずれていませんか。",
  admin: "同じ事務を、毎週同じ手順でやり直していませんか。",
  mixed: "繰り返し作業がいくつか残っていませんか。最初の1件だけ減らせます。",
  general: "繰り返している仕事から、最初の1件だけ減らします。",
};

function utm(contentId: string, source: string, medium: string): string {
  const params = new URLSearchParams({
    utm_source: source,
    utm_medium: medium,
    utm_campaign: ACQUISITION_CAMPAIGN_ID,
    utm_content: contentId,
    campaignId: ACQUISITION_CAMPAIGN_ID,
    contentId,
  });
  return `${DIAGNOSIS_PATH}?${params.toString()}`;
}

function factLine(): string {
  const approved = marketingFacts();
  if (approved[0]) return approved[0].fact;
  return "利用できる機能は、実装済みの範囲に限ります（未確認の実績は使いません）。";
}

function baseItem(
  input: Pick<
    MediaPackItem,
    "contentId" | "channel" | "title" | "body" | "cta" | "utmUrl" | "screenHref"
  > &
    Partial<MediaPackItem>,
): MediaPackItem {
  return {
    autoPublish: false,
    canQueueToRevenueAgent: input.channel === "x",
    requiresPostUrl: true,
    status: "draft",
    ...input,
  };
}

export function buildMediaPack(axis: DiagnosisArchetype | "general" = "general"): MediaPack {
  const hook = AXIS_HOOK[axis];
  const cta = "無料の自動化診断を見る";
  const fact = factLine();
  const packId = `pack_${randomUUID().slice(0, 8)}`;
  const xShortId = `ac_${packId}_x_short`;
  const xLongId = `ac_${packId}_x_long`;
  const xThreadId = `ac_${packId}_x_thread`;
  const tiktokId = `ac_${packId}_tiktok`;
  const shortsId = `ac_${packId}_shorts`;
  const ytId = `ac_${packId}_yt`;
  const blogId = `ac_${packId}_blog`;

  return {
    packId,
    parentCampaignId: ACQUISITION_CAMPAIGN_ID,
    axis,
    items: [
      baseItem({
        contentId: xShortId,
        channel: "x",
        title: "X短文",
        body: `${hook}\n${fact}\n${cta}`,
        cta,
        utmUrl: utm(xShortId, "x", "social"),
        screenHref: "/workspace/x",
      }),
      baseItem({
        contentId: xLongId,
        channel: "x",
        title: "X長文",
        body: `${hook}\n\nMINERVOTは、実装済みの仕事だけを案内します。\n${fact}\n\n診断はログイン不要です。個人名やメールは聞きません。\n${cta}`,
        cta,
        utmUrl: utm(xLongId, "x", "social"),
        screenHref: "/workspace/x",
      }),
      baseItem({
        contentId: xThreadId,
        channel: "x",
        title: "Xスレッド",
        body: [
          `1/ ${hook}`,
          "2/ 毎回ゼロから考えると、同じ判断が残ります。",
          `3/ ${fact}`,
          "4/ 無料診断は5問、結果は実在機能だけです。",
          `5/ ${cta}`,
        ].join("\n\n"),
        cta,
        utmUrl: utm(xThreadId, "x", "social"),
        screenHref: "/workspace/x",
      }),
      baseItem({
        contentId: tiktokId,
        channel: "tiktok",
        title: "TikTok 15秒 / 30秒台本",
        body: hook,
        cta,
        utmUrl: utm(tiktokId, "tiktok", "video"),
        script15: `${hook} 診断は2分。実在機能だけ出します。`,
        script30: `${hook} 5問に答えると、最初の1仕事が決まります。未確認の実績は使いません。`,
        hook3s: hook.slice(0, 24),
        telops: [hook.slice(0, 16), "実在機能だけ", cta],
        cuts: ["0秒:悩み", "5秒:診断", "12秒:CTA"],
        narration: hook,
        description: fact,
        hashtags: ["#MINERVOT", "#副業"],
        screenHref: DIAGNOSIS_PATH,
      }),
      baseItem({
        contentId: shortsId,
        channel: "youtube_shorts",
        title: "YouTube Shorts 台本",
        body: `${hook}\n画面：診断5問→実在機能→登録`,
        cta,
        utmUrl: utm(shortsId, "youtube_shorts", "video"),
        script15: `${hook} 無料診断はログイン不要です。`,
        script30: `${hook} 結果は実装済みの機能だけです。架空の人数は使いません。`,
        hook3s: hook.slice(0, 20),
        telops: ["繰り返す仕事", "最初の1件", cta],
        cuts: ["0秒:フック", "4秒:診断", "12秒:CTA"],
        narration: hook,
        description: fact,
        hashtags: ["#MINERVOT", "#Shorts"],
        screenHref: DIAGNOSIS_PATH,
      }),
      baseItem({
        contentId: ytId,
        channel: "youtube",
        title: "YouTube説明欄",
        body: fact,
        cta,
        utmUrl: utm(ytId, "youtube", "video"),
        youtubeTitles: [hook, "繰り返し作業を1件減らす", "無料診断の使い方"],
        pinnedComment: `${cta} ${utm(ytId, "youtube", "video")}`,
        chapters: ["0:00 悩み", "0:20 手順", "0:40 診断"],
        thumb: hook.slice(0, 18),
        description: `${fact}\n${cta}`,
        screenHref: DIAGNOSIS_PATH,
      }),
      baseItem({
        contentId: blogId,
        channel: "seo",
        title: "ブログ下書き",
        body: `${hook}\n\n${fact}`,
        cta,
        utmUrl: utm(blogId, "seo", "content"),
        blogOutline: ["対象者", "従来の手順", "MINERVOTでの手順", "できないこと", "料金"],
        screenHref: "/use-cases/x-posts",
      }),
    ],
  };
}

export function uniqueContentIds(pack: MediaPack): boolean {
  const ids = pack.items.map((item) => item.contentId);
  return new Set(ids).size === ids.length;
}

export function markManualPublished(input: {
  postUrl: string;
  status?: PackItemStatus;
  autoPublish?: boolean;
  mediaLinked?: boolean;
}): { ok: boolean; reason?: string } {
  if (input.status === "rejected") {
    return { ok: false, reason: "rejected" };
  }
  if (input.autoPublish && !input.mediaLinked) {
    return { ok: false, reason: "unlinked" };
  }
  if (!/^https?:\/\//.test(input.postUrl.trim())) {
    return { ok: false, reason: "missing_url" };
  }
  return { ok: true };
}

export function packDownloadText(item: MediaPackItem): string {
  return [
    `title: ${item.title}`,
    `channel: ${item.channel}`,
    `contentId: ${item.contentId}`,
    `cta: ${item.cta}`,
    `utm: ${item.utmUrl}`,
    `screen: ${item.screenHref}`,
    "",
    item.body,
    item.script15 ? `\n15s: ${item.script15}` : "",
    item.script30 ? `\n30s: ${item.script30}` : "",
    item.hook3s ? `\nhook: ${item.hook3s}` : "",
    item.telops?.length ? `\ntelops: ${item.telops.join(" / ")}` : "",
    item.cuts?.length ? `\ncuts: ${item.cuts.join(" / ")}` : "",
    item.narration ? `\nnarration: ${item.narration}` : "",
    item.description ? `\ndescription: ${item.description}` : "",
  ]
    .filter(Boolean)
    .join("\n");
}
