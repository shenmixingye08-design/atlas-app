"use client";

import { useEffect, useMemo, useState, type ReactNode } from "react";

import {
  downloadFromBase64,
  downloadOfficeViaExportApi,
  isOfficeDownloadFormat,
  type OfficeDownloadFormat,
} from "@/lib/deliverables/client-download";
import type { Deliverable as GeneratedFile } from "@/lib/deliverables/types";
import {
  DELIVERABLE_DOWNLOAD_ORDER,
  DELIVERABLE_FORMAT_LABELS,
} from "@/lib/deliverables/types";
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
import { regenerateDeliverableFiles } from "@/lib/workspace/use-deliverable-files";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { ErrorState } from "@/components/ui/error-state";

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
  /** Persist regenerated files into history when re-editing. */
  projectId?: string;
  /** Called when local file list is refreshed after re-edit. */
  onDeliverablesChange?: (files: GeneratedFile[]) => void;
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

function downloadTextFile(
  content: string,
  fileName: string,
  mime: string,
): void {
  const blob = new Blob([content], { type: mime });
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

function shortFormatLabel(format: GeneratedFile["format"]): string {
  switch (format) {
    case "docx":
      return "Word";
    case "xlsx":
      return "Excel";
    case "pptx":
      return "PowerPoint";
    case "pdf":
      return "PDF";
    case "md":
      return "Markdown";
    case "txt":
      return "テキスト";
    case "csv":
      return "CSV";
    default:
      return DELIVERABLE_FORMAT_LABELS[format];
  }
}

function FormatDownloadButton({
  format,
  deliverables,
  isGeneratingDeliverables,
  exportText,
  baseName,
  assignment,
  title,
  onOfficeError,
}: {
  format: GeneratedFile["format"];
  deliverables: readonly GeneratedFile[];
  isGeneratingDeliverables: boolean;
  exportText: string;
  baseName: string;
  assignment: string;
  title?: string;
  onOfficeError: (error: {
    format: OfficeDownloadFormat;
    message: string;
    cause?: string;
  } | null) => void;
}) {
  const file = findGeneratedFile(deliverables, format);
  const label = shortFormatLabel(format);
  const [busy, setBusy] = useState(false);

  if (isOfficeDownloadFormat(format)) {
    const handleOfficeDownload = async () => {
      setBusy(true);
      onOfficeError(null);
      try {
        if (file?.contentBase64) {
          downloadFromBase64({
            base64: file.contentBase64,
            fileName: file.fileName,
            mimeType: file.mimeType,
          });
          return;
        }

        await downloadOfficeViaExportApi({
          format,
          content: exportText,
          assignment,
          title,
        });
      } catch (error) {
        const message =
          format === "docx" ? ui.work.wordGenerateFailed : ui.work.pdfGenerateFailed;
        const cause =
          error && typeof error === "object" && "cause" in error
            ? String((error as { cause?: unknown }).cause ?? "")
            : error instanceof Error
              ? error.message
              : undefined;
        console.error(`[FinalOutput] ${format} download failed`, error);
        onOfficeError({ format, message, cause });
      } finally {
        setBusy(false);
      }
    };

    return (
      <Button
        variant="secondary"
        size="sm"
        type="button"
        disabled={busy || !exportText.trim()}
        onClick={() => void handleOfficeDownload()}
      >
        {busy ? ui.work.downloadingOffice : label}
      </Button>
    );
  }

  if (file) {
    return (
      <a href={file.downloadUrl} download={file.fileName}>
        <Button variant="secondary" size="sm" type="button">
          {label}
        </Button>
      </a>
    );
  }

  // Client-side fallback for text formats while server files prepare
  if (format === "md") {
    return (
      <Button
        variant="secondary"
        size="sm"
        type="button"
        onClick={() =>
          downloadTextFile(
            exportText,
            `${baseName}.md`,
            "text/markdown;charset=utf-8",
          )
        }
      >
        {label}
      </Button>
    );
  }

  if (format === "txt") {
    return (
      <Button
        variant="secondary"
        size="sm"
        type="button"
        onClick={() =>
          downloadTextFile(
            exportText,
            `${baseName}.txt`,
            "text/plain;charset=utf-8",
          )
        }
      >
        {label}
      </Button>
    );
  }

  return (
    <Button variant="secondary" size="sm" disabled={isGeneratingDeliverables}>
      {label}
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

function StepLabel({ step, label }: { step: number; label: string }) {
  return (
    <p className="text-xs font-semibold tracking-wide text-accent">
      {step}. {label}
    </p>
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
  projectId,
  onDeliverablesChange,
}: FinalOutputProps) {
  const [copied, setCopied] = useState(false);
  const [shared, setShared] = useState(false);
  const [driveSaved, setDriveSaved] = useState(false);
  const [isEditing, setIsEditing] = useState(false);
  const [editText, setEditText] = useState("");
  const [editedDeliverables, setEditedDeliverables] = useState<GeneratedFile[] | null>(
    null,
  );
  const [isRegeneratingFiles, setIsRegeneratingFiles] = useState(false);
  const [reeditError, setReeditError] = useState<string | null>(null);
  const [officeError, setOfficeError] = useState<{
    format: OfficeDownloadFormat;
    message: string;
    cause?: string;
  } | null>(null);
  const [officeRetryKey, setOfficeRetryKey] = useState(0);
  const showDebug = isAtlasClientDebugEnabled();

  // Prefer locally re-edited files; otherwise use server-generated list.
  const localDeliverables = editedDeliverables ?? deliverables;

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

  const fileFormatsToShow = useMemo(() => {
    if (expectedFormats && expectedFormats.length > 0) {
      return DELIVERABLE_DOWNLOAD_ORDER.filter((format) =>
        expectedFormats.includes(format),
      );
    }

    const fromServer = DELIVERABLE_DOWNLOAD_ORDER.filter((format) =>
      localDeliverables.some((item) => item.format === format),
    );

    // Always expose Word/PDF — they download via on-demand export (Vercel-safe).
    const required = new Set<GeneratedFile["format"]>([
      ...fromServer,
      "docx",
      "pdf",
      "md",
      "txt",
    ]);

    if (fromServer.length === 0) {
      return ["docx", "xlsx", "pdf", "pptx", "md", "txt", "csv"] as GeneratedFile["format"][];
    }

    return DELIVERABLE_DOWNLOAD_ORDER.filter((format) => required.has(format));
  }, [expectedFormats, localDeliverables]);

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

  const markdownFile = findGeneratedFile(localDeliverables, "md");
  const baseName = (markdownFile?.fileName ?? `${workspaceDeliverable.type}-deliverable`).replace(
    /\.(md|txt)$/i,
    "",
  );

  const handleCopy = async () => {
    await navigator.clipboard.writeText(exportText);
    setCopied(true);
    window.setTimeout(() => setCopied(false), 2000);
  };

  const handleShare = async () => {
    try {
      if (navigator.share) {
        await navigator.share({
          title: workspaceDeliverable.title || ui.work.deliverableTitle,
          text: exportText.slice(0, 4000),
        });
        setShared(true);
        window.setTimeout(() => setShared(false), 2000);
        return;
      }
      await navigator.clipboard.writeText(exportText);
      setShared(true);
      window.setTimeout(() => setShared(false), 2000);
    } catch {
      // User cancelled share sheet — ignore.
    }
  };

  const handleDriveSave = () => {
    setDriveSaved(true);
  };

  const handleStartEdit = () => {
    setEditText(exportText);
    setIsEditing(true);
    setReeditError(null);
  };

  const handleApplyEdit = async () => {
    if (!editText.trim()) {
      setReeditError(ui.work.reeditEmpty);
      return;
    }

    setIsRegeneratingFiles(true);
    setReeditError(null);
    try {
      const files = await regenerateDeliverableFiles({
        assignment: result.assignment,
        content: editText,
        title: workspaceDeliverable.title || undefined,
        projectId,
        formats: expectedFormats,
      });
      setEditedDeliverables(files);
      onDeliverablesChange?.(files);
      setIsEditing(false);
    } catch (error) {
      setReeditError(
        error instanceof Error ? error.message : ui.work.reeditFailed,
      );
    } finally {
      setIsRegeneratingFiles(false);
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

      <Card padding="lg" className="space-y-8 shadow-[var(--shadow-soft)]">
        <div className="space-y-3">
          <StepLabel step={1} label={ui.work.previewStep} />
          <div className="max-h-[560px] overflow-auto rounded-[var(--radius-xl)] bg-[var(--background-subtle)] px-6 py-8">
            {isEditing ? (
              <textarea
                value={editText}
                onChange={(event) => setEditText(event.target.value)}
                className="min-h-[360px] w-full resize-y rounded-[var(--radius-lg)] border border-[var(--border-subtle)] bg-background px-4 py-3 font-mono text-sm leading-relaxed text-foreground focus-ring"
                aria-label={ui.work.reeditLabel}
              />
            ) : (
              <DeliverablePreview deliverable={workspaceDeliverable} />
            )}
          </div>
        </div>

        {showDebug && (
          <div>
            <DeliverableDebugPanel deliverable={workspaceDeliverable} />
          </div>
        )}

        <div className="space-y-3">
          <StepLabel step={2} label={ui.work.downloadStep} />
          <div className="flex flex-wrap gap-3" key={officeRetryKey}>
            {fileFormatsToShow.map((format) => (
              <FormatDownloadButton
                key={format}
                format={format}
                deliverables={localDeliverables}
                isGeneratingDeliverables={
                  isGeneratingDeliverables || isRegeneratingFiles
                }
                exportText={isEditing ? editText : exportText}
                baseName={baseName}
                assignment={result.assignment}
                title={workspaceDeliverable.title || undefined}
                onOfficeError={setOfficeError}
              />
            ))}
          </div>
          <p className="text-caption text-[var(--foreground-muted)]">
            {ui.work.downloadHintBusiness}
          </p>
          {officeError && (
            <div className="space-y-2 rounded-[var(--radius-lg)] border border-[var(--status-warning)]/40 bg-[var(--background-muted)]/40 px-4 py-3">
              <ErrorState
                message={[officeError.message, officeError.cause]
                  .filter(Boolean)
                  .join(" — ")}
              />
              <Button
                variant="secondary"
                size="sm"
                type="button"
                onClick={() => {
                  const failedFormat = officeError.format;
                  setOfficeError(null);
                  setOfficeRetryKey((value) => value + 1);
                  void (async () => {
                    try {
                      const file = findGeneratedFile(
                        localDeliverables,
                        failedFormat,
                      );
                      if (file?.contentBase64) {
                        downloadFromBase64({
                          base64: file.contentBase64,
                          fileName: file.fileName,
                          mimeType: file.mimeType,
                        });
                        return;
                      }
                      await downloadOfficeViaExportApi({
                        format: failedFormat,
                        content: isEditing ? editText : exportText,
                        assignment: result.assignment,
                        title: workspaceDeliverable.title || undefined,
                      });
                    } catch (error) {
                      const message =
                        failedFormat === "docx"
                          ? ui.work.wordGenerateFailed
                          : ui.work.pdfGenerateFailed;
                      const cause =
                        error && typeof error === "object" && "cause" in error
                          ? String((error as { cause?: unknown }).cause ?? "")
                          : error instanceof Error
                            ? error.message
                            : undefined;
                      console.error(
                        `[FinalOutput] ${failedFormat} retry failed`,
                        error,
                      );
                      setOfficeError({ format: failedFormat, message, cause });
                    }
                  })();
                }}
              >
                {ui.work.downloadRetry}
              </Button>
            </div>
          )}
        </div>

        <div className="space-y-3">
          <StepLabel step={3} label={ui.work.shareStep} />
          <div className="flex flex-wrap gap-3">
            <Button variant="secondary" size="sm" onClick={() => void handleCopy()}>
              {copied ? ui.work.copied : ui.work.copy}
            </Button>
            <Button variant="secondary" size="sm" onClick={() => void handleShare()}>
              {shared ? ui.work.shared : ui.work.share}
            </Button>
            <Button variant="secondary" size="sm" onClick={handleDriveSave}>
              {driveSaved ? ui.work.driveSaved : ui.work.saveToDrive}
            </Button>
          </div>
          {driveSaved && (
            <p className="text-sm text-[var(--foreground-muted)] animate-fade-in">
              {ui.work.driveSandboxSaved}
            </p>
          )}
        </div>

        <div className="space-y-3">
          <StepLabel step={4} label={ui.work.reeditStep} />
          <div className="flex flex-wrap gap-3">
            {!isEditing ? (
              <Button variant="secondary" size="sm" onClick={handleStartEdit}>
                {ui.work.reedit}
              </Button>
            ) : (
              <>
                <Button
                  variant="primary"
                  size="sm"
                  disabled={isRegeneratingFiles}
                  onClick={() => void handleApplyEdit()}
                >
                  {isRegeneratingFiles
                    ? ui.work.reediting
                    : ui.work.applyReedit}
                </Button>
                <Button
                  variant="secondary"
                  size="sm"
                  disabled={isRegeneratingFiles}
                  onClick={() => {
                    setIsEditing(false);
                    setReeditError(null);
                  }}
                >
                  {ui.actions.cancel}
                </Button>
              </>
            )}
          </div>
          <p className="text-caption text-[var(--foreground-muted)]">
            {ui.work.reeditHint}
          </p>
          {reeditError && <ErrorState message={reeditError} />}
        </div>

        {(isGeneratingDeliverables || isRegeneratingFiles) && (
          <p className="animate-soft-pulse text-caption">
            {ui.work.preparingFiles}
          </p>
        )}

        {deliverablesError && (
          <div>
            <ErrorState message={deliverablesError} />
          </div>
        )}

        {localDeliverables.length > 0 && (
          <p className="text-caption">
            {localDeliverables
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
