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
import {
  shouldShowAdvancedRequestControls,
  shouldShowDeliverableFormatPicker,
} from "@/lib/product-clarity/first-run";
import { assignmentImpliesImageWork } from "@/lib/vision/gate";
import {
  buildWorkRequestSubmitPayload,
  stashPendingWorkRequestSubmit,
  type PreferredDeliverableFormat,
} from "@/lib/workspace/work-request-payload";

/**
 * Home hero: ask + attach.
 * Builds the SAME submit payload as WorkRequestForm, then hands it to
 * /workspace?autostart=1 which calls WorkspaceDashboard.handleSubmit.
 * First-run clarity: hide Word/Excel/PDF and attachments until needed.
 */
export function HomeChatBar() {
  const router = useRouter();
  const [input, setInput] = useState("");
  const [imageDrafts, setImageDrafts] = useState<LocalImageDraft[]>([]);
  const [documents, setDocuments] = useState<DocumentExtractClient[]>([]);
  const [preferredFormat, setPreferredFormat] =
    useState<PreferredDeliverableFormat>("auto");
  const [error, setError] = useState<string | null>(null);
  const [showAttach, setShowAttach] = useState(false);
  const [showFormat, setShowFormat] = useState(false);

  const advancedUnlocked = shouldShowAdvancedRequestControls();
  const formatUnlocked = shouldShowDeliverableFormatPicker();

  const uploading = imageDrafts.some(
    (d) => d.status === "pending" || d.status === "uploading",
  );
  const uploadedIds = getUploadedAttachmentIds(imageDrafts);
  const failedImages = imageDrafts.filter((d) => d.status === "failed");

  const submitToWork = () => {
    const trimmed = input.trim();
    if (!trimmed || uploading) return;

    if (failedImages.length > 0) {
      setError("アップロードに失敗した画像があります。削除するか再試行してください。");
      return;
    }

    if (
      assignmentImpliesImageWork(trimmed) &&
      uploadedIds.length === 0 &&
      documents.length === 0
    ) {
      setShowAttach(true);
      setError(
        "この依頼には画像またはファイルの添付が必要です。レシート・請求書・表などを添付してください。",
      );
      return;
    }

    const payload = buildWorkRequestSubmitPayload({
      assignment: trimmed,
      attachmentIds: uploadedIds,
      documents,
      preferredFormat: formatUnlocked ? preferredFormat : "auto",
    });
    stashPendingWorkRequestSubmit(payload);

    try {
      sessionStorage.removeItem("atlas.pendingDocumentExtracts");
    } catch {
      /* ignore */
    }

    setError(null);
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

        {(advancedUnlocked || showAttach) && (
          <div className="mt-4 space-y-3 border-t border-[var(--border-subtle)] pt-4">
            <p className="text-sm font-medium text-foreground">
              {ui.work.attachmentsLabel}
            </p>
            <ImageAttachmentPicker
              value={imageDrafts}
              onChange={setImageDrafts}
              preferReadableText
            />
            <RequestDocumentPicker value={documents} onChange={setDocuments} />
          </div>
        )}

        {!advancedUnlocked && !showAttach && (
          <button
            type="button"
            onClick={() => setShowAttach(true)}
            className="mt-4 text-sm text-[var(--foreground-muted)] underline-offset-2 hover:text-foreground hover:underline"
          >
            {ui.secretaryHome.attachToggle}
          </button>
        )}

        {formatUnlocked && (
          <>
            {!showFormat ? (
              <button
                type="button"
                onClick={() => setShowFormat(true)}
                className="mt-3 block text-sm text-[var(--foreground-muted)] underline-offset-2 hover:text-foreground hover:underline"
              >
                {ui.secretaryHome.formatToggle}
              </button>
            ) : (
              <label className="mt-4 block text-sm">
                <span className="font-medium text-foreground">
                  {ui.secretaryHome.formatLabel}
                </span>
                <select
                  className="mt-1 min-h-[44px] w-full rounded-lg border border-[var(--border-subtle)] bg-[var(--surface)] px-3 py-2"
                  value={preferredFormat}
                  onChange={(event) =>
                    setPreferredFormat(
                      event.target.value as PreferredDeliverableFormat,
                    )
                  }
                >
                  <option value="auto">自動判定</option>
                  <option value="xlsx">Excel</option>
                  <option value="docx">Word</option>
                  <option value="pptx">PowerPoint</option>
                  <option value="pdf">PDF</option>
                  <option value="txt">テキスト</option>
                </select>
              </label>
            )}
          </>
        )}

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
