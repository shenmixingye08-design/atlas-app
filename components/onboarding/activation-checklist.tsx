"use client";

import Link from "next/link";
import { useEffect, useState } from "react";

import {
  fetchActivationView,
  patchActivationProgress,
  type ActivationViewResponse,
} from "@/lib/activation/client";
import { describeResume } from "@/lib/activation/checklist";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";

export function ActivationChecklist() {
  const [view, setView] = useState<ActivationViewResponse | null>(null);

  useEffect(() => {
    void fetchActivationView()
      .then(setView)
      .catch(() => undefined);
  }, []);

  if (!view?.shouldShowChecklist || view.checklist.length === 0) return null;

  const current = view.checklist.find((item) => item.current);

  return (
    <Card
      padding="md"
      className="border border-[var(--border-subtle)]"
      aria-label="最初の仕事"
    >
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="text-caption text-accent">最初の仕事</p>
          <h2 className="mt-1 text-sm font-semibold text-foreground">
            {describeResume(view.progress)}
          </h2>
        </div>
        <Button
          size="sm"
          variant="ghost"
          className="min-h-[44px]"
          onClick={() => {
            void patchActivationProgress({ checklistHidden: true });
            setView({ ...view, shouldShowChecklist: false, checklist: [] });
          }}
        >
          非表示
        </Button>
      </div>
      <ol className="mt-3 space-y-2">
        {view.checklist.map((item) => (
          <li
            key={item.id}
            className="flex min-h-[44px] items-center justify-between gap-3 text-sm"
          >
            <span className={item.done ? "text-[var(--text-muted)]" : "text-foreground"}>
              {item.done ? "完了" : item.current ? "次" : "未"} ・ {item.label}
            </span>
            {item.current ? (
              <Link
                href={item.href}
                className="min-h-[44px] rounded-full bg-accent px-4 text-sm font-medium leading-[44px] text-[var(--accent-foreground,#fff)] focus-ring"
              >
                {item.cta}
              </Link>
            ) : null}
          </li>
        ))}
      </ol>
      {current ? (
        <p className="mt-3 text-caption text-[var(--text-secondary)]" aria-live="polite">
          次は「{current.label}」です。
        </p>
      ) : (
        <p className="mt-3 text-caption text-accent" aria-live="polite">
          最初の確認まで進みました。
        </p>
      )}
    </Card>
  );
}
