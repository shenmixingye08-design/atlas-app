import Link from "next/link";

import { Button } from "@/components/ui/button";
import { ui } from "@/lib/i18n";

type ComingSoonPageProps = {
  title: string;
  description?: string;
};

export function ComingSoonPage({
  title,
  description = "現在準備を進めております。今しばらくお待ちください。",
}: ComingSoonPageProps) {
  return (
    <div className="flex min-h-screen flex-col bg-[var(--background)] text-foreground">
      <header className="border-b border-[var(--border-subtle)] px-4 py-4 sm:px-8">
        <Link href="/" className="text-sm font-semibold tracking-tight text-foreground">
          {ui.brand}
        </Link>
      </header>
      <main className="mx-auto flex w-full max-w-lg flex-1 flex-col items-center justify-center px-4 py-20 text-center">
        <p className="text-xs font-medium tracking-wide text-[var(--foreground-subtle)]">
          準備中
        </p>
        <h1 className="mt-3 text-2xl font-semibold tracking-tight text-foreground sm:text-3xl">
          {title}
        </h1>
        <p className="mt-4 text-sm leading-relaxed text-[var(--foreground-muted)] sm:text-base">
          {description}
        </p>
        <div className="mt-10 flex flex-col gap-3 sm:flex-row">
          <Link href="/">
            <Button variant="primary" size="lg">
              ホームへ戻る
            </Button>
          </Link>
          <Link href="/sign-up">
            <Button variant="secondary" size="lg">
              無料で始める
            </Button>
          </Link>
        </div>
      </main>
    </div>
  );
}
