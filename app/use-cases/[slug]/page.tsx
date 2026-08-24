import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";

import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { ensureAcquisitionHydrated } from "@/lib/growth/acquisition/durable";
import {
  getUseCasePage,
  listUseCasePages,
  publicUseCaseCampaignId,
  publicUseCasePriceLine,
} from "@/lib/growth/acquisition/usecases";
import { DIAGNOSIS_PATH } from "@/lib/growth/acquisition/constants";
import { getSiteOrigin } from "@/lib/seo/site";

type PageProps = { params: Promise<{ slug: string }> };

export function generateStaticParams() {
  return listUseCasePages().map((page) => ({ slug: page.slug }));
}

export async function generateMetadata({ params }: PageProps): Promise<Metadata> {
  await ensureAcquisitionHydrated();
  const { slug } = await params;
  const page = getUseCasePage(slug);
  if (!page) return { title: "ユースケース" };
  const origin = getSiteOrigin();
  const url = `${origin}/use-cases/${page.slug}`;
  const index = page.status === "approved";
  return {
    title: page.title,
    description: page.description,
    alternates: { canonical: url },
    robots: { index, follow: index },
    openGraph: { title: page.title, description: page.description, url },
  };
}

export default async function UseCasePage({ params }: PageProps) {
  await ensureAcquisitionHydrated();
  const { slug } = await params;
  const page = getUseCasePage(slug);
  if (!page) notFound();
  const origin = getSiteOrigin();
  const signup = `/sign-up?campaignId=${publicUseCaseCampaignId()}&contentId=${page.contentId}&utm_source=seo&utm_medium=content&utm_campaign=${publicUseCaseCampaignId()}&utm_content=${page.contentId}`;
  const diagnosis = `${DIAGNOSIS_PATH}?campaignId=${publicUseCaseCampaignId()}&contentId=${page.contentId}&utm_source=seo&utm_medium=content`;
  const jsonLd = {
    "@context": "https://schema.org",
    "@type": "FAQPage",
    mainEntity: page.faq.map((item) => ({
      "@type": "Question",
      name: item.q,
      acceptedAnswer: { "@type": "Answer", text: item.a },
    })),
  };

  return (
    <main className="mx-auto max-w-3xl px-4 py-10 space-y-6">
      {page.status !== "approved" ? (
        <p className="text-xs text-[var(--text-muted)]">未公開（noindex）。Owner承認後に検索へ出します。</p>
      ) : null}
      <h1 className="text-3xl font-semibold">{page.title}</h1>
      <p className="text-sm text-[var(--text-secondary)]">{page.description}</p>
      <Card className="space-y-3 p-5 text-sm">
        <p>対象者: {page.audience}</p>
        <p>具体的な悩み: {page.pain}</p>
        <p>従来の手順: {page.oldSteps.join(" → ")}</p>
        <p>MINERVOTでの手順: {page.newSteps.join(" → ")}</p>
        <p>利用できる実在機能: {page.available.join(" / ")}</p>
        <p>利用できないこと: {page.unavailable.join(" / ")}</p>
        <p>料金: {publicUseCasePriceLine()}</p>
        <p>無料範囲: Free は既存プラン定義の上限まで。価格は変更していません。</p>
        <p>
          実在画面:{" "}
          <Link className="underline" href={page.firstJob === "sns" ? "/workspace/x" : "/projects"}>
            登録後の作業画面
          </Link>
        </p>
      </Card>
      <section>
        <h2 className="text-lg font-semibold">FAQ</h2>
        {page.faq.map((item) => (
          <div key={item.q} className="mt-3 text-sm">
            <h3 className="font-medium">{item.q}</h3>
            <p>{item.a}</p>
          </div>
        ))}
      </section>
      <div className="flex flex-wrap gap-2">
        <Link href={diagnosis}>
          <Button>無料診断</Button>
        </Link>
        <Link href={signup}>
          <Button variant="secondary">無料登録</Button>
        </Link>
      </div>
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }}
      />
      <p className="text-xs text-[var(--text-muted)]">
        campaign {publicUseCaseCampaignId()} · content {page.contentId} · {origin}
      </p>
    </main>
  );
}
