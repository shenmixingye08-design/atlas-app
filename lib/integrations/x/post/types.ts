/** How the post was triggered. */
export type XPostMode = "immediate" | "scheduled" | "auto" | "test" | "draft";

export type XPostStatus = "success" | "failed";

export type XPostValidationSummary = {
  charCount: number;
  maxChars: number;
  urls: string[];
  mentions: string[];
  hashtags: string[];
  errors: string[];
};

export type XPostHistoryRecord = {
  id: string;
  userId: string;
  text: string;
  mode: XPostMode;
  status: XPostStatus;
  postedAt: string;
  tweetId: string | null;
  tweetUrl: string | null;
  errorMessage: string | null;
  scheduledFor: string | null;
  automationId: string | null;
  validation: XPostValidationSummary;
  driveFileUrl: string | null;
};

export type XScheduledPost = {
  id: string;
  userId: string;
  text: string;
  scheduledFor: string;
  automationId: string | null;
  createdAt: string;
  status: "pending" | "posted" | "failed" | "cancelled";
  errorMessage: string | null;
};

export type XDraftPost = {
  id: string;
  userId: string;
  text: string;
  createdAt: string;
  updatedAt: string;
};

export type XPostResult =
  | {
      status: "ready";
      mode: XPostMode;
      history?: XPostHistoryRecord;
      scheduled?: XScheduledPost;
      draft?: XDraftPost;
    }
  | {
      status: "feature_disabled";
      message: string;
    }
  | {
      status: "x_not_connected";
      message: string;
      reconnectRequired?: boolean;
    }
  | {
      status: "validation_failed";
      message: string;
      validation: XPostValidationSummary;
    }
  | {
      status: "error";
      message: string;
      reconnectRequired?: boolean;
    };

export type XPostHistoryResult =
  | {
      status: "ready";
      records: XPostHistoryRecord[];
    }
  | {
      status: "feature_disabled";
      message: string;
    };

export type XScheduledPostsResult =
  | {
      status: "ready";
      posts: XScheduledPost[];
    }
  | {
      status: "feature_disabled";
      message: string;
    };

export type XDraftPostsResult =
  | {
      status: "ready";
      drafts: XDraftPost[];
    }
  | {
      status: "feature_disabled";
      message: string;
    };

export type XPostLookupResult =
  | {
      status: "ready";
      history: XPostHistoryRecord;
      liveTweet?: {
        tweetId: string;
        text: string;
      } | null;
    }
  | {
      status: "feature_disabled";
      message: string;
    }
  | {
      status: "not_found";
      message: string;
    }
  | {
      status: "error";
      message: string;
    };
