/** How the post was triggered. */
export type XPostMode = "immediate" | "scheduled" | "auto";

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

export type XPostResult =
  | {
      status: "ready";
      mode: XPostMode;
      history?: XPostHistoryRecord;
      scheduled?: XScheduledPost;
    }
  | {
      status: "feature_disabled";
      message: string;
    }
  | {
      status: "x_not_connected";
      message: string;
    }
  | {
      status: "validation_failed";
      message: string;
      validation: XPostValidationSummary;
    }
  | {
      status: "error";
      message: string;
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
