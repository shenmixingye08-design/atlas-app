"use client";

/** Delay before revoking the object URL so Android Chrome can start the download. */
const REVOKE_DELAY_MS = 2_000;

/**
 * Trigger a file download via a temporary anchor + Blob URL.
 * Avoids window.open() (popup-blocked after async work on Android Chrome).
 *
 * Requires a completed binary Blob (never string-built text posing as .docx).
 */
export function triggerBlobDownload(blob: Blob, fileName: string): Promise<void> {
  if (blob.size === 0) {
    return Promise.reject(new Error("Empty file"));
  }

  const safeName = fileName.trim() || "download.bin";
  const mime = (blob.type || "").split(";")[0]?.trim().toLowerCase() ?? "";
  if (
    mime === "text/plain" ||
    mime === "application/json" ||
    mime === "application/octet-stream"
  ) {
    // Office / PDF downloads must never use these MIME types.
    if (/\.(docx|xlsx|pptx|pdf)$/i.test(safeName)) {
      return Promise.reject(
        new Error(
          `Refusing download with forbidden MIME "${mime}" for ${safeName}`,
        ),
      );
    }
  }

  return new Promise((resolve, reject) => {
    try {
      const objectUrl = URL.createObjectURL(blob);
      const anchor = document.createElement("a");
      anchor.href = objectUrl;
      anchor.download = safeName;
      anchor.rel = "noopener";
      // Hint browsers that this is a download, not navigation/preview.
      anchor.setAttribute("type", blob.type || "application/octet-stream");
      anchor.style.display = "none";
      document.body.appendChild(anchor);
      anchor.click();

      window.setTimeout(() => {
        anchor.remove();
        URL.revokeObjectURL(objectUrl);
        resolve();
      }, REVOKE_DELAY_MS);
    } catch (error) {
      reject(error instanceof Error ? error : new Error("Download failed"));
    }
  });
}
