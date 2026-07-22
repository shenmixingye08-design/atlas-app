import type { AttachmentKind, AttachmentMetadataItem } from "./types";
import {
  IMAGE_FETCH_FAILED_MESSAGE,
  IMAGE_TOO_LARGE_MESSAGE,
  MAX_IMAGE_UPLOAD_BYTES,
  UNSUPPORTED_IMAGE_TYPE_MESSAGE,
} from "./types";
import { isImageMimeType } from "./metadata";

export type UploadedAttachmentResult =
  | {
      ok: true;
      item: AttachmentMetadataItem;
    }
  | {
      ok: false;
      item: AttachmentMetadataItem;
      error: string;
    };

type UploadApiSuccess = {
  id: string;
  fileName: string;
  mimeType: string;
  sizeBytes: number;
  kind: string;
  url: string;
  signedUrl?: string;
};

type UploadApiError = {
  status?: string;
  code?: string;
  message?: string;
};

function guessKind(file: File, fallback: AttachmentKind): AttachmentKind {
  if (isImageMimeType(file.type) || fallback === "photo") return "photo";
  return fallback;
}

/**
 * Upload a single image file to ATLAS attachment storage.
 * Non-image files are returned as filename-only metadata (no storage).
 */
export async function uploadWorkAttachment(input: {
  file: File;
  kind: AttachmentKind;
}): Promise<UploadedAttachmentResult> {
  const kind = guessKind(input.file, input.kind);
  const looksLikeImage =
    isImageMimeType(input.file.type) ||
    kind === "photo" ||
    /\.(png|jpe?g|gif|webp|bmp|heic|heif)$/i.test(input.file.name);

  const base: AttachmentMetadataItem = {
    name: input.file.name,
    kind,
    mimeType: input.file.type || null,
    size: input.file.size,
    contentAvailable: false,
  };

  if (!looksLikeImage) {
    return {
      ok: true,
      item: {
        ...base,
        note: null,
      },
    };
  }

  if (input.file.size > MAX_IMAGE_UPLOAD_BYTES) {
    return {
      ok: false,
      item: {
        ...base,
        kind: "photo",
        fetchFailed: true,
        note: IMAGE_TOO_LARGE_MESSAGE,
      },
      error: IMAGE_TOO_LARGE_MESSAGE,
    };
  }

  try {
    const form = new FormData();
    form.append("file", input.file);
    form.append("kind", "photo");

    const response = await fetch("/api/attachments/upload", {
      method: "POST",
      body: form,
    });

    if (!response.ok) {
      const payload = (await response.json().catch(() => null)) as UploadApiError | null;
      const message =
        payload?.message ||
        (response.status === 415
          ? UNSUPPORTED_IMAGE_TYPE_MESSAGE
          : response.status === 413
            ? IMAGE_TOO_LARGE_MESSAGE
            : IMAGE_FETCH_FAILED_MESSAGE);
      return {
        ok: false,
        item: {
          ...base,
          kind: "photo",
          fetchFailed: true,
          note: message,
        },
        error: message,
      };
    }

    const payload = (await response.json()) as UploadApiSuccess;
    return {
      ok: true,
      item: {
        name: payload.fileName || input.file.name,
        kind: "photo",
        mimeType: payload.mimeType || input.file.type || "image/jpeg",
        size: payload.sizeBytes || input.file.size,
        contentAvailable: true,
        storageId: payload.id,
        imageUrl: payload.url,
        fetchFailed: false,
        note: null,
      },
    };
  } catch {
    return {
      ok: false,
      item: {
        ...base,
        kind: "photo",
        fetchFailed: true,
        note: IMAGE_FETCH_FAILED_MESSAGE,
      },
      error: IMAGE_FETCH_FAILED_MESSAGE,
    };
  }
}

export async function uploadWorkAttachments(
  files: Array<{ file: File; kind: AttachmentKind }>,
): Promise<AttachmentMetadataItem[]> {
  const results = await Promise.all(
    files.map((entry) => uploadWorkAttachment(entry)),
  );
  return results.map((result) => result.item);
}
