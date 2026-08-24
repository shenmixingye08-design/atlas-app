import type { Metadata } from "next";
import Link from "next/link";

import { FirstOfferActions } from "@/components/growth/first-offer-actions";
import { Card } from "@/components/ui/card";
import { ensureFirstRevenueHydrated } from "@/lib/growth/first-revenue/durable";
import { firstOfferCopy } from "@/lib/growth/first-revenue/offer";
import { getOfferLpStatus } from "@/lib/growth/first-revenue/store";
import { getSiteOrigin } from "@/lib/seo/site";

export async function generateMetadata(): Promise<Metadata> {
  await ensureFirstRevenueHydrated();
  const copy = firstOfferCopy();
  const origin = getSiteOrigin();
  const url = `${origin}${copy.path}`;
  const index = getOfferLpStatus() === "approved";
  return {
    title: copy.headline,
    description: copy.pain,
    alternates: { canonical: url },
    robots: { index, follow: index },
    openGraph: { title: copy.headline, description: copy.pain, url },
  };
}

export default async function FirstOfferPage() {
  await ensureFirstRevenueHydrated();
  const copy = firstOfferCopy();
  const approved = getOfferLpStatus() === "approved";
  const jsonLd = {
    "@context": "https://schema.org",
    "@type": "FAQPage",
    mainEntity: copy.faq.map((item) => ({
      "@type": "Question",
      name: item.q,
      acceptedAnswer: { "@type": "Answer", text: item.a },
    })),
  };

  return (
    <main className="mx-auto max-w-3xl px-4 py-10 space-y-6">
      {approved ? null : (
        <p className="text-xs text-[var(--text-muted)]">未公開（noindex）。Owner承認後に検索へ出します。</p>
      )}
      <h1 className="text-3xl font-semibold">{copy.headline}</h1>
      <p className="text-sm text-[var(--text-secondary)]">
        {copy.audience}向け。売っているのは「{copy.product}」だけです。
      </p>
      <Card className="space-y-3 p-5 text-sm">
        <h2 className="text-lg font-semibold">具体的な悩み</h2>
        <p>{copy.pain}</p>
        <h2 className="text-lg font-semibold">MINERVOTで減らせる作業</h2>
        <p>毎日の投稿文をゼロから考える作業です。投稿の代行やフォロワー増加ではありません。</p>
        <h2 className="text-lg font-semibold">実際の操作（3ステップ）</h2>
        <ol className="list-decimal pl-5">
          {copy.newSteps.map((step) => (
            <li key={step}>{step}</li>
          ))}
        </ol>
        <h2 className="text-lg font-semibold">本番で利用できる実在機能</h2>
        <ul className="list-disc pl-5">
          {copy.availableNow.map((line) => (
            <li key={line}>{line}</li>
          ))}
        </ul>
        <p>
          実在画面:{" "}
          <Link className="underline" href={copy.screenHref}>
            登録後の X 作業画面
          </Link>
        </p>
        <h2 className="text-lg font-semibold">無料で試せる範囲</h2>
        <p>{copy.freeScope}</p>
        <h2 className="text-lg font-semibold">おすすめの有料プラン</h2>
        <p>{copy.paidScope}</p>
        <p>
          他プランの確認は{" "}
          <Link className="underline" href={copy.otherPlansHref}>
            料金表
          </Link>
          です。価格は既存プラン定義のままです。
        </p>
        <h2 className="text-lg font-semibold">利用できないこと</h2>
        <ul className="list-disc pl-5">
          {copy.unavailable.map((line) => (
            <li key={line}>{line}</li>
          ))}
        </ul>
      </Card>
      <section>
        <h2 className="text-lg font-semibold">FAQ</h2>
        {copy.faq.map((item) => (
          <div key={item.q} className="mt-3 text-sm">
            <h3 className="font-medium">{item.q}</h3>
            <p>{item.a}</p>
          </div>
        ))}
      </section>
      <FirstOfferActions />
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }}
      />
      <p className="text-xs text-[var(--text-muted)]">
        campaign {copy.campaignId} · content {copy.contentId}
      </p>
    </main>
  );
}
