export type XPermissionCheck = {
  scope: "tweet.read" | "tweet.write" | "users.read" | "offline.access";
  granted: boolean;
};

export type XConnectionCheckResult =
  | {
      status: "ready";
      connected: true;
      /** OAuth token works. Not enough to post. */
      tokenValid: true;
      /**
       * True only when the connection can actually post
       * (tweet.write + required scopes). Never treat connected as posting_ready.
       */
      postingReady: boolean;
      account: {
        username: string | null;
        name: string | null;
        providerUserId: string | null;
      };
      scopes: string[];
      permissions: XPermissionCheck[];
      permissionsOk: boolean;
      connectedAt: string | null;
      lastUsedAt: string | null;
    }
  | {
      status: "feature_disabled";
      connected: false;
      message: string;
    }
  | {
      status: "disconnected";
      connected: false;
      message: string;
    }
  | {
      status: "reconnect_required";
      connected: false;
      message: string;
      errorMessage: string | null;
    }
  | {
      status: "error";
      connected: false;
      message: string;
    };
