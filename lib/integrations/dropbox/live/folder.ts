import "server-only";

import {
  createDropboxFolder,
  listDropboxFolder,
} from "@/lib/integrations/dropbox/api-client";

import type { DropboxFolderResolution } from "./types";

function normalizeFolderPath(path: string | null | undefined): string {
  const trimmed = path?.trim() ?? "";
  if (!trimmed || trimmed === "/" || trimmed === "root") return "";
  const withLeading = trimmed.startsWith("/") ? trimmed : `/${trimmed}`;
  return withLeading.replace(/\/+/g, "/").replace(/\/$/, "");
}

function joinDropboxPath(folder: string, fileName: string): string {
  const safeName = fileName.replace(/^\/+/, "");
  if (!folder) return `/${safeName}`;
  const base = folder.startsWith("/") ? folder : `/${folder}`;
  return `${base.replace(/\/$/, "")}/${safeName}`;
}

/**
 * Resolve target folder path and full upload path.
 * Ambiguous same-name folders are rejected (never auto-pick).
 */
export async function resolveTargetFolder(input: {
  accessToken: string;
  folderPath: string | null;
  fileName: string;
  createFolderIfMissing: boolean;
}): Promise<DropboxFolderResolution> {
  const folderPath = normalizeFolderPath(input.folderPath);
  let created = false;

  if (!folderPath) {
    return {
      targetPath: joinDropboxPath("", input.fileName),
      folderPath: "",
      folderName: "Dropbox",
      created: false,
    };
  }

  const segments = folderPath
    .split("/")
    .map((part) => part.trim())
    .filter(Boolean);

  let currentPath = "";
  let folderName = "Dropbox";

  for (const segment of segments) {
    const parentPath = currentPath;
    const entries = await listDropboxFolder({
      accessToken: input.accessToken,
      path: parentPath,
    });
    const matches = entries.filter(
      (entry) => entry.isFolder && entry.name === segment,
    );

    if (matches.length > 1) {
      throw new Error(
        `400 Ambiguous Dropbox folder name "${segment}" — specify a unique folder path`,
      );
    }

    if (matches.length === 1) {
      currentPath = matches[0]!.pathLower;
      folderName = matches[0]!.name;
      continue;
    }

    if (!input.createFolderIfMissing) {
      throw new Error(`404 Dropbox folder does not exist: ${segment}`);
    }

    const newPath = parentPath
      ? `${parentPath}/${segment}`
      : `/${segment}`;
    const createdFolder = await createDropboxFolder({
      accessToken: input.accessToken,
      path: newPath,
    });
    currentPath = createdFolder.pathLower;
    folderName = createdFolder.name;
    created = true;
  }

  const targetPath = joinDropboxPath(currentPath || folderPath, input.fileName);

  return {
    targetPath,
    folderPath: currentPath || folderPath,
    folderName,
    created,
  };
}
