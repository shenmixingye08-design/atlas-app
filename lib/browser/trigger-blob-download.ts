"use client";

/** Delay before revoking the object URL so Android Chrome can start the download. */
const REVOKE_DELAY_MS = 2_000;

/**
 * Trigger a file download via a temporary anchor + Blob URL.
 * Avoids window.open() (popup-blocked after async work on Android Chrome).
 */
export function triggerBlobDownload(blob: Blob, fileName: string): Promise<void> {
  if (blob.size === 0) {
    return Promise.reject(new Error("Empty file"));
  }

  return new Promise((resolve, reject) => {
    try {
      const objectUrl = URL.createObjectURL(blob);
      const anchor = document.createElement("a");
      anchor.href = objectUrl;
      anchor.download = fileName;
      anchor.rel = "noopener";
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
