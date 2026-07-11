export type DriveCategoryId =
  | "sales_material"
  | "blog"
  | "sns"
  | "email"
  | "other";

export type DriveDocumentKind =
  | "folder"
  | "pdf"
  | "word"
  | "excel"
  | "powerpoint"
  | "google_doc"
  | "google_sheet"
  | "google_slide"
  | "other";

export type DriveFileItem = {
  id: string;
  name: string;
  mimeType: string;
  kind: DriveDocumentKind;
  category: DriveCategoryId;
  modifiedAt: string;
  sizeBytes: number | null;
  webViewLink: string | null;
  webContentLink: string | null;
  parents: readonly string[];
  isFolder: boolean;
};

export type DriveFolderItem = {
  id: string;
  name: string;
  webViewLink: string | null;
  modifiedAt: string;
  parents: readonly string[];
};

export type DriveFolderLayout = {
  rootFolderId: string;
  rootFolderUrl: string;
  categories: Record<
    DriveCategoryId,
    { folderId: string; folderUrl: string; label: string }
  >;
  ensuredAt: string;
};

export type DriveFilesSnapshot = {
  category: DriveCategoryId | "all";
  categoryLabel: string;
  query: string | null;
  parentId: string | null;
  files: readonly DriveFileItem[];
  folderItems: readonly DriveFolderItem[];
  folders: DriveFolderLayout;
  generatedAt: string;
};

export type DriveFetchStatus =
  | "ready"
  | "google_not_connected"
  | "feature_disabled"
  | "unauthorized";

export type DriveFilesResult =
  | { status: "ready"; snapshot: DriveFilesSnapshot }
  | { status: Exclude<DriveFetchStatus, "ready">; message: string };

export type DriveSaveResult =
  | {
      status: "ready";
      file: DriveFileItem;
      overwritten: boolean;
      folderUrl: string;
    }
  | { status: Exclude<DriveFetchStatus, "ready">; message: string }
  | { status: "not_found"; message: string }
  | { status: "unsupported_format"; message: string };

/** Automation hook design — save deliverable then notify user with URL. */
export type DriveAutomationSaveTrigger = {
  category: DriveCategoryId;
  kind: "post_deliverable_save";
  deliverableFormat: string;
  notifyWithDriveUrl: true;
};

export type DriveFileDetailResult =
  | { status: "ready"; file: DriveFileItem }
  | { status: Exclude<DriveFetchStatus, "ready">; message: string }
  | { status: "not_found"; message: string };

export type DriveAiSummary = {
  fileId: string;
  fileName: string;
  kind: DriveDocumentKind;
  summaryLines: readonly string[];
  preview: string;
};

export type DriveAiSearchHit = {
  fileId: string;
  fileName: string;
  kind: DriveDocumentKind;
  reason: string;
  score: number;
};

export type DriveAiClassification = {
  fileId: string;
  fileName: string;
  suggestedCategory: DriveCategoryId;
  label: string;
  reason: string;
};
