"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";

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
 * User-facing result screen — 仕事を最後まで終わらせた完了UI.
 *
 * Shows: 今回完了した仕事 / 処理時間 / AIが行った内容 / 成果物一覧 /
 * ワンタップ再実行 / テンプレート保存 / 次回以降自動化
 */
export function SecretaryResultView({
  project,
  backHref = "/history",
  backLabel = ui.secretaryResult.back,
}: SecretaryResultViewProps) {
  const router = useRouter();
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

  const { deliverables, deliverablesError, isGeneratingDeliverables } =
    useDeliverableFiles(project.result ?? null, {
      skipFileGeneration: targetType === "x_post",
    });

  const { regenerate, isRegenerating, error: regenerateError } = useRegenerate(
    project.workRequest ?? "",
  );

  const templateHref = `/workspace?assignment=${encodeURIComponent(
    (project.workRequest ?? project.title ?? "").trim(),
  )}`;
  const automateHref = `/automations?from=${encodeURIComponent(project.id)}&assignment=${encodeURIComponent(
    (project.workRequest ?? "").trim(),
  )}`;

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

        <Card padding="lg" className="space-y-3 shadow-[var(--shadow-soft)] sm:col-span-2">
          <p className="text-xs font-semibold tracking-wide text-accent">
            {ui.secretaryResult.aiActionsHeading}
          </p>
          <ol className="space-y-2">
            {outcome.aiActions.map((action) => (
              <li
                key={action}
                className="text-sm leading-relaxed text-[var(--foreground-muted)]"
              >
                ・{action}
              </li>
            ))}
          </ol>
        </Card>

        <Card padding="lg" className="space-y-3 shadow-[var(--shadow-soft)] sm:col-span-2">
          <p className="text-xs font-semibold tracking-wide text-accent">
            {ui.secretaryResult.deliverablesListHeading}
          </p>
          <ul className="space-y-4">
            {outcome.deliverables.map((item) => (
              <li key={`${item.title}-${item.preview.slice(0, 24)}`} className="space-y-1">
                <p className="text-base font-medium text-foreground">{item.title}</p>
                {item.preview ? (
                  <p className="whitespace-pre-wrap text-sm leading-relaxed text-[var(--foreground-muted)]">
                    {item.preview}
                  </p>
                ) : null}
              </li>
            ))}
          </ul>
          <ul className="flex flex-wrap gap-3 pt-1">
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
      </section>

      <section
        aria-label="次のアクション"
        className="flex flex-col gap-3 sm:flex-row sm:flex-wrap"
      >
        <Button
          variant="primary"
          size="lg"
          className="w-full sm:w-auto"
          disabled={isRegenerating}
          onClick={() => void regenerate()}
        >
          {isRegenerating
            ? ui.secretaryResult.regenerating
            : ui.secretaryResult.rerunOneTap}
        </Button>
        <Button
          variant="secondary"
          size="lg"
          className="w-full sm:w-auto"
          onClick={() => router.push(templateHref)}
        >
          {ui.secretaryResult.saveTemplate}
        </Button>
        <Button
          variant="secondary"
          size="lg"
          className="w-full sm:w-auto"
          onClick={() => router.push(automateHref)}
        >
          {ui.secretaryResult.automateNext}
        </Button>
      </section>

      {regenerateError && <ErrorState message={regenerateError} />}

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
        <FinalOutput
          heading={ui.secretaryResult.contentHeading}
          result={project.result}
          isLoading={false}
          deliverables={deliverables}
          isGeneratingDeliverables={isGeneratingDeliverables}
          deliverablesError={deliverablesError}
        />
      )}
    </div>
  );
}
