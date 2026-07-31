"use client";

import { useMemo, useState } from "react";

import { Button } from "@/components/ui/button";
import type { Deliverable, DeliverableFormat } from "@/lib/deliverables/types";
import type { OrchestrationResult } from "@/lib/orchestration/types";

import { FinalOutput } from "./final-output";

type WorkFinishedPanelProps = {
  result: OrchestrationResult;
  deliverables: Deliverable[];
  isGeneratingDeliverables: boolean;
  deliverablesError: string | null;
  expectedFormats?: DeliverableFormat[];
  onReset: () => void;
};

/**
 * Phase1 completion — work finished, not "deliverable formats".
 * Extra chrome stays behind 開く.
 */
export function WorkFinishedPanel({
  result,
  deliverables,
  isGeneratingDeliverables,
  deliverablesError,
  expectedFormats,
  onReset,
}: WorkFinishedPanelProps) {
  const [opened, setOpened] = useState(false);

  const openUrl = useMemo(() => {
    const preferred =
      deliverables.find((file) => file.format === "docx") ??
      deliverables.find((file) => file.format === "pdf") ??
      deliverables[0];
    return preferred?.downloadUrl ?? null;
  }, [deliverables]);

  const handleOpen = () => {
    if (openUrl) {
      window.open(openUrl, "_blank", "noopener,noreferrer");
      return;
    }
    setOpened(true);
  };

  return (
    <section className="mx-auto max-w-lg space-y-8 py-16 text-center animate-fade-up">
      <div className="space-y-3">
        <h2 className="text-2xl font-semibold tracking-tight text-foreground sm:text-3xl">
          お仕事が終わりました。
        </h2>
        <p className="text-base text-foreground">こちらです。</p>
      </div>

      <div className="flex flex-col items-center gap-3">
        <Button
          type="button"
          variant="primary"
          size="lg"
          className="h-12 min-w-[8rem] rounded-full px-10"
          onClick={handleOpen}
          disabled={isGeneratingDeliverables && !openUrl && !opened}
        >
          開く
        </Button>
        <button
          type="button"
          className="text-sm text-[var(--foreground-muted)] underline-offset-4 hover:underline"
          onClick={onReset}
        >
          別の仕事を頼む
        </button>
      </div>

      {(opened || !openUrl) && (
        <div className="pt-4 text-left">
          <FinalOutput
            result={result}
            isLoading={false}
            deliverables={deliverables}
            isGeneratingDeliverables={isGeneratingDeliverables}
            deliverablesError={deliverablesError}
            expectedFormats={expectedFormats}
            heading=" "
          />
        </div>
      )}
    </section>
  );
}
