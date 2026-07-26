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
import { stashPendingAttachmentIds } from "@/lib/attachments/pending-session";
import type { DocumentExtractClient } from "@/lib/attachments/documents/client-upload";
import { assignmentImpliesImageWork } from "@/lib/vision/gate";

/** Home hero: ask + attach — then hand off to workspace with autostart. */
export function HomeChatBar() {
  const router = useRouter();
  const [input, setInput] = useState("");
  const [imageDrafts, setImageDrafts] = useState<LocalImageDraft[]>([]);
  const [documents, setDocuments] = useState<DocumentExtractClient[]>([]);
  const [error, setError] = useState<string | null>(null);

  const uploading = imageDrafts.some(
    (d) => d.status === "pending" || d.status === "uploading",
  );
  const uploadedIds = getUploadedAttachmentIds(imageDrafts);

  const submitToWork = () => {
    const trimmed = input.trim();
    if (!trimmed || uploading) return;

    if (assignmentImpliesImageWork(trimmed) && uploadedIds.length === 0 && documents.length === 0) {
      setError(
        "この依頼には画像またはファイルの添付が必要です。レシート・請求書・表などを添付してください。",
      );
      return;
    }

    stashPendingAttachmentIds(uploadedIds);
    if (documents.length > 0) {
      try {
        sessionStorage.setItem(
          "atlas.pendingDocumentExtracts",
          JSON.stringify(documents),
        );
      } catch {
        /* ignore quota */
      }
    } else {
      sessionStorage.removeItem("atlas.pendingDocumentExtracts");
    }

    setError(null);
    router.push(
      `/workspace?assignment=${encodeURIComponent(trimmed)}&autostart=1`,
    );
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

        {error && (
          <p className="mt-3 text-sm text-[var(--error)]">{error}</p>
        )}

        <div className="mt-5 pb-[env(safe-area-inset-bottom)]">
          <Button
            variant="primary"
            size="lg"
            className="h-14 w-full rounded-full text-base sm:h-16 sm:text-lg"
            onClick={submitToWork}
            disabled={!input.trim() || uploading}
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
