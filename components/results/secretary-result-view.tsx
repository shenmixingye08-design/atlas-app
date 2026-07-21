"use client";

import Link from "next/link";
import { useMemo, useState } from "react";

import { CompletionSummaryCard } from "@/components/results/completion-summary-card";
import { NextActionsBar } from "@/components/results/next-actions-bar";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { ErrorState } from "@/components/ui/error-state";
import { FinalOutput } from "@/components/workspace/final-output";
import { ui } from "@/lib/i18n";
import {
  getDocumentBody,
  getSocialPostCards,
} from "@/lib/orchestration/deliverable-display";
import { getDeliverablePreviewText } from "@/lib/orchestration/deliverable-types";
import { formatProjectDate } from "@/lib/projects/utils";
import type { Project } from "@/lib/projects/types";
import {
  deriveCompletionTitle,
  deriveResultIntent,
  deriveTargetType,
} from "@/lib/results/completion";
import { buildCompletionSummary } from "@/lib/results/completion-summary";
import { useRegenerate } from "@/lib/results/use-regenerate";
import { useDeliverableFiles } from "@/lib/workspace/use-deliverable-files";

type SecretaryResultViewProps = {
  project: Project;
  backHref?: string;
  backLabel?: string;
};

/** Best X post text for a completed job (what would actually be posted). */
function resolveXPostText(project: Project): string {
  const deliverable = project.result?.deliverable ?? null;
  if (deliverable) {
    const cards = getSocialPostCards(deliverable);
    const firstCard = cards.find((card) => card.trim());
    if (firstCard) return firstCard.trim();
    const snsPost = deliverable.metadata?.snsPost?.trim();
    if (snsPost) return snsPost;
    const body = getDocumentBody(deliverable).trim();
    if (body) return body;
    const preview = getDeliverablePreviewText(deliverable).trim();
    if (preview) return preview;
  }
  return (project.result?.finalResponse ?? "").trim();
}

/**
 * User-facing result screen: 「成果確認 → 次の実行」.
 *
 * Shows what the user cares about — work done, deliverable, links, used AI,
 * duration, and next recommendation — never internal org structure.
 */
export function SecretaryResultView({
  project,
  backHref = "/history",
  backLabel = ui.secretaryResult.back,
}: SecretaryResultViewProps) {
  const [postedOverride, setPostedOverride] = useState(false);

  const targetType = useMemo(() => deriveTargetType(project), [project]);
  const intent = useMemo(
    () => deriveResultIntent(project.workRequest ?? ""),
    [project.workRequest],
  );
  const derivedTitle = useMemo(() => deriveCompletionTitle(project), [project]);
  const title = postedOverride ? ui.secretaryResult.postedTitle : derivedTitle;
  const summary = useMemo(() => buildCompletionSummary(project), [project]);

  const xPostText = useMemo(
    () => (targetType === "x_post" ? resolveXPostText(project) : ""),
    [project, targetType],
  );

  const deliverable = project.result?.deliverable ?? null;
  const posts = ((): string[] => {
    if (targetType !== "x_post" || !deliverable) return [];
    const cards = getSocialPostCards(deliverable).filter(Boolean);
    if (cards.length > 0) return cards;
    return xPostText ? [xPostText] : [];
  })();

  const { deliverables, deliverablesError, isGeneratingDeliverables } =
    useDeliverableFiles(project.result ?? null, {
      skipFileGeneration: targetType === "x_post",
    });

  const { regenerate, isRegenerating, error: regenerateError } = useRegenerate(
    project.workRequest ?? "",
  );

  return (
    <div className="space-y-8">
      <div className="space-y-4">
        <Link
          href={backHref}
          className="inline-flex items-center gap-1 text-sm text-[var(--foreground-muted)] transition-colors hover:text-foreground focus-ring rounded"
        >
          ← {backLabel}
        </Link>
        <div className="space-y-1">
          <h1 className="text-2xl font-semibold tracking-tight text-foreground sm:text-3xl">
            {title}
          </h1>
          <p className="text-sm text-[var(--foreground-muted)]">
            {ui.secretaryResult.completedAt(formatProjectDate(project.updatedAt))}
          </p>
        </div>
      </div>

      <CompletionSummaryCard summary={summary} />

      {targetType === "x_post" ? (
        <div className="space-y-8">
          <section className="space-y-3" aria-label={ui.secretaryResult.postsHeading}>
            {posts.map((post, index) => (
              <Card key={`post-${index + 1}`} padding="lg" className="shadow-[var(--shadow-soft)]">
                {posts.length > 1 && index > 0 && (
                  <p className="mb-3 text-xs font-semibold uppercase tracking-wide text-[var(--foreground-muted)]">
                    {ui.secretaryResult.postAltLabel(index)}
                  </p>
                )}
                <p className="whitespace-pre-wrap break-words text-base leading-relaxed text-foreground">
                  {post}
                </p>
              </Card>
            ))}
          </section>

          <NextActionsBar
            key={xPostText}
            intent={intent}
            tweetText={xPostText}
            onPostedChange={setPostedOverride}
          />
        </div>
      ) : (
        <div className="space-y-6">
          <FinalOutput
            heading={ui.secretaryResult.contentHeading}
            result={project.result}
            isLoading={false}
            deliverables={deliverables}
            isGeneratingDeliverables={isGeneratingDeliverables}
            deliverablesError={deliverablesError}
          />

          {regenerateError && <ErrorState message={regenerateError} />}

          <div className="flex flex-col gap-3 sm:flex-row">
            <Button
              variant="secondary"
              size="lg"
              className="w-full sm:w-auto"
              disabled={isRegenerating}
              onClick={() => void regenerate()}
            >
              {isRegenerating
                ? ui.secretaryResult.regenerating
                : ui.secretaryResult.regenerate}
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}
