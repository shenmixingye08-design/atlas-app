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
  connectWordPressAccount,
  disconnectWordPressAccount,
  getWordPressAuthContext,
  markWordPressAuthFailure,
  touchWordPressConnectionLastUsed,
} from "./connection-service";

export { checkWordPressConnectionForUser } from "./connection-status";

export {
  createWordPressPostForUser,
  fetchWordPressCategoriesForUser,
  fetchWordPressTagsForUser,
  updateWordPressPostForUser,
} from "./post/service";

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
