export type DriveCategoryId =
  | "sales_material"
  | "blog"
  | "sns"
  | "email"
  | "other";

export type DriveFileItem = {
  id: string;
  name: string;
  mimeType: string;
  category: DriveCategoryId;
  modifiedAt: string;
  sizeBytes: number | null;
  webViewLink: string | null;
  webContentLink: string | null;
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
  files: readonly DriveFileItem[];
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
