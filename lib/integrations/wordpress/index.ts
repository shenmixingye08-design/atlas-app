/**
 * Client-safe WordPress integration surface.
 * Server-only modules (connection-service, credential-*, post/service, etc.)
 * must be imported from their concrete paths — never re-exported here.
 */
export { wordpressServiceDefinition } from "./definition";
export { wordpressConnector } from "./connector";

export type {
  WordPressCategory,
  WordPressConnectInput,
  WordPressConnectionCheckResult,
  WordPressConnectionStatus,
  WordPressCredentialRecord,
  WordPressMediaUploadResult,
  WordPressPersistedAuth,
  WordPressPostPayload,
  WordPressPostResult,
  WordPressPostStatus,
  WordPressPublicSiteInfo,
  WordPressTag,
} from "./types";

export {
  connectWordPressClient,
  createWordPressPostClient,
  disconnectWordPressClient,
  fetchWordPressCategoriesClient,
  fetchWordPressConnectionStatusClient,
  fetchWordPressTagsClient,
  updateWordPressPostClient,
  verifyWordPressConnectionClient,
} from "./client";
