"use client";

import { useEffect, useMemo, useState, type ReactNode } from "react";

import type { Deliverable as GeneratedFile } from "@/lib/deliverables/types";
import { DELIVERABLE_FORMAT_LABELS } from "@/lib/deliverables/types";
import { isAtlasClientDebugEnabled } from "@/lib/debug/atlas-debug";
import {
  deliverableHasContent,
  type Deliverable as WorkspaceDeliverable,
  type DeliverableType,
} from "@/lib/orchestration/deliverable-types";
import {
  getBlogTags,
  getDocumentBody,
  getEmailDisplayFields,
  getSocialPostCards,
  isDeliverableJsonText,
  normalizeDeliverableForDisplay,
  sanitizeBodyTextForDisplay,
} from "@/lib/orchestration/deliverable-display";
import { getDeliverableExportText } from "@/lib/orchestration/final-deliverable";
import type { OrchestrationResult } from "@/lib/orchestration/types";
import { ui } from "@/lib/i18n";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { ErrorState } from "@/components/ui/error-state";
import { ImageAnalysisReview } from "@/components/results/image-analysis-review";
import { requestDeliverables } from "@/lib/deliverables/client";
import type { ImageAnalysisResult } from "@/lib/image-analysis/types";

type FinalOutputProps = {
  result: OrchestrationResult | null;
  isLoading: boolean;
  deliverables?: GeneratedFile[];
  isGeneratingDeliverables?: boolean;
  deliverablesError?: string | null;
  /** When set, only show download buttons for these formats. */
  expectedFormats?: GeneratedFile["format"][];
  /**
   * Override the section heading. Defaults to the internal 「成果物」 label used
   * by the legacy workspace; the user-facing secretary result view passes a
   * natural, contextual title instead (e.g. 「レポートができました」).
   */
  heading?: string;
};

const TYPE_LABELS: Record<DeliverableType, string> = {
  blog: "ブログ",
  report: "レポート",
  proposal: "提案書",
  presentation: "プレゼン",
  research: "調査",
  email: "メール",
  social_post: "SNS投稿",
  short_document: "短文",
  document: "ドキュメント",
};

function downloadMarkdown(content: string, fileName: string): void {
  const blob = new Blob([content], { type: "text/markdown;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = fileName;
  anchor.click();
  URL.revokeObjectURL(url);
}

function findGeneratedFile(
  deliverables: readonly GeneratedFile[],
  format: GeneratedFile["format"],
): GeneratedFile | undefined {
  return deliverables.find((item) => item.format === format);
}

const DEFAULT_DOWNLOAD_FORMAT_ORDER: GeneratedFile["format"][] = [
  "xlsx",
  "csv",
  "pdf",
  "docx",
  "md",
  "pptx",
];

function resolveDownloadOrder(
  result: OrchestrationResult | null,
): GeneratedFile["format"][] {
  const type = result?.imageAnalysis?.documentType;
  if (type === "business_card") {
    return ["csv", "xlsx", "pdf", "docx", "md", "pptx"];
  }
  if (type === "handwritten") {
    return ["docx", "pdf", "md", "xlsx", "csv", "pptx"];
  }
  if (type === "receipt" || type === "invoice" || type === "estimate" || type === "table") {
    return ["xlsx", "csv", "pdf", "docx", "md", "pptx"];
  }
  return DEFAULT_DOWNLOAD_FORMAT_ORDER;
}

function formatShortLabel(format: GeneratedFile["format"]): string {
  if (format === "docx") return "Word";
  if (format === "pptx") return "PowerPoint";
  if (format === "xlsx") return "Excel";
  if (format === "csv") return "CSV";
  if (format === "md") return "Markdown";
  return DELIVERABLE_FORMAT_LABELS[format].split(" ")[0] ?? format;
}

function FormatDownloadButton({
  format,
  deliverables,
  isGeneratingDeliverables,
}: {
  format: GeneratedFile["format"];
  deliverables: readonly GeneratedFile[];
  isGeneratingDeliverables: boolean;
}) {
  const file = findGeneratedFile(deliverables, format);
  const shortLabel = formatShortLabel(format);

  // Only show buttons that can actually download (or are actively generating).
  if (!file && !isGeneratingDeliverables) {
    return null;
  }

  if (file) {
    return (
      <a
        href={file.downloadUrl}
        download={file.fileName}
        className="inline-flex min-h-11 min-w-11 items-center"
      >
        <Button variant="secondary" size="sm" type="button">
          {shortLabel}
        </Button>
      </a>
    );
  }

  return (
    <Button
      variant="secondary"
      size="sm"
      disabled
      className="min-h-11"
    >
      {format === "xlsx" ? "Excelを作成しています" : shortLabel}
    </Button>
  );
}

function DocumentHeading({ children }: { children: ReactNode }) {
  return (
    <h1 className="border-b border-[var(--border-subtle)] pb-4 text-2xl font-semibold tracking-tight text-foreground">
      {children}
    </h1>
  );
}

function DocumentSection({
  title,
  children,
}: {
  title: string;
  children: ReactNode;
}) {
  return (
    <section className="space-y-3">
      <h2 className="text-sm font-semibold uppercase tracking-wide text-[var(--foreground-muted)]">
        {title}
      </h2>
      <div className="text-base leading-relaxed text-foreground">{children}</div>
    </section>
  );
}

function BodyBlock({ text }: { text: string }) {
  const safeText = sanitizeBodyTextForDisplay(text);
  if (!safeText || isDeliverableJsonText(safeText)) return null;

  return (
    <div className="whitespace-pre-wrap font-sans text-base leading-relaxed text-foreground">
      {safeText}
    </div>
  );
}

function CollapsibleSection({
  title,
  children,
  defaultOpen = false,
}: {
  title: string;
  children: ReactNode;
  defaultOpen?: boolean;
}) {
  return (
    <details
      className="group rounded-[var(--radius-lg)] border border-[var(--border-subtle)] bg-[var(--background-muted)]/40 px-4 py-3"
      open={defaultOpen}
    >
      <summary className="cursor-pointer text-sm font-semibold uppercase tracking-wide text-[var(--foreground-muted)] marker:content-none">
        <span className="inline-flex items-center gap-2">
          <span className="text-xs transition-transform group-open:rotate-90">▸</span>
          {title}
        </span>
      </summary>
      <div className="mt-3 text-base leading-relaxed text-foreground">{children}</div>
    </details>
  );
}

function TypeBadge({ type }: { type: DeliverableType }) {
  return (
    <span className="rounded-full bg-[var(--background-muted)] px-3 py-1 text-xs font-medium text-[var(--foreground-muted)]">
      {TYPE_LABELS[type]}
    </span>
  );
}

function EmailPreview({ deliverable }: { deliverable: WorkspaceDeliverable }) {
  const { subject, body, summary } = getEmailDisplayFields(deliverable);

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center gap-2">
        <TypeBadge type="email" />
      </div>
      <DocumentHeading>営業メール</DocumentHeading>
      <DocumentSection title="件名">
        <BodyBlock text={subject || "（件名なし）"} />
      </DocumentSection>
      <DocumentSection title="本文">
        <BodyBlock text={body} />
      </DocumentSection>
      {summary && (
        <CollapsibleSection title="概要">
          <BodyBlock text={summary} />
        </CollapsibleSection>
      )}
    </div>
  );
}

function BlogPreview({ deliverable }: { deliverable: WorkspaceDeliverable }) {
  const normalized = normalizeDeliverableForDisplay(deliverable);
  const body = getDocumentBody(normalized);
  const tags = getBlogTags(normalized);

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center gap-2">
        <TypeBadge type="blog" />
      </div>
      <DocumentHeading>{normalized.title || "タイトル"}</DocumentHeading>
      {normalized.summary && (
        <DocumentSection title="概要">
          <BodyBlock text={normalized.summary} />
        </DocumentSection>
      )}
      {body && (
        <DocumentSection title="本文">
          <BodyBlock text={body} />
        </DocumentSection>
      )}
      {tags.length > 0 && (
        <DocumentSection title="Tags">
          <p className="text-sm text-[var(--foreground-muted)]">{tags.join(" · ")}</p>
        </DocumentSection>
      )}
    </div>
  );
}

function SocialPostPreview({ deliverable }: { deliverable: WorkspaceDeliverable }) {
  const posts = getSocialPostCards(deliverable);

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center gap-2">
        <TypeBadge type="social_post" />
      </div>
      {deliverable.title && <DocumentHeading>{deliverable.title}</DocumentHeading>}
      <div className="grid gap-4">
        {posts.map((post, index) => (
          <Card key={`post-${index + 1}`} padding="md" className="bg-background">
            <p className="mb-3 text-xs font-semibold uppercase tracking-wide text-[var(--foreground-muted)]">
              投稿 {index + 1}
            </p>
            <BodyBlock text={post} />
          </Card>
        ))}
      </div>
    </div>
  );
}

function StructuredDocumentPreview({
  deliverable,
}: {
  deliverable: WorkspaceDeliverable;
}) {
  const normalized = normalizeDeliverableForDisplay(deliverable);
  const body = getDocumentBody(normalized);

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center gap-2">
        <TypeBadge type={normalized.type} />
      </div>
      {normalized.title && <DocumentHeading>{normalized.title}</DocumentHeading>}
      {normalized.summary && (
        <DocumentSection title="概要">
          <BodyBlock text={normalized.summary} />
        </DocumentSection>
      )}
      {body && (
        <DocumentSection title="本文">
          <BodyBlock text={body} />
        </DocumentSection>
      )}
    </div>
  );
}

function DeliverablePreview({ deliverable }: { deliverable: WorkspaceDeliverable }) {
  const normalized = useMemo(
    () => normalizeDeliverableForDisplay(deliverable),
    [deliverable],
  );

  switch (normalized.type) {
    case "email":
      return <EmailPreview deliverable={normalized} />;
    case "blog":
      return <BlogPreview deliverable={normalized} />;
    case "social_post":
      return <SocialPostPreview deliverable={normalized} />;
    case "proposal":
    case "report":
    case "document":
    case "presentation":
    case "research":
    case "short_document":
      return <StructuredDocumentPreview deliverable={normalized} />;
    default:
      return <StructuredDocumentPreview deliverable={normalized} />;
  }
}

function DeliverableDebugPanel({ deliverable }: { deliverable: WorkspaceDeliverable }) {
  return (
    <CollapsibleSection title="Deliverable JSON (debug)">
      <pre className="overflow-x-auto whitespace-pre-wrap break-words font-mono text-xs text-[var(--foreground-muted)]">
        {JSON.stringify(deliverable, null, 2)}
      </pre>
    </CollapsibleSection>
  );
}

export function FinalOutput({
  result,
  isLoading,
  deliverables = [],
  isGeneratingDeliverables = false,
  deliverablesError = null,
  expectedFormats,
  heading,
}: FinalOutputProps) {
  const [copied, setCopied] = useState(false);
  const [driveSaved, setDriveSaved] = useState(false);
  const [localAnalysis, setLocalAnalysis] = useState<ImageAnalysisResult | null>(
    null,
  );
  const [localDeliverables, setLocalDeliverables] = useState<GeneratedFile[] | null>(
    null,
  );
  const [isRegenerating, setIsRegenerating] = useState(false);
  const [regenError, setRegenError] = useState<string | null>(null);
  const showDebug = isAtlasClientDebugEnabled();

  const effectiveAnalysis = localAnalysis ?? result?.imageAnalysis ?? null;
  const effectiveDeliverables = localDeliverables ?? deliverables;
  const workspaceDeliverable = result?.deliverable ?? null;
  const exportText = useMemo(
    () =>
      workspaceDeliverable
        ? getDeliverableExportText(workspaceDeliverable)
        : "",
    [workspaceDeliverable],
  );
  const isReady = useMemo(
    () => (workspaceDeliverable ? deliverableHasContent(workspaceDeliverable) : false),
    [workspaceDeliverable],
  );
  const downloadOrder = useMemo(
    () =>
      resolveDownloadOrder(
        effectiveAnalysis
          ? ({ ...result, imageAnalysis: effectiveAnalysis } as OrchestrationResult)
          : result,
      ),
    [result, effectiveAnalysis],
  );

  const generating = isGeneratingDeliverables || isRegenerating;

  const fileFormatsToShow = useMemo(() => {
    const available = new Set(effectiveDeliverables.map((item) => item.format));
    const fromDeliverable = (result?.deliverable?.downloads ?? [])
      .map((item) => item.format)
      .filter(
        (format): format is GeneratedFile["format"] => format !== "html",
      );

    const candidate =
      expectedFormats && expectedFormats.length > 0
        ? expectedFormats
        : fromDeliverable.length > 0
          ? fromDeliverable
          : available.size > 0
            ? [...available]
            : (["pdf", "docx"] as GeneratedFile["format"][]);

    return downloadOrder.filter((format) => {
      if (!candidate.includes(format)) return false;
      if (generating) return true;
      return available.has(format);
    });
  }, [
    expectedFormats,
    downloadOrder,
    effectiveDeliverables,
    generating,
    result?.deliverable?.downloads,
  ]);

  useEffect(() => {
    if (process.env.NODE_ENV === "production" || !result) return;
    if (
      process.env.NEXT_PUBLIC_ATLAS_DEBUG === "true" &&
      (result.pipelineDebug || result.costDebug)
    ) {
      console.info("[ATLAS Workflow Inspector] debug payloads attached", {
        workflowId: result.workflow.workflowId,
        llmCalls: result.costDebug?.llmCallCount,
        stages: result.pipelineDebug?.stages.length,
      });
    }
  }, [result]);

  if (isLoading || !result) {
    return null;
  }

  if (!isReady || !workspaceDeliverable) {
    const pipelineReason = result.isolationDebug?.pipeline?.needsReviewReason?.trim();
    const failedStage = result.isolationDebug?.pipeline?.failedStage ?? result.stepError?.step;
    const failureMessage =
      pipelineReason ||
      result.error?.trim() ||
      (result.stepError?.step === "worker" ? ui.work.workerDeliverableFailed : "") ||
      (failedStage === "worker" ? ui.work.workerNotExecuted : "") ||
      ui.work.deliverableEmpty;

    return (
      <section className="space-y-4 animate-fade-in" aria-labelledby="output-heading">
        <h2 id="output-heading" className="text-title text-foreground">
          {heading ?? ui.work.deliverableTitle}
        </h2>
        <Card padding="lg">
          {failedStage && (
            <p className="mb-2 text-xs font-medium uppercase tracking-wide text-[var(--status-warning)]">
              失敗ステージ: {failedStage}
            </p>
          )}
          <p className="whitespace-pre-wrap text-sm leading-relaxed text-[var(--foreground-muted)]">
            {failureMessage}
          </p>
        </Card>
      </section>
    );
  }

  const markdownFile = findGeneratedFile(effectiveDeliverables, "md");
  const baseName = markdownFile?.fileName ?? `${workspaceDeliverable.type}-deliverable.md`;

  const handleCopy = async () => {
    await navigator.clipboard.writeText(exportText);
    setCopied(true);
    window.setTimeout(() => setCopied(false), 2000);
  };

  const handleDriveSave = () => {
    setDriveSaved(true);
  };

  const handleApplyAnalysis = async (next: ImageAnalysisResult) => {
    if (!result) return;
    setLocalAnalysis(next);
    setIsRegenerating(true);
    setRegenError(null);
    try {
      const response = await requestDeliverables({
        assignment: result.assignment,
        finalDeliverable: exportText,
        title: next.title,
        imageAnalysis: next,
        formats: result.deliverable.downloads
          .map((item) => item.format)
          .filter(
            (format): format is GeneratedFile["format"] => format !== "html",
          ),
      });
      setLocalDeliverables(response.deliverables);
    } catch (error) {
      setRegenError(
        error instanceof Error
          ? error.message
          : "Excelの作成に失敗しました。もう一度お試しください。",
      );
    } finally {
      setIsRegenerating(false);
    }
  };

  return (
    <section className="space-y-6 animate-fade-in" aria-labelledby="output-heading">
      <div>
        <h2 id="output-heading" className="text-title text-foreground">
          {heading ?? ui.work.deliverableTitle}
        </h2>
        {!result.approved && (
          <p className="mt-1 text-caption text-[var(--status-warning)]">
            {ui.work.deliverableNeedsReview}
          </p>
        )}
      </div>

      <Card padding="lg" className="shadow-[var(--shadow-soft)]">
        <div className="max-h-[560px] overflow-auto rounded-[var(--radius-xl)] bg-[var(--background-subtle)] px-6 py-8">
          <DeliverablePreview deliverable={workspaceDeliverable} />
        </div>

        {showDebug && (
          <div className="mt-4">
            <DeliverableDebugPanel deliverable={workspaceDeliverable} />
          </div>
        )}

        <div className="mt-6 flex max-w-full flex-wrap gap-3 pb-[env(safe-area-inset-bottom)]">
          {fileFormatsToShow.map((format) => (
            <FormatDownloadButton
              key={format}
              format={format}
              deliverables={effectiveDeliverables}
              isGeneratingDeliverables={generating}
            />
          ))}

          <Button
            variant="secondary"
            size="sm"
            className="min-h-11"
            onClick={() => downloadMarkdown(exportText, baseName)}
          >
            {ui.work.saveMarkdown}
          </Button>

          <Button
            variant="secondary"
            size="sm"
            className="min-h-11"
            onClick={() => void handleCopy()}
          >
            {copied ? ui.work.copied : ui.work.copy}
          </Button>

          <Button
            variant="secondary"
            size="sm"
            className="min-h-11"
            onClick={handleDriveSave}
          >
            {driveSaved ? ui.work.driveSaved : ui.work.saveToDrive}
          </Button>
        </div>

        {generating && (
          <p className="mt-4 animate-soft-pulse text-caption">
            {effectiveAnalysis ? "Excelを作成しています" : ui.work.preparingFiles}
          </p>
        )}

        {!generating &&
          Boolean(findGeneratedFile(effectiveDeliverables, "xlsx")) && (
            <p className="mt-4 text-caption text-[var(--status-success)]">
              Excelの準備ができました
            </p>
          )}

        {!generating &&
          effectiveAnalysis &&
          !findGeneratedFile(effectiveDeliverables, "xlsx") &&
          Boolean(deliverablesError || regenError) && (
            <p className="mt-4 text-sm text-[var(--status-danger)]">
              Excelの作成に失敗しました。もう一度お試しください。
            </p>
          )}

        {effectiveAnalysis && (
          <ImageAnalysisReview
            analysis={effectiveAnalysis}
            onApply={(next) => {
              void handleApplyAnalysis(next);
            }}
          />
        )}

        {driveSaved && (
          <p className="mt-4 text-sm text-[var(--foreground-muted)] animate-fade-in">
            {ui.work.driveSandboxSaved}
          </p>
        )}

        {(deliverablesError || regenError) && (
          <div className="mt-4">
            <ErrorState message={regenError ?? deliverablesError ?? ""} />
          </div>
        )}

        {effectiveDeliverables.length > 0 && (
          <p className="mt-4 text-caption">
            {effectiveDeliverables
              .map((item) => DELIVERABLE_FORMAT_LABELS[item.format])
              .join(" · ")}
          </p>
        )}
      </Card>
    </section>
  );
}

export function useFinalOutputReady(result: OrchestrationResult | null): boolean {
  return useMemo(() => {
    if (!result?.deliverable) return false;
    return deliverableHasContent(result.deliverable);
  }, [result]);
}
