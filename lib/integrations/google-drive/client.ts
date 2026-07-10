import "server-only";

import { serverCredentialRepository } from "../repositories/server-credential-repository";
import type { OAuthCredentialRecord } from "../types";

import {
  GOOGLE_DRIVE_API_BASE,
  GOOGLE_DRIVE_UPLOAD_URL,
  ATLAS_PROJECTS_FOLDER,
  ATLAS_ROOT_FOLDER,
  buildDriveFileUrl,
  buildDriveFolderUrl,
  sanitizeDriveFolderName,
} from "./config";
import { refreshGoogleAccessToken } from "./oauth";

type DriveFile = {
  id: string;
  name: string;
  webViewLink?: string;
};

function isTokenExpired(expiresAt: string): boolean {
  return new Date(expiresAt).getTime() <= Date.now() + 60_000;
}

async function getValidAccessToken(integrationId: string): Promise<string> {
  const credentials = await serverCredentialRepository.findByIntegrationId(
    integrationId,
  );

  if (!credentials) {
    throw new Error("Google Drive credentials not found. Reconnect the integration.");
  }

  if (!isTokenExpired(credentials.expiresAt)) {
    return credentials.accessToken;
  }

  const refreshed = await refreshGoogleAccessToken(credentials.refreshToken);
  const expiresAt = new Date(
    Date.now() + refreshed.expires_in * 1000,
  ).toISOString();

  await serverCredentialRepository.save({
    ...credentials,
    accessToken: refreshed.access_token,
    refreshToken: refreshed.refresh_token ?? credentials.refreshToken,
    expiresAt,
    scope: refreshed.scope ?? credentials.scope,
    updatedAt: new Date().toISOString(),
  });

  return refreshed.access_token;
}

async function driveRequest<T>(
  integrationId: string,
  path: string,
  init: RequestInit = {},
): Promise<T> {
  const accessToken = await getValidAccessToken(integrationId);

  const response = await fetch(`${GOOGLE_DRIVE_API_BASE}${path}`, {
    ...init,
    headers: {
      Authorization: `Bearer ${accessToken}`,
      ...(init.headers ?? {}),
    },
  });

  const payload = (await response.json()) as T & {
    error?: { message?: string; code?: number };
  };

  if (!response.ok) {
    throw new Error(
      payload.error?.message ??
        `Google Drive API request failed (${response.status})`,
    );
  }

  return payload;
}

async function findFolderByName(
  integrationId: string,
  name: string,
  parentId?: string,
): Promise<DriveFile | null> {
  const escapedName = name.replace(/'/g, "\\'");
  const parentClause = parentId ? ` and '${parentId}' in parents` : "";
  const query = encodeURIComponent(
    `name='${escapedName}' and mimeType='application/vnd.google-apps.folder' and trashed=false${parentClause}`,
  );

  const result = await driveRequest<{ files: DriveFile[] }>(
    integrationId,
    `/files?q=${query}&fields=files(id,name,webViewLink)&spaces=drive`,
  );

  return result.files[0] ?? null;
}

async function createFolder(
  integrationId: string,
  name: string,
  parentId?: string,
): Promise<DriveFile> {
  const metadata: Record<string, unknown> = {
    name,
    mimeType: "application/vnd.google-apps.folder",
  };

  if (parentId) metadata.parents = [parentId];

  return driveRequest<DriveFile>(integrationId, "/files", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(metadata),
  });
}

async function findOrCreateFolder(
  integrationId: string,
  name: string,
  parentId?: string,
): Promise<DriveFile> {
  const existing = await findFolderByName(integrationId, name, parentId);
  if (existing) return existing;
  return createFolder(integrationId, name, parentId);
}

export async function resolveProjectFolder(
  integrationId: string,
  projectName: string,
): Promise<{ folderId: string; storagePath: string; folderUrl: string }> {
  const safeProjectName = sanitizeDriveFolderName(projectName);

  const atlasFolder = await findOrCreateFolder(integrationId, ATLAS_ROOT_FOLDER);
  const projectsFolder = await findOrCreateFolder(
    integrationId,
    ATLAS_PROJECTS_FOLDER,
    atlasFolder.id,
  );
  const projectFolder = await findOrCreateFolder(
    integrationId,
    safeProjectName,
    projectsFolder.id,
  );

  const storagePath = `${ATLAS_ROOT_FOLDER}/${ATLAS_PROJECTS_FOLDER}/${safeProjectName}`;

  return {
    folderId: projectFolder.id,
    storagePath,
    folderUrl: buildDriveFolderUrl(projectFolder.id),
  };
}

export async function uploadFileToDrive(
  integrationId: string,
  input: {
    fileName: string;
    mimeType: string;
    buffer: Buffer;
    parentFolderId: string;
  },
): Promise<{ fileId: string; fileUrl: string }> {
  const metadata = {
    name: input.fileName,
    parents: [input.parentFolderId],
  };

  const boundary = `atlas-${Date.now()}`;
  const delimiter = `\r\n--${boundary}\r\n`;
  const closeDelimiter = `\r\n--${boundary}--`;

  const bodyParts = [
    `${delimiter}Content-Type: application/json; charset=UTF-8\r\n\r\n${JSON.stringify(metadata)}`,
    `${delimiter}Content-Type: ${input.mimeType}\r\nContent-Transfer-Encoding: binary\r\n\r\n`,
  ];

  const preamble = Buffer.from(bodyParts.join(""), "utf8");
  const closing = Buffer.from(closeDelimiter, "utf8");
  const body = Buffer.concat([preamble, input.buffer, closing]);

  const accessToken = await getValidAccessToken(integrationId);

  const response = await fetch(
    `${GOOGLE_DRIVE_UPLOAD_URL}?uploadType=multipart&fields=id,name,webViewLink`,
    {
      method: "POST",
      headers: {
        Authorization: `Bearer ${accessToken}`,
        "Content-Type": `multipart/related; boundary=${boundary}`,
      },
      body,
    },
  );

  const payload = (await response.json()) as DriveFile & {
    error?: { message?: string };
  };

  if (!response.ok) {
    throw new Error(
      payload.error?.message ??
        `Google Drive upload failed (${response.status})`,
    );
  }

  return {
    fileId: payload.id,
    fileUrl: payload.webViewLink ?? buildDriveFileUrl(payload.id),
  };
}

export function buildStorageLocation(projectName: string): string {
  const safeProjectName = sanitizeDriveFolderName(projectName);
  return `${ATLAS_ROOT_FOLDER}/${ATLAS_PROJECTS_FOLDER}/${safeProjectName}`;
}
