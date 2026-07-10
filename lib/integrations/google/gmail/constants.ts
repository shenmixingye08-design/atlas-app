export const GMAIL_API_BASE = "https://gmail.googleapis.com/gmail/v1";

export const GMAIL_TIMEZONE = "Asia/Tokyo";

/** Max messages fetched per list request. */
export const GMAIL_LIST_MAX_RESULTS = 30;

export const GMAIL_LABEL_NAMES: Record<string, string> = {
  INBOX: "受信トレイ",
  UNREAD: "未読",
  STARRED: "スター",
  IMPORTANT: "重要",
  SENT: "送信済み",
  DRAFT: "下書き",
  SPAM: "迷惑メール",
  TRASH: "ゴミ箱",
  CATEGORY_PERSONAL: "個人",
  CATEGORY_SOCIAL: "ソーシャル",
  CATEGORY_PROMOTIONS: "プロモーション",
  CATEGORY_UPDATES: "通知",
  CATEGORY_FORUMS: "フォーラム",
};
