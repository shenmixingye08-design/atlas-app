import type { Metadata } from "next";

import { DiagnosisForm } from "@/components/growth/diagnosis-form";
import { Card } from "@/components/ui/card";
import { getSiteOrigin } from "@/lib/seo/site";

const TITLE = "無料の自動化診断 | MINERVOT";
const DESCRIPTION =
  "副業・個人事業の繰り返し作業のうち、MINERVOTで減らせる実在機能を2分で確認します。個人情報は聞きません。";

export const metadata: Metadata = {
  title: TITLE,
  description: DESCRIPTION,
  alternates: { canonical: `${getSiteOrigin()}/tools/automation-diagnosis` },
  openGraph: {
    title: TITLE,
    description: DESCRIPTION,
    url: `${getSiteOrigin()}/tools/automation-diagnosis`,
  },
};

export default function AutomationDiagnosisPage() {
  return (
    <main className="mx-auto max-w-2xl px-4 py-10">
      <Card className="space-y-4 p-6">
        <h1 className="text-2xl font-semibold">無料の自動化診断</h1>
        <p className="text-sm text-[var(--text-secondary)]">
          5問です。実装済みの機能だけを結果に出します。未確認の実績や架空の人数は使いません。
        </p>
        <DiagnosisForm />
      </Card>
    </main>
  );
}
