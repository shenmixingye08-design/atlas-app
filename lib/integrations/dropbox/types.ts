export type DropboxEntryKind =
  | "folder"
  | "pdf"
  | "word"
  | "excel"
  | "powerpoint"
  | "other";

export type DropboxFileItem = {
  id: string;
  name: string;
  pathDisplay: string;
  pathLower: string;
  kind: DropboxEntryKind;
  isFolder: boolean;
  modifiedAt: string | null;
  sizeBytes: number | null;
  sharedLinkUrl: string | null;
};

export type DropboxFilesSnapshot = {
  path: string;
  query: string | null;
  files: readonly DropboxFileItem[];
  folders: readonly DropboxFileItem[];
  generatedAt: string;
};

export type DropboxFetchStatus =
  | "ready"
  | "dropbox_not_connected"
  | "feature_disabled"
  | "unauthorized";

export type DropboxFilesResult =
  | { status: "ready"; snapshot: DropboxFilesSnapshot }
  | { status: Exclude<DropboxFetchStatus, "ready">; message: string };

export type DropboxMutationResult =
  | { status: "ready"; file: DropboxFileItem }
  | { status: Exclude<DropboxFetchStatus, "ready">; message: string }
  | { status: "not_found"; message: string };

export type DropboxShareResult =
  | { status: "ready"; file: DropboxFileItem; url: string }
  | { status: Exclude<DropboxFetchStatus, "ready">; message: string }
  | { status: "not_found"; message: string };

export type DropboxAiSummary = {
  path: string;
  fileName: string;
  kind: DropboxEntryKind;
  summaryLines: readonly string[];
  preview: string;
};

export type DropboxPdfAnalysis = {
  path: string;
  fileName: string;
  extractedChars: number;
  summaryLines: readonly string[];
  preview: string;
};
