import type { Metadata } from "next";
import { Suspense } from "react";

import { FirstValueJobComplete } from "@/components/first-value/job-complete";
import { LoadingState } from "@/components/ui/loading-state";

export const metadata: Metadata = {
  title: "仕事完了 — MINERVOT",
  description: "初回の仕事完了ステップ",
};

export default function FirstValueCompletePage() {
  return (
    <main className="mx-auto w-full max-w-3xl px-4 py-8 sm:px-6">
      <Suspense fallback={<LoadingState />}>
        <FirstValueJobComplete />
      </Suspense>
    </main>
  );
}
