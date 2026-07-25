"use client";

import { useEffect, useMemo, useState, type ReactNode } from "react";

import { ArtifactDocumentPreview } from "@/components/workspace/artifact-document-preview";
import { ArtifactDownloadPanel } from "@/components/workspace/artifact-download-panel";
import { ArtifactSuggestionsPanel } from "@/components/workspace/artifact-suggestions-panel";
import { DocumentLayoutControls } from "@/components/workspace/document-layout-controls";
import type { ArtifactSuggestion } from "@/lib/artifact-engine/types";
import type { DocumentOutlineResponse } from "@/lib/deliverables/client";
import {
  assignmentIsImageToExcel,
  assignmentRequestsExcel,
} from "@/lib/deliverables/excel-data";
import type { DesignTemplateId } from "@/lib/deliverables/document-model";
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
  documentOutline?: DocumentOutlineResponse | null;
  designTemplate?: DesignTemplateId;
  onDesignTemplateChange?: (template: DesignTemplateId) => void;
  artifactLabel?: string | null;
  suggestions?: ArtifactSuggestion[];
  onRequestExcel?: () => void;
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

const DOWNLOAD_FORMAT_ORDER: GeneratedFile["format"][] = [
  "docx",
  "pdf",
  "xlsx",
  "pptx",
  "md",
];

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

function BlogTagsFooter({ deliverable }: { deliverable: WorkspaceDeliverable }) {
  const tags = getBlogTags(deliverable);
  if (tags.length === 0) return null;
  return (
    <p className="mt-6 text-sm text-[var(--foreground-muted)]">
      Tags: {tags.join(" · ")}
    </p>
  );
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
  documentOutline = null,
  designTemplate,
  onDesignTemplateChange,
  artifactLabel = null,
  suggestions = [],
  onRequestExcel,
}: FinalOutputProps) {
  const [copied, setCopied] = useState(false);
  const [driveSaved, setDriveSaved] = useState(false);
  const showDebug = isAtlasClientDebugEnabled();

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
    const assignment = result?.assignment ?? "";
    const generated = new Set(deliverables.map((item) => item.format));
    const wantsExcel =
      assignmentRequestsExcel(assignment) ||
      assignmentIsImageToExcel(assignment) ||
      generated.has("xlsx");

    if (expectedFormats && expectedFormats.length > 0) {
      const allowed = new Set<GeneratedFile["format"]>(expectedFormats);
      if (wantsExcel) allowed.add("xlsx");
      for (const format of generated) allowed.add(format);
      return DOWNLOAD_FORMAT_ORDER.filter((format) => allowed.has(format));
    }

    const base = new Set<GeneratedFile["format"]>(["docx", "pdf"]);
    if (wantsExcel) base.add("xlsx");
    for (const format of generated) {
      if (DOWNLOAD_FORMAT_ORDER.includes(format)) base.add(format);
    }
    return DOWNLOAD_FORMAT_ORDER.filter((format) => base.has(format));
  }, [expectedFormats, deliverables, result?.assignment]);

  const useStructuredPreview = useMemo(() => {
    if (!workspaceDeliverable) return false;
    const type = normalizeDeliverableForDisplay(workspaceDeliverable).type;
    return type !== "email" && type !== "social_post";
  }, [workspaceDeliverable]);

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

  const markdownFile = deliverables.find((item) => item.format === "md");
  const baseName = markdownFile?.fileName ?? `${workspaceDeliverable.type}-deliverable.md`;
  const normalized = normalizeDeliverableForDisplay(workspaceDeliverable);

  const handleCopy = async () => {
    await navigator.clipboard.writeText(exportText);
    setCopied(true);
    window.setTimeout(() => setCopied(false), 2000);
  };

  const handleDriveSave = () => {
    setDriveSaved(true);
  };

  return (
    <section className="space-y-6 animate-fade-in" aria-labelledby="output-heading">
      <div>
        <h2 id="output-heading" className="text-title text-foreground">
          {heading ?? ui.work.deliverableTitle}
        </h2>
        {artifactLabel ? (
          <p className="mt-1 text-sm text-[var(--foreground-muted)]">
            {ui.work.artifactReadyLabel(artifactLabel)}
          </p>
        ) : null}
        {!result.approved && (
          <p className="mt-1 text-caption text-[var(--status-warning)]">
            {ui.work.deliverableNeedsReview}
          </p>
        )}
      </div>

      <Card padding="lg" className="shadow-[var(--shadow-soft)]">
        <div className="max-h-[560px] overflow-auto rounded-[var(--radius-xl)] bg-[var(--background-subtle)] px-6 py-8">
          {useStructuredPreview ? (
            <>
              <ArtifactDocumentPreview
                assignment={result.assignment}
                content={exportText || getDocumentBody(normalized)}
                title={normalized.title}
              />
              {normalized.type === "blog" ? (
                <BlogTagsFooter deliverable={normalized} />
              ) : null}
            </>
          ) : normalized.type === "email" ? (
            <EmailPreview deliverable={normalized} />
          ) : (
            <SocialPostPreview deliverable={normalized} />
          )}
        </div>

        {showDebug && (
          <div className="mt-4">
            <DeliverableDebugPanel deliverable={workspaceDeliverable} />
          </div>
        )}

        {designTemplate && onDesignTemplateChange ? (
          <div className="mt-6">
            <DocumentLayoutControls
              designTemplate={designTemplate}
              onDesignTemplateChange={onDesignTemplateChange}
              documentOutline={documentOutline}
              disabled={isGeneratingDeliverables}
            />
          </div>
        ) : null}

        <div className="mt-6 space-y-4">
          <div className="flex flex-wrap gap-3">
            <Button variant="secondary" size="sm" onClick={() => void handleCopy()}>
              {copied ? ui.work.copied : ui.work.copy}
            </Button>
          </div>

          <ArtifactDownloadPanel
            deliverables={deliverables}
            isGeneratingDeliverables={isGeneratingDeliverables}
            exportText={exportText}
            markdownFileName={baseName}
            formatsToShow={fileFormatsToShow}
            onDriveSave={handleDriveSave}
            driveSaved={driveSaved}
          />
        </div>

        {driveSaved && (
          <p className="mt-4 text-sm text-[var(--foreground-muted)] animate-fade-in">
            {ui.work.driveSandboxSaved}
          </p>
        )}

        {isGeneratingDeliverables && (
          <p className="mt-4 animate-soft-pulse text-caption">
            {ui.work.preparingFiles}
          </p>
        )}

        {deliverablesError && (
          <div className="mt-4">
            <ErrorState message={deliverablesError} />
          </div>
        )}

        {deliverables.length > 0 && (
          <p className="mt-4 text-caption">
            {deliverables
              .map((item) => DELIVERABLE_FORMAT_LABELS[item.format])
              .join(" · ")}
          </p>
        )}

        <div className="mt-6">
          <ArtifactSuggestionsPanel
            suggestions={suggestions}
            onRequestExcel={onRequestExcel}
          />
        </div>
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
