import type { Metadata } from "next";
import { Suspense } from "react";

import { FirstValueQuickStart } from "@/components/first-value/quick-start";
import { LoadingState } from "@/components/ui/loading-state";

export const metadata: Metadata = {
  title: "最初の仕事を任せる — MINERVOT",
  description: "3項目だけで初回の成果物まで完了します",
};

export default function QuickStartPage() {
  return (
    <main className="mx-auto w-full max-w-3xl px-4 py-8 sm:px-6">
      <Suspense fallback={<LoadingState />}>
        <FirstValueQuickStart />
      </Suspense>
    </main>
  );
}
