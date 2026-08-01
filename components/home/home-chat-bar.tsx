"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

import { ui } from "@/lib/i18n";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/input";
import {
  getUploadedAttachmentIds,
  ImageAttachmentPicker,
  type LocalImageDraft,
} from "@/components/vision/image-attachment-picker";
import { RequestDocumentPicker } from "@/components/request/request-document-picker";
import type { DocumentExtractClient } from "@/lib/attachments/documents/client-upload";
import { assignmentImpliesImageWork } from "@/lib/vision/gate";
import { trackFunnelClient } from "@/lib/product-funnel/client";
import {
  buildWorkRequestSubmitPayload,
  stashPendingWorkRequestSubmit,
  type PreferredDeliverableFormat,
} from "@/lib/workspace/work-request-payload";

/**
 * Home hero: ask + attach.
 * Builds the SAME submit payload as WorkRequestForm, then hands it to
 * /workspace?autostart=1 which calls WorkspaceDashboard.handleSubmit.
 * Home must not invent its own metadata or job API path.
 */
export function HomeChatBar() {
  const router = useRouter();
  const [input, setInput] = useState("");
  const [imageDrafts, setImageDrafts] = useState<LocalImageDraft[]>([]);
  const [documents, setDocuments] = useState<DocumentExtractClient[]>([]);
  const [preferredFormat, setPreferredFormat] =
    useState<PreferredDeliverableFormat>("auto");
  const [error, setError] = useState<string | null>(null);

  const uploading = imageDrafts.some(
    (d) => d.status === "pending" || d.status === "uploading",
  );
  const uploadedIds = getUploadedAttachmentIds(imageDrafts);
  const failedImages = imageDrafts.filter((d) => d.status === "failed");

  const submitToWork = () => {
    const trimmed = input.trim();
    if (!trimmed || uploading) return;

    trackFunnelClient("first_request_started", {
      hasImages: uploadedIds.length > 0,
      hasDocuments: documents.length > 0,
      format: preferredFormat,
    });
    if (uploadedIds.length > 0 || documents.length > 0) {
      trackFunnelClient("attachment_added", {
        images: uploadedIds.length,
        documents: documents.length,
      });
    }

    if (failedImages.length > 0) {
      setError("アップロードに失敗した画像があります。削除するか再試行してください。");
      trackFunnelClient("error_shown", { code: "upload_failed" });
      return;
    }

    if (
      assignmentImpliesImageWork(trimmed) &&
      uploadedIds.length === 0 &&
      documents.length === 0
    ) {
      setError(
        "この依頼には画像またはファイルの添付が必要です。レシート・請求書・表などを添付してください。",
      );
      trackFunnelClient("error_shown", { code: "image_required" });
      return;
    }

    // Identical payload builder as 「お願いする」 / WorkRequestForm.
    const payload = buildWorkRequestSubmitPayload({
      assignment: trimmed,
      attachmentIds: uploadedIds,
      documents,
      preferredFormat,
    });
    stashPendingWorkRequestSubmit(payload);

    // Clear legacy handoff keys so workspace cannot rebuild a divergent payload.
    try {
      sessionStorage.removeItem("atlas.pendingDocumentExtracts");
    } catch {
      /* ignore */
    }

    setError(null);
    trackFunnelClient("first_request_submitted", {
      sample: false,
      format: preferredFormat,
    });
    // Assignment lives in the stashed payload (not the URL) so body/metadata
    // cannot diverge and long Japanese prompts are not truncated.
    router.push("/workspace?autostart=1");
  };

  return (
    <section aria-labelledby="home-ask-heading" className="space-y-5 overflow-x-hidden">
      <h2
        id="home-ask-heading"
        className="text-center text-2xl font-semibold tracking-tight text-foreground sm:text-3xl"
      >
        {ui.secretaryHome.askTitle}
      </h2>

      <div className="space-y-2">
        <p className="text-center text-sm font-medium text-foreground">
          {ui.secretaryHome.firstJobTitle}
        </p>
        <p className="text-center text-xs text-[var(--foreground-muted)]">
          {ui.secretaryHome.firstJobHint}
        </p>
        <div className="flex flex-wrap justify-center gap-2">
          {ui.secretaryHome.exampleJobs.map((job) => (
            <button
              key={job.id}
              type="button"
              className="min-h-[44px] rounded-full border border-[var(--border-subtle)] bg-[var(--surface)] px-3 py-2 text-sm text-foreground transition hover:border-[#74172A] hover:text-[#74172A]"
              onClick={() => {
                setInput(job.assignment);
                setError(null);
                trackFunnelClient("sample_select", { sampleId: job.id });
              }}
            >
              {job.label}
            </button>
          ))}
        </div>
      </div>

      <div className="rounded-[28px] border border-[var(--border-subtle)] bg-[var(--card)] p-4 shadow-[var(--shadow-md)] sm:p-6">
        <Textarea
          value={input}
          onChange={(e) => setInput(e.target.value)}
          rows={5}
          placeholder={ui.secretaryHome.askPlaceholder}
          aria-label={ui.secretaryHome.askTitle}
          className="min-h-[140px] resize-y border-none bg-transparent px-1 py-1 text-lg leading-relaxed shadow-none focus:ring-0"
          onKeyDown={(e) => {
            if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) {
              e.preventDefault();
              submitToWork();
            }
          }}
        />

        <div className="mt-4 space-y-3 border-t border-[var(--border-subtle)] pt-4">
          <p className="text-sm font-medium text-foreground">
            {ui.work.attachmentsLabel}
          </p>
          <p className="text-xs text-[var(--foreground-muted)]">
            {ui.secretaryHome.attachHint}
          </p>
          <ImageAttachmentPicker
            value={imageDrafts}
            onChange={setImageDrafts}
            preferReadableText
          />
          <RequestDocumentPicker value={documents} onChange={setDocuments} />
        </div>

        <label className="mt-4 block text-sm">
          <span className="font-medium text-foreground">成果物形式</span>
          <select
            className="mt-1 min-h-[44px] w-full rounded-lg border border-[var(--border-subtle)] bg-[var(--surface)] px-3 py-2"
            value={preferredFormat}
            onChange={(event) =>
              setPreferredFormat(
                event.target.value as PreferredDeliverableFormat,
              )
            }
          >
            <option value="auto">自動判定（おすすめ）</option>
            <option value="xlsx">Excel</option>
            <option value="docx">Word</option>
            <option value="pdf">PDF</option>
            <option value="pptx">PowerPoint</option>
            <option value="txt">テキスト</option>
          </select>
        </label>

        {error && (
          <p className="mt-3 text-sm text-[var(--error)]">{error}</p>
        )}

        <div className="mt-5 pb-[env(safe-area-inset-bottom)]">
          <Button
            variant="primary"
            size="lg"
            className="h-14 w-full rounded-full text-base sm:h-16 sm:text-lg"
            onClick={submitToWork}
            disabled={!input.trim() || uploading || failedImages.length > 0}
            isLoading={uploading}
          >
            {uploading ? "アップロード中…" : ui.secretaryHome.askSubmit}
          </Button>
          <p className="mt-3 text-center text-sm text-[var(--foreground-muted)]">
            {ui.secretaryHome.askHint}
          </p>
        </div>
      </div>
    </section>
  );
}
