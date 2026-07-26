"use client";

import { useEffect, useMemo, useState } from "react";

import { ArtifactDocumentPreview } from "@/components/workspace/artifact-document-preview";
import { ArtifactDownloadPanel } from "@/components/workspace/artifact-download-panel";
import { ArtifactQualityAssistPanel } from "@/components/workspace/artifact-quality-assist-panel";
import { ArtifactSuggestionsPanel } from "@/components/workspace/artifact-suggestions-panel";
import { DocumentLayoutControls } from "@/components/workspace/document-layout-controls";
import type { ArtifactDocument } from "@/lib/artifact-engine/document";
import type { OrgAssistProfile } from "@/lib/artifact-engine/org-assist-store";
import { loadOrgAssistProfile } from "@/lib/artifact-engine/org-assist-store";
import type { ArtifactTemplateId } from "@/lib/artifact-engine/templates/types";
import type { ArtifactSuggestion } from "@/lib/artifact-engine/types";
import type { DocumentOutlineResponse } from "@/lib/deliverables/client";
import type { Deliverable as GeneratedFile } from "@/lib/deliverables/types";
import { isAtlasClientDebugEnabled } from "@/lib/debug/atlas-debug";
import {
  deliverableHasContent,
  type Deliverable as WorkspaceDeliverable,
} from "@/lib/orchestration/deliverable-types";
import {
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
  expectedFormats?: GeneratedFile["format"][];
  heading?: string;
  documentOutline?: DocumentOutlineResponse | null;
  designTemplate?: ArtifactTemplateId;
  recommendedTemplate?: ArtifactTemplateId | null;
  onDesignTemplateChange?: (template: ArtifactTemplateId) => void;
  artifactLabel?: string | null;
  templateLabel?: string | null;
  suggestions?: ArtifactSuggestion[];
  artifactDocument?: ArtifactDocument | null;
  completionStatus?: ArtifactDocument["completionStatus"] | null;
  onRequestExcel?: () => void;
};

function CollapsibleSection({
  title,
  children,
}: {
  title: string;
  children: React.ReactNode;
}) {
  return (
    <details className="group rounded-[var(--radius-lg)] border border-[var(--border-subtle)] bg-[var(--background-muted)]/40 px-4 py-3">
      <summary className="cursor-pointer text-sm font-semibold text-[var(--foreground-muted)]">
        {title}
      </summary>
      <div className="mt-3 text-base leading-relaxed text-foreground">{children}</div>
    </details>
  );
}

function EmailPreview({ deliverable }: { deliverable: WorkspaceDeliverable }) {
  const { subject, body, summary } = getEmailDisplayFields(deliverable);
  return (
    <div className="space-y-4">
      <h1 className="text-2xl font-semibold text-foreground">営業メール</h1>
      <section className="space-y-2">
        <h2 className="text-sm font-semibold text-[var(--foreground-muted)]">件名</h2>
        <p className="whitespace-pre-wrap text-base">{sanitizeBodyTextForDisplay(subject) || "（件名なし）"}</p>
      </section>
      <section className="space-y-2">
        <h2 className="text-sm font-semibold text-[var(--foreground-muted)]">本文</h2>
        <p className="whitespace-pre-wrap text-base leading-relaxed">
          {sanitizeBodyTextForDisplay(body)}
        </p>
      </section>
      {summary ? (
        <p className="text-sm text-[var(--foreground-muted)]">
          {sanitizeBodyTextForDisplay(summary)}
        </p>
      ) : null}
    </div>
  );
}

function SocialPostPreview({ deliverable }: { deliverable: WorkspaceDeliverable }) {
  const posts = getSocialPostCards(deliverable);
  return (
    <div className="space-y-4">
      {deliverable.title ? (
        <h1 className="text-2xl font-semibold text-foreground">{deliverable.title}</h1>
      ) : null}
      {posts.map((post, index) => (
        <Card key={`post-${index + 1}`} padding="md">
          <p className="mb-2 text-xs font-semibold text-[var(--foreground-muted)]">
            投稿 {index + 1}
          </p>
          <p className="whitespace-pre-wrap text-base leading-relaxed">
            {sanitizeBodyTextForDisplay(post)}
          </p>
        </Card>
      ))}
    </div>
  );
}

function statusLabel(status: ArtifactDocument["completionStatus"] | null | undefined): string {
  if (status === "ready") return "完成";
  if (status === "needs_input") return "入力不足あり";
  if (status === "partial") return "一部完成";
  if (status === "failed") return "要確認";
  return "準備中";
}

export function FinalOutput({
  result,
  isLoading,
  deliverables = [],
  isGeneratingDeliverables = false,
  deliverablesError = null,
  heading,
  designTemplate,
  recommendedTemplate = null,
  onDesignTemplateChange,
  artifactLabel = null,
  templateLabel = null,
  suggestions = [],
  artifactDocument = null,
  completionStatus = null,
  onRequestExcel,
}: FinalOutputProps) {
  const [copied, setCopied] = useState(false);
  const [driveSaved, setDriveSaved] = useState(false);
  const [orgProfile, setOrgProfile] = useState<OrgAssistProfile>(() =>
    loadOrgAssistProfile(),
  );
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

  const normalized = useMemo(
    () =>
      workspaceDeliverable
        ? normalizeDeliverableForDisplay(workspaceDeliverable)
        : null,
    [workspaceDeliverable],
  );

  const useStructuredPreview =
    normalized &&
    normalized.type !== "email" &&
    normalized.type !== "social_post";

  const formatStates = artifactDocument?.formatStates ?? [];

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

  if (isLoading || !result) return null;

  if (!isReady || !workspaceDeliverable || !normalized) {
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
          <p className="whitespace-pre-wrap text-sm leading-relaxed text-[var(--foreground-muted)]">
            {failureMessage}
          </p>
        </Card>
      </section>
    );
  }

  // Guard: never show raw JSON as the main body
  const rawBody = getDocumentBody(normalized);
  const safeExport =
    isDeliverableJsonText(exportText) || isDeliverableJsonText(rawBody)
      ? ""
      : exportText || rawBody;

  const markdownFile = deliverables.find((item) => item.format === "md");
  const baseName = markdownFile?.fileName ?? `${normalized.type}-deliverable.md`;
  const recommendedLabels = (
    artifactDocument?.recommendedFormats ?? []
  ).map((format) => {
    if (format === "docx") return "Word";
    if (format === "xlsx") return "Excel";
    if (format === "pptx") return "PowerPoint";
    return format.toUpperCase();
  });

  return (
    <section className="space-y-6 animate-fade-in" aria-labelledby="output-heading">
      {/* 1. Title */}
      <div className="space-y-2">
        <h2 id="output-heading" className="text-title text-foreground">
          {heading ?? artifactDocument?.title ?? ui.work.deliverableTitle}
        </h2>
        {/* 2. Type + recommended formats */}
        <p className="text-sm text-[var(--foreground-muted)]">
          {[
            artifactLabel || artifactDocument?.artifactLabel,
            templateLabel || artifactDocument?.templateLabel,
            recommendedLabels.length > 0
              ? `推奨: ${recommendedLabels.join(" / ")}`
              : null,
            statusLabel(completionStatus ?? artifactDocument?.completionStatus),
          ]
            .filter(Boolean)
            .join(" · ")}
        </p>
        {!result.approved && (
          <p className="text-caption text-[var(--status-warning)]">
            {ui.work.deliverableNeedsReview}
          </p>
        )}
        {(completionStatus ?? artifactDocument?.completionStatus) === "needs_input" ? (
          <p className="text-sm text-[var(--status-warning)]">
            必要な情報が不足しています。下の品質向上から入力してください。
          </p>
        ) : null}
      </div>

      <Card padding="lg" className="space-y-6 shadow-[var(--shadow-soft)]">
        {/* 3. Preview */}
        <div className="rounded-[var(--radius-xl)] bg-[var(--background-subtle)] px-3 py-4 sm:px-6 sm:py-6">
          {useStructuredPreview ? (
            <ArtifactDocumentPreview
              assignment={result.assignment}
              content={safeExport}
              title={normalized.title}
              templateOverride={designTemplate}
              orgProfile={orgProfile}
            />
          ) : normalized.type === "email" ? (
            <EmailPreview deliverable={normalized} />
          ) : (
            <SocialPostPreview deliverable={normalized} />
          )}
        </div>

        {showDebug ? (
          <CollapsibleSection title="Deliverable JSON (debug)">
            <pre className="overflow-x-auto whitespace-pre-wrap break-words font-mono text-xs text-[var(--foreground-muted)]">
              {JSON.stringify(workspaceDeliverable, null, 2)}
            </pre>
          </CollapsibleSection>
        ) : null}

        {/* 4. Template switch */}
        {designTemplate && onDesignTemplateChange ? (
          <DocumentLayoutControls
            designTemplate={designTemplate}
            recommendedTemplate={recommendedTemplate}
            onDesignTemplateChange={onDesignTemplateChange}
            disabled={isGeneratingDeliverables}
          />
        ) : null}

        {/* 5. Quality assist */}
        {artifactDocument && artifactDocument.missingFields.length > 0 ? (
          <ArtifactQualityAssistPanel
            missingFields={artifactDocument.missingFields}
            onProfileChange={setOrgProfile}
          />
        ) : null}

        <ArtifactSuggestionsPanel
          suggestions={suggestions.filter((item) => item.kind !== "quality_gap")}
          onRequestExcel={onRequestExcel}
        />

        {/* 6-7. Download + Drive */}
        <div className="space-y-3">
          <div className="flex flex-wrap gap-3">
            <Button
              variant="secondary"
              size="sm"
              onClick={() => {
                void navigator.clipboard.writeText(safeExport || exportText);
                setCopied(true);
                window.setTimeout(() => setCopied(false), 2000);
              }}
            >
              {copied ? ui.work.copied : "コピー"}
            </Button>
          </div>

          <ArtifactDownloadPanel
            deliverables={deliverables}
            formatStates={formatStates}
            isGeneratingDeliverables={isGeneratingDeliverables}
            exportText={safeExport || exportText}
            markdownFileName={baseName}
            onDriveSave={() => setDriveSaved(true)}
            driveSaved={driveSaved}
          />
        </div>

        {driveSaved ? (
          <p className="text-sm text-[var(--foreground-muted)]">
            {ui.work.driveSandboxSaved}
          </p>
        ) : null}

        {isGeneratingDeliverables ? (
          <p className="animate-soft-pulse text-caption">{ui.work.preparingFiles}</p>
        ) : null}

        {deliverablesError ? <ErrorState message={deliverablesError} /> : null}

        {artifactDocument?.excelNotApplicable ? (
          <p className="text-sm text-[var(--foreground-muted)]">
            Excel: 対象外 — {artifactDocument.excelNotApplicableReason}
          </p>
        ) : null}
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
