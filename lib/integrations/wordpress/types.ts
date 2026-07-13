import type { ExternalServiceConnection } from "../external-services/types";

/** Server-only WordPress Application Password credentials — never sent to clients. */
export type WordPressCredentialRecord = {
  userId: string;
  siteUrl: string;
  username: string;
  applicationPassword: string;
  updatedAt: string;
};

export type WordPressPersistedAuth = {
  credentials: WordPressCredentialRecord;
  connection: ExternalServiceConnection;
};

export type WordPressPublicSiteInfo = {
  siteUrl: string;
  siteName: string | null;
  username: string;
};

/** Client-safe connection check result (no secrets). */
export type WordPressConnectionStatus =
  | "ready"
  | "disconnected"
  | "auth_failure"
  | "error"
  | "feature_disabled"
  | "reconnect_required";

export type WordPressConnectionCheckResult = {
  status: WordPressConnectionStatus;
  connected: boolean;
  message: string;
  site?: WordPressPublicSiteInfo;
  connectedAt?: string | null;
  lastUsedAt?: string | null;
  errorMessage?: string | null;
};

export type WordPressConnectInput = {
  siteUrl: string;
  username: string;
  applicationPassword: string;
};

export type WordPressCategory = {
  id: number;
  name: string;
  slug: string;
  parent: number;
  count: number;
};

export type WordPressTag = {
  id: number;
  name: string;
  slug: string;
  count: number;
};

export type WordPressMediaUploadResult = {
  id: number;
  sourceUrl: string;
  altText: string;
};

export type WordPressPostStatus = "draft" | "publish";

export type WordPressPostPayload = {
  title: string;
  content: string;
  status?: WordPressPostStatus;
  excerpt?: string;
  categories?: number[];
  tags?: number[];
  featuredMediaId?: number;
  /** Remote image URL — server fetches and uploads as featured media. */
  featuredImageUrl?: string;
  featuredImageAlt?: string;
};

export type WordPressPostResult = {
  status: "posted" | "draft_saved" | "updated" | "error" | "wp_not_connected" | "feature_disabled" | "auth_failure" | "validation_failed";
  message: string;
  postId?: number;
  link?: string | null;
  postStatus?: string;
};
