"use client";

import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";

import { ui } from "@/lib/i18n";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/input";
import {
  getUploadedAttachmentIds,
  ImageAttachmentPicker,
  type LocalImageDraft,
} from "@/components/vision/image-attachment-picker";
import {
  buildWorkRequestSubmitPayload,
  stashPendingWorkRequestSubmit,
} from "@/lib/workspace/work-request-payload";

/**
 * Phase3 first-run — one wow job: photo → work document.
 * Ask + optional photo + 任せる. No tutorials / formats / tech labels.
 */
export function HomeChatBar() {
  const router = useRouter();
  const [input, setInput] = useState("");
  const [imageDrafts, setImageDrafts] = useState<LocalImageDraft[]>([]);

  const uploading = imageDrafts.some(
    (d) => d.status === "pending" || d.status === "uploading",
  );
  const uploadedIds = getUploadedAttachmentIds(imageDrafts);
  const failedImages = imageDrafts.filter((d) => d.status === "failed");

  // When a photo arrives with empty input, seed the single wow example.
  useEffect(() => {
    if (uploadedIds.length > 0 && !input.trim()) {
      setInput(ui.secretaryHome.askPlaceholder);
    }
  }, [uploadedIds.length, input]);

  const submitToWork = () => {
    const trimmed = input.trim() || ui.secretaryHome.askPlaceholder;
    if (!trimmed || uploading || failedImages.length > 0) return;

    const payload = buildWorkRequestSubmitPayload({
      assignment: trimmed,
      attachmentIds: uploadedIds,
      documents: [],
      preferredFormat: "auto",
    });
    stashPendingWorkRequestSubmit(payload);

    try {
      sessionStorage.removeItem("atlas.pendingDocumentExtracts");
    } catch {
      /* ignore */
    }

    router.push("/workspace?autostart=1");
  };

  const canSubmit =
    (input.trim().length > 0 || uploadedIds.length > 0) &&
    !uploading &&
    failedImages.length === 0;

  return (
    <section aria-labelledby="home-ask-heading" className="space-y-5 overflow-x-hidden">
      <h1
        id="home-ask-heading"
        className="text-center text-2xl font-semibold tracking-tight text-foreground sm:text-3xl"
      >
        {ui.secretaryHome.askTitle}
      </h1>

      <div className="rounded-[28px] border border-[var(--border-subtle)] bg-[var(--card)] p-4 shadow-[var(--shadow-md)] sm:p-6">
        <Textarea
          value={input}
          onChange={(e) => setInput(e.target.value)}
          rows={4}
          placeholder={ui.secretaryHome.askPlaceholder}
          aria-label={ui.secretaryHome.askTitle}
          className="min-h-[120px] resize-y border-none bg-transparent px-1 py-1 text-lg leading-relaxed shadow-none focus:ring-0"
          onKeyDown={(e) => {
            if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) {
              e.preventDefault();
              submitToWork();
            }
          }}
        />

        <div className="mt-4">
          <ImageAttachmentPicker
            value={imageDrafts}
            onChange={setImageDrafts}
            preferReadableText
            variant="firstRun"
          />
        </div>

        <div className="mt-5 pb-[env(safe-area-inset-bottom)]">
          <Button
            variant="primary"
            size="lg"
            className="h-14 w-full rounded-full text-base sm:h-16 sm:text-lg"
            onClick={submitToWork}
            disabled={!canSubmit}
            isLoading={uploading}
          >
            {ui.secretaryHome.askSubmit}
          </Button>
        </div>
      </div>
    </section>
  );
}
