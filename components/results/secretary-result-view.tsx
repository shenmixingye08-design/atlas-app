"use client";

import Link from "next/link";
import { useMemo, useState } from "react";

import { DeliverableHistoryFiles } from "@/components/results/deliverable-history-files";
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
import { buildWorkOutcomeSummary } from "@/lib/results/work-outcome-summary";
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
 * User-facing result screen — 成果を見せる完了UI.
 *
 * Shows: 今回やった仕事 / 成果物 / 成果物リンク / 使用AI / 実行時間 / 次回おすすめ
 * Plus the finished content and next actions. Never internal pipeline jargon.
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
  const outcome = useMemo(() => buildWorkOutcomeSummary(project), [project]);

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

  // Only documents/emails offer downloadable files; X posts do not.
  // History re-open regenerates files from stored text (no AI).
  const { deliverables, deliverablesError, isGeneratingDeliverables } =
    useDeliverableFiles(project.result ?? null, {
      skipFileGeneration: targetType === "x_post",
      projectId: project.id,
    });

  const { regenerate, isRegenerating, error: regenerateError } = useRegenerate(
    project.workRequest ?? "",
  );

  return (
    <div className="space-y-10">
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

      <section
        aria-label="成果サマリー"
        className="grid gap-3 sm:grid-cols-2"
      >
        <Card padding="lg" className="space-y-2 shadow-[var(--shadow-soft)] sm:col-span-2">
          <p className="text-xs font-semibold tracking-wide text-accent">
            {ui.secretaryResult.workDoneHeading}
          </p>
          <p className="text-base leading-relaxed text-foreground sm:text-lg">
            {outcome.workDone}
          </p>
        </Card>

        <Card padding="lg" className="space-y-2 shadow-[var(--shadow-soft)] sm:col-span-2">
          <p className="text-xs font-semibold tracking-wide text-accent">
            {ui.secretaryResult.deliverableHeading}
          </p>
          <p className="text-base font-medium text-foreground">
            {outcome.deliverableTitle}
          </p>
          {outcome.deliverablePreview ? (
            <p className="whitespace-pre-wrap text-sm leading-relaxed text-[var(--foreground-muted)]">
              {outcome.deliverablePreview}
            </p>
          ) : null}
        </Card>

        <Card padding="lg" className="space-y-3 shadow-[var(--shadow-soft)]">
          <p className="text-xs font-semibold tracking-wide text-accent">
            {ui.secretaryResult.deliverableLinksHeading}
          </p>
          <ul className="space-y-2">
            {outcome.deliverableLinks.map((link) => (
              <li key={link.href}>
                <Link
                  href={link.href}
                  className="text-sm font-medium text-foreground underline-offset-4 hover:underline focus-ring rounded"
                >
                  {link.label}
                </Link>
              </li>
            ))}
          </ul>
        </Card>

        <Card padding="lg" className="space-y-3 shadow-[var(--shadow-soft)]">
          <p className="text-xs font-semibold tracking-wide text-accent">
            {ui.secretaryResult.usedAiHeading}
          </p>
          <ul className="flex flex-wrap gap-2">
            {outcome.usedAi.map((name) => (
              <li
                key={name}
                className="rounded-full border border-[var(--border-subtle)] px-3 py-1 text-sm text-foreground"
              >
                {name}
              </li>
            ))}
          </ul>
        </Card>

        <Card padding="lg" className="space-y-2 shadow-[var(--shadow-soft)]">
          <p className="text-xs font-semibold tracking-wide text-accent">
            {ui.secretaryResult.durationHeading}
          </p>
          <p className="text-2xl font-semibold tracking-tight text-foreground">
            {outcome.durationLabel}
          </p>
        </Card>

        <Card padding="lg" className="space-y-3 shadow-[var(--shadow-soft)]">
          <p className="text-xs font-semibold tracking-wide text-accent">
            {ui.secretaryResult.nextRecommendHeading}
          </p>
          <ul className="space-y-2">
            {outcome.nextRecommendations.map((tip) => (
              <li
                key={tip}
                className="text-sm leading-relaxed text-[var(--foreground-muted)]"
              >
                ・{tip}
              </li>
            ))}
          </ul>
        </Card>
      </section>

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
            projectId={project.id}
          />

          <DeliverableHistoryFiles
            projectId={project.id}
            liveDeliverables={deliverables}
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
