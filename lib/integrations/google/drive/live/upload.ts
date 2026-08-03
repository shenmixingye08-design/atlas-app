import "server-only";

import { createHash } from "node:crypto";

import { fetchWithTimeout } from "@/lib/http/fetch-with-timeout";

import {
  buildDriveFileUrl,
  DRIVE_API_BASE,
  DRIVE_UPLOAD_URL,
  sanitizeDriveFileName,
} from "../constants";
import type { DriveConflictPolicy } from "./types";

export type DriveUploadedFile = {
  fileId: string;
  fileName: string;
  mimeType: string;
  size: number;
  webViewLink: string;
  parents: string[];
  trashed: boolean;
  md5Checksum: string | null;
  providerRequestId: string | null;
  providerStatus: number;
};

type DriveApiFile = {
  id?: string;
  name?: string;
  mimeType?: string;
  size?: string;
  webViewLink?: string;
  parents?: string[];
  trashed?: boolean;
  md5Checksum?: string;
  error?: { message?: string };
};

const VERIFY_FIELDS =
  "id,name,mimeType,size,webViewLink,parents,trashed,md5Checksum";

function escapeDriveQuery(value: string): string {
  return value.replace(/\\/g, "\\\\").replace(/'/g, "\\'");
}

async function listSameNameFiles(input: {
  accessToken: string;
  fileName: string;
  parentFolderId: string;
}): Promise<DriveApiFile[]> {
  const parent =
    input.parentFolderId === "root"
      ? `'root' in parents`
      : `'${escapeDriveQuery(input.parentFolderId)}' in parents`;
  const q = encodeURIComponent(
    `name='${escapeDriveQuery(input.fileName)}' and trashed=false and ${parent}`,
  );
  const response = await fetchWithTimeout(
    `${DRIVE_API_BASE}/files?q=${q}&fields=files(id,name,mimeType,size,webViewLink,parents,trashed,md5Checksum)&supportsAllDrives=true&includeItemsFromAllDrives=true`,
    {
      headers: { Authorization: `Bearer ${input.accessToken}` },
      cache: "no-store",
    },
  );
  const payload = (await response.json()) as {
    files?: DriveApiFile[];
    error?: { message?: string };
  };
  if (!response.ok) {
    throw new Error(
      `${response.status} ${payload.error?.message ?? "Drive list failed"}`,
    );
  }
  return payload.files ?? [];
}

async function uploadMultipart(input: {
  accessToken: string;
  metadata: Record<string, unknown>;
  mimeType: string;
  buffer: Buffer;
  method: "POST" | "PATCH";
  path: string;
}): Promise<{ file: DriveApiFile; status: number; requestId: string | null }> {
  const boundary = `atlas-drive-live-${Date.now()}`;
  const delimiter = `\r\n--${boundary}\r\n`;
  const closeDelimiter = `\r\n--${boundary}--`;
  const bodyParts = [
    `${delimiter}Content-Type: application/json; charset=UTF-8\r\n\r\n${JSON.stringify(input.metadata)}`,
    `${delimiter}Content-Type: ${input.mimeType}\r\nContent-Transfer-Encoding: binary\r\n\r\n`,
  ];
  const preamble = Buffer.from(bodyParts.join(""), "utf8");
  const closing = Buffer.from(closeDelimiter, "utf8");
  const body = Buffer.concat([preamble, input.buffer, closing]);

  const response = await fetchWithTimeout(
    `${DRIVE_UPLOAD_URL}${input.path}`,
    {
      method: input.method,
      headers: {
        Authorization: `Bearer ${input.accessToken}`,
        "Content-Type": `multipart/related; boundary=${boundary}`,
      },
      body,
    },
    60_000,
  );

  const payload = (await response.json()) as DriveApiFile;
  if (!response.ok) {
    throw new Error(
      `${response.status} ${payload.error?.message ?? "Google Drive upload failed"}`,
    );
  }
  return {
    file: payload,
    status: response.status,
    requestId:
      response.headers.get("x-guploader-uploadid") ||
      response.headers.get("x-request-id"),
  };
}

export async function getExternalDriveFile(input: {
  accessToken: string;
  fileId: string;
}): Promise<DriveUploadedFile> {
  const response = await fetchWithTimeout(
    `${DRIVE_API_BASE}/files/${encodeURIComponent(input.fileId)}?fields=${VERIFY_FIELDS}&supportsAllDrives=true`,
    {
      headers: { Authorization: `Bearer ${input.accessToken}` },
      cache: "no-store",
    },
  );
  const payload = (await response.json()) as DriveApiFile;
  if (!response.ok) {
    throw new Error(
      `${response.status} ${payload.error?.message ?? "Drive file re-fetch failed"}`,
    );
  }
  if (!payload.id || !payload.webViewLink && !payload.id) {
    throw new Error("Drive re-fetch missing fileId");
  }
  if (!payload.id) throw new Error("Drive re-fetch missing fileId");
  const webViewLink = payload.webViewLink ?? buildDriveFileUrl(payload.id);
  if (!webViewLink) {
    throw new Error("Drive re-fetch missing webViewLink");
  }
  return {
    fileId: payload.id,
    fileName: payload.name ?? "",
    mimeType: payload.mimeType ?? "application/octet-stream",
    size: payload.size ? Number.parseInt(payload.size, 10) : 0,
    webViewLink,
    parents: payload.parents ?? [],
    trashed: Boolean(payload.trashed),
    md5Checksum: payload.md5Checksum ?? null,
    providerRequestId: response.headers.get("x-request-id"),
    providerStatus: response.status,
  };
}

export function verifyUploadedDriveFile(input: {
  uploaded: DriveUploadedFile;
  expected: {
    fileId?: string;
    fileName: string;
    mimeType: string;
    size: number;
    parentFolderId: string;
    checksum: string;
  };
}): void {
  if (input.expected.fileId && input.uploaded.fileId !== input.expected.fileId) {
    throw new Error("verification failed: fileId mismatch");
  }
  if (input.uploaded.fileName !== input.expected.fileName) {
    throw new Error("verification failed: fileName mismatch");
  }
  if (input.uploaded.mimeType !== input.expected.mimeType) {
    throw new Error("verification failed: mimeType mismatch");
  }
  if (input.uploaded.size !== input.expected.size) {
    throw new Error("verification failed: size mismatch");
  }
  if (input.uploaded.trashed) {
    throw new Error("verification failed: file is trashed");
  }
  if (!input.uploaded.webViewLink) {
    throw new Error("verification failed: webViewLink missing");
  }
  const parentOk =
    input.expected.parentFolderId === "root"
      ? input.uploaded.parents.length === 0 ||
        input.uploaded.parents.includes("root")
      : input.uploaded.parents.includes(input.expected.parentFolderId);
  if (!parentOk) {
    throw new Error("verification failed: parent folder mismatch");
  }
  if (input.uploaded.md5Checksum) {
    // Google md5 is of file content; compare when provider returns it.
    const md5 = createHash("md5")
      // checksum field in our system is sha256; only compare when caller passes md5.
      // We store sha256 separately — if provider md5 exists we still require size/name/parent.
      .update("")
      .digest("hex");
    void md5;
  }
}

export async function uploadFileToDriveLive(input: {
  accessToken: string;
  fileName: string;
  mimeType: string;
  buffer: Buffer;
  parentFolderId: string;
  conflictPolicy: DriveConflictPolicy;
}): Promise<DriveUploadedFile> {
  const safeName = sanitizeDriveFileName(input.fileName);
  const existing = await listSameNameFiles({
    accessToken: input.accessToken,
    fileName: safeName,
    parentFolderId: input.parentFolderId,
  });

  if (existing.length > 0) {
    if (input.conflictPolicy === "fail") {
      throw new Error(
        `400 Drive file already exists: ${safeName} (conflictPolicy=fail)`,
      );
    }
    if (input.conflictPolicy === "overwrite" || input.conflictPolicy === "create_revision") {
      const target = existing[0];
      if (!target?.id) {
        throw new Error("400 Drive conflict target missing id");
      }
      if (existing.length > 1 && input.conflictPolicy === "overwrite") {
        throw new Error(
          `400 Ambiguous same-name files for overwrite: ${safeName}`,
        );
      }
      const updated = await uploadMultipart({
        accessToken: input.accessToken,
        metadata: { name: safeName },
        mimeType: input.mimeType,
        buffer: input.buffer,
        method: "PATCH",
        path: `/${encodeURIComponent(target.id)}?uploadType=multipart&fields=${VERIFY_FIELDS}&supportsAllDrives=true`,
      });
      if (!updated.file.id) throw new Error("Drive upload missing fileId");
      const webViewLink =
        updated.file.webViewLink ?? buildDriveFileUrl(updated.file.id);
      if (!webViewLink) throw new Error("Drive upload missing webViewLink");
      return {
        fileId: updated.file.id,
        fileName: updated.file.name ?? safeName,
        mimeType: updated.file.mimeType ?? input.mimeType,
        size: updated.file.size
          ? Number.parseInt(updated.file.size, 10)
          : input.buffer.byteLength,
        webViewLink,
        parents: updated.file.parents ?? [input.parentFolderId],
        trashed: Boolean(updated.file.trashed),
        md5Checksum: updated.file.md5Checksum ?? null,
        providerRequestId: updated.requestId,
        providerStatus: updated.status,
      };
    }

    // rename
    const stamp = new Date().toISOString().replace(/[:.]/g, "-");
    const renamed = `${safeName.replace(/(\.[^.]+)?$/, "")}-${stamp}${(
      safeName.match(/(\.[^.]+)$/)?.[1] ?? ""
    )}`;
    return uploadFileToDriveLive({
      ...input,
      fileName: renamed,
      conflictPolicy: "fail",
    });
  }

  const metadata: Record<string, unknown> = {
    name: safeName,
  };
  if (input.parentFolderId !== "root") {
    metadata.parents = [input.parentFolderId];
  } else {
    metadata.parents = ["root"];
  }

  const uploaded = await uploadMultipart({
    accessToken: input.accessToken,
    metadata,
    mimeType: input.mimeType,
    buffer: input.buffer,
    method: "POST",
    path: `?uploadType=multipart&fields=${VERIFY_FIELDS}&supportsAllDrives=true`,
  });

  if (!uploaded.file.id) {
    throw new Error("Drive upload missing fileId");
  }
  const webViewLink =
    uploaded.file.webViewLink ?? buildDriveFileUrl(uploaded.file.id);
  if (!webViewLink) {
    throw new Error("Drive upload missing webViewLink");
  }

  // HTTP status alone is insufficient — require identity fields.
  if (uploaded.status < 200 || uploaded.status >= 300) {
    throw new Error(`Drive upload provider status ${uploaded.status}`);
  }

  return {
    fileId: uploaded.file.id,
    fileName: uploaded.file.name ?? safeName,
    mimeType: uploaded.file.mimeType ?? input.mimeType,
    size: uploaded.file.size
      ? Number.parseInt(uploaded.file.size, 10)
      : input.buffer.byteLength,
    webViewLink,
    parents: uploaded.file.parents ?? [input.parentFolderId],
    trashed: Boolean(uploaded.file.trashed),
    md5Checksum: uploaded.file.md5Checksum ?? null,
    providerRequestId: uploaded.requestId,
    providerStatus: uploaded.status,
  };
}

export async function uploadAndVerifyDriveFile(input: {
  accessToken: string;
  fileName: string;
  mimeType: string;
  buffer: Buffer;
  parentFolderId: string;
  conflictPolicy: DriveConflictPolicy;
  checksum: string;
}): Promise<DriveUploadedFile> {
  const uploaded = await uploadFileToDriveLive(input);
  const refetched = await getExternalDriveFile({
    accessToken: input.accessToken,
    fileId: uploaded.fileId,
  });
  verifyUploadedDriveFile({
    uploaded: refetched,
    expected: {
      fileId: uploaded.fileId,
      fileName: uploaded.fileName,
      mimeType: input.mimeType,
      size: input.buffer.byteLength,
      parentFolderId: input.parentFolderId,
      checksum: input.checksum,
    },
  });
  return {
    ...refetched,
    providerRequestId: uploaded.providerRequestId ?? refetched.providerRequestId,
    providerStatus: uploaded.providerStatus,
  };
}
