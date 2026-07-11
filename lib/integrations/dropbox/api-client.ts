import "server-only";

import { DROPBOX_API_BASE, DROPBOX_CONTENT_BASE } from "./config";
import type { DropboxEntryKind, DropboxFileItem } from "./types";

type DropboxMetadata = {
  ".tag"?: "file" | "folder" | "deleted";
  id?: string;
  name?: string;
  path_display?: string;
  path_lower?: string;
  client_modified?: string;
  server_modified?: string;
  size?: number;
};

type DropboxListFolderResponse = {
  entries?: DropboxMetadata[];
  cursor?: string;
  has_more?: boolean;
  error_summary?: string;
};

type DropboxSearchResponse = {
  matches?: Array<{
    metadata?: {
      metadata?: DropboxMetadata;
    };
  }>;
  error_summary?: string;
};

type DropboxSharedLinkResponse = {
  url?: string;
  error_summary?: string;
  error?: { ".tag"?: string };
};

function resolveKind(name: string, tag: string | undefined): DropboxEntryKind {
  if (tag === "folder") return "folder";
  const lower = name.toLowerCase();
  if (lower.endsWith(".pdf")) return "pdf";
  if (lower.endsWith(".doc") || lower.endsWith(".docx")) return "word";
  if (lower.endsWith(".xls") || lower.endsWith(".xlsx")) return "excel";
  if (lower.endsWith(".ppt") || lower.endsWith(".pptx")) return "powerpoint";
  return "other";
}

export function normalizeDropboxEntry(
  entry: DropboxMetadata,
): DropboxFileItem | null {
  if (!entry.name || !entry.path_display || !entry.path_lower) return null;
  if (entry[".tag"] === "deleted") return null;

  const kind = resolveKind(entry.name, entry[".tag"]);
  return {
    id: entry.id ?? entry.path_lower,
    name: entry.name,
    pathDisplay: entry.path_display,
    pathLower: entry.path_lower,
    kind,
    isFolder: kind === "folder",
    modifiedAt: entry.server_modified ?? entry.client_modified ?? null,
    sizeBytes: typeof entry.size === "number" ? entry.size : null,
    sharedLinkUrl: null,
  };
}

async function dropboxRpc<T>(
  accessToken: string,
  path: string,
  body: unknown,
): Promise<T> {
  const response = await fetch(`${DROPBOX_API_BASE}${path}`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${accessToken}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(body),
    cache: "no-store",
  });

  const payload = (await response.json()) as T & { error_summary?: string };
  if (!response.ok) {
    throw new Error(
      (payload as { error_summary?: string }).error_summary ??
        "Dropbox API request failed",
    );
  }
  return payload;
}

export async function listDropboxFolder(input: {
  accessToken: string;
  path?: string;
}): Promise<DropboxFileItem[]> {
  const path = input.path?.trim() || "";
  const entries: DropboxMetadata[] = [];

  let result = await dropboxRpc<DropboxListFolderResponse>(
    input.accessToken,
    "/files/list_folder",
    {
      path,
      recursive: false,
      include_deleted: false,
      include_mounted_folders: true,
      limit: 100,
    },
  );
  entries.push(...(result.entries ?? []));

  while (result.has_more && result.cursor) {
    result = await dropboxRpc<DropboxListFolderResponse>(
      input.accessToken,
      "/files/list_folder/continue",
      { cursor: result.cursor },
    );
    entries.push(...(result.entries ?? []));
  }

  return entries
    .map(normalizeDropboxEntry)
    .filter((item): item is DropboxFileItem => item !== null)
    .sort((a, b) => {
      if (a.isFolder !== b.isFolder) return a.isFolder ? -1 : 1;
      return a.name.localeCompare(b.name, "ja");
    });
}

export async function searchDropboxFiles(input: {
  accessToken: string;
  query: string;
  path?: string;
}): Promise<DropboxFileItem[]> {
  const result = await dropboxRpc<DropboxSearchResponse>(
    input.accessToken,
    "/files/search_v2",
    {
      query: input.query.trim(),
      options: {
        path: input.path?.trim() || "",
        max_results: 50,
        file_status: "active",
        filename_only: false,
      },
    },
  );

  return (result.matches ?? [])
    .map((match) => normalizeDropboxEntry(match.metadata?.metadata ?? {}))
    .filter((item): item is DropboxFileItem => item !== null && !item.isFolder);
}

export async function uploadDropboxFile(input: {
  accessToken: string;
  path: string;
  buffer: Buffer;
  mode?: "add" | "overwrite";
}): Promise<DropboxFileItem> {
  const response = await fetch(`${DROPBOX_CONTENT_BASE}/files/upload`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${input.accessToken}`,
      "Content-Type": "application/octet-stream",
      "Dropbox-API-Arg": JSON.stringify({
        path: input.path,
        mode: input.mode ?? "add",
        autorename: true,
        mute: false,
      }),
    },
    body: new Uint8Array(input.buffer),
  });

  const payload = (await response.json()) as DropboxMetadata & {
    error_summary?: string;
  };

  if (!response.ok) {
    throw new Error(payload.error_summary ?? "Dropbox upload failed");
  }

  const normalized = normalizeDropboxEntry({ ...payload, ".tag": "file" });
  if (!normalized) throw new Error("Failed to normalize uploaded Dropbox file");
  return normalized;
}

export async function deleteDropboxPath(input: {
  accessToken: string;
  path: string;
}): Promise<DropboxFileItem | null> {
  const result = await dropboxRpc<{ metadata?: DropboxMetadata }>(
    input.accessToken,
    "/files/delete_v2",
    { path: input.path },
  );
  return normalizeDropboxEntry(result.metadata ?? {});
}

export async function downloadDropboxFile(input: {
  accessToken: string;
  path: string;
}): Promise<{ file: DropboxFileItem; buffer: Buffer }> {
  const response = await fetch(`${DROPBOX_CONTENT_BASE}/files/download`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${input.accessToken}`,
      "Dropbox-API-Arg": JSON.stringify({ path: input.path }),
    },
  });

  if (!response.ok) {
    const payload = (await response.json().catch(() => null)) as {
      error_summary?: string;
    } | null;
    throw new Error(payload?.error_summary ?? "Dropbox download failed");
  }

  const metaHeader = response.headers.get("dropbox-api-result");
  const meta = metaHeader
    ? (JSON.parse(metaHeader) as DropboxMetadata)
    : { name: input.path.split("/").pop(), path_display: input.path, path_lower: input.path.toLowerCase(), ".tag": "file" as const };

  const file = normalizeDropboxEntry({ ...meta, ".tag": "file" });
  if (!file) throw new Error("Failed to normalize downloaded Dropbox file");

  const buffer = Buffer.from(await response.arrayBuffer());
  return { file, buffer };
}

export async function createDropboxSharedLink(input: {
  accessToken: string;
  path: string;
}): Promise<{ url: string; file: DropboxFileItem }> {
  const response = await fetch(
    `${DROPBOX_API_BASE}/sharing/create_shared_link_with_settings`,
    {
      method: "POST",
      headers: {
        Authorization: `Bearer ${input.accessToken}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        path: input.path,
        settings: {
          requested_visibility: "public",
          audience: "public",
          access: "viewer",
        },
      }),
    },
  );

  const payload = (await response.json()) as DropboxSharedLinkResponse & {
    name?: string;
    path_lower?: string;
    path_display?: string;
    id?: string;
  };

  if (!response.ok) {
    // Link may already exist
    if (payload.error?.[".tag"] === "shared_link_already_exists") {
      const listed = await dropboxRpc<{
        links?: Array<{ url?: string; path_lower?: string; name?: string }>;
      }>(input.accessToken, "/sharing/list_shared_links", {
        path: input.path,
        direct_only: true,
      });
      const existing = listed.links?.[0];
      if (existing?.url) {
        return {
          url: existing.url,
          file: {
            id: input.path,
            name: existing.name ?? input.path.split("/").pop() ?? "file",
            pathDisplay: input.path,
            pathLower: existing.path_lower ?? input.path.toLowerCase(),
            kind: resolveKind(existing.name ?? input.path, "file"),
            isFolder: false,
            modifiedAt: null,
            sizeBytes: null,
            sharedLinkUrl: existing.url,
          },
        };
      }
    }
    throw new Error(payload.error_summary ?? "Failed to create shared link");
  }

  if (!payload.url) throw new Error("Shared link URL missing");

  return {
    url: payload.url,
    file: {
      id: payload.id ?? input.path,
      name: payload.name ?? input.path.split("/").pop() ?? "file",
      pathDisplay: payload.path_display ?? input.path,
      pathLower: payload.path_lower ?? input.path.toLowerCase(),
      kind: resolveKind(payload.name ?? input.path, "file"),
      isFolder: false,
      modifiedAt: null,
      sizeBytes: null,
      sharedLinkUrl: payload.url,
    },
  };
}

export async function getDropboxMetadata(input: {
  accessToken: string;
  path: string;
}): Promise<DropboxFileItem | null> {
  const result = await dropboxRpc<DropboxMetadata>(
    input.accessToken,
    "/files/get_metadata",
    { path: input.path, include_deleted: false },
  );
  return normalizeDropboxEntry(result);
}
