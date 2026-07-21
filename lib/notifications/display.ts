import type { NotificationRecord, NotificationType } from "./types";

/** User-facing notice categories for the secretary inbox. */
export type NoticeCategory =
  | "needs_review"
  | "completed"
  | "scheduled"
  | "improvement"
  | "needs_material"
  | "error"
  | "ops"
  | "general";

export type NoticePriority = "normal" | "important" | "urgent";

export const NOTICE_CATEGORY_LABELS: Record<NoticeCategory, string> = {
  needs_review: "確認が必要",
  completed: "仕事が完了",
  scheduled: "実行予定",
  improvement: "改善提案",
  needs_material: "資料が必要",
  error: "エラー",
  ops: "運営からのお知らせ",
  general: "お知らせ",
};

export const NOTICE_PRIORITY_LABELS: Record<NoticePriority, string> = {
  normal: "通常",
  important: "重要",
  urgent: "至急",
};

export type NoticeFilter =
  | "all"
  | "unread"
  | "needs_review"
  | "completed"
  | "improvement"
  | "error";

const ALLOWED_ACTION_PREFIXES = [
  "/workspace",
  "/automations",
  "/projects",
  "/history",
  "/settings",
  "/notifications",
  "/billing",
] as const;

export function isSafeActionUrl(url: string | null | undefined): url is string {
  if (!url || typeof url !== "string") return false;
  if (!url.startsWith("/")) return false;
  if (url.startsWith("//")) return false;
  if (url.startsWith("/owner")) return false;
  return ALLOWED_ACTION_PREFIXES.some(
    (prefix) => url === prefix || url.startsWith(`${prefix}/`) || url.startsWith(`${prefix}?`),
  );
}

/**
 * The URL「結果を見る」/「確認する」should open. Prefers an explicit, safe
 * `actionUrl`; otherwise reconstructs a deep link from the stored targeting IDs
 * so an older / partially-populated row still reaches THAT result instead of a
 * list page. Returns null only when nothing can be reached.
 */
export function resolveNoticeActionUrl(
  notification: NotificationRecord,
): string | null {
  if (isSafeActionUrl(notification.actionUrl)) return notification.actionUrl;

  const deliverableId = notification.deliverableId ?? notification.relatedTaskId;
  if (deliverableId) {
    const url = `/projects/${encodeURIComponent(deliverableId)}`;
    if (isSafeActionUrl(url)) return url;
  }

  if (notification.automationId) {
    const url = `/automations?id=${encodeURIComponent(notification.automationId)}`;
    if (isSafeActionUrl(url)) return url;
  }

  return null;
}

export function resolveNoticeCategory(
  notification: NotificationRecord,
): NoticeCategory {
  const text = `${notification.title} ${notification.message}`;

  if (/資料.*(必要|不足|提供|追加)|追加の資料|ファイル.*(必要|不足)/.test(text)) {
    return "needs_material";
  }

  switch (notification.type) {
    case "awaiting_review":
      return "needs_review";
    case "completed":
      return "completed";
    case "recommendation":
      return "improvement";
    case "error":
    case "integration":
      return "error";
    case "billing":
      return "ops";
    case "automation":
      if (/予定|次回|カレンダー|リマインダー|実行予定/.test(text)) {
        return "scheduled";
      }
      if (/失敗|エラー|停止/.test(text)) return "error";
      if (/完了/.test(text)) return "completed";
      if (/確認/.test(text)) return "needs_review";
      return "scheduled";
    default:
      return "general";
  }
}

export function resolveNoticePriority(
  notification: NotificationRecord,
  category: NoticeCategory = resolveNoticeCategory(notification),
): NoticePriority {
  const text = `${notification.title} ${notification.message}`;

  if (
    category === "error" &&
    /停止|失敗しました|処理を完了できません|決済失敗|お支払いに失敗/.test(text)
  ) {
    return "urgent";
  }

  if (category === "ops" && /失敗|停止|自動停止/.test(text)) {
    return "urgent";
  }

  if (category === "needs_review" || category === "needs_material") {
    return "important";
  }

  if (category === "error") {
    return "important";
  }

  return "normal";
}

/**
 * Stored titles too generic to show as-is. When the emitter (or a legacy row)
 * only stored one of these, we upgrade it to a task-type-specific title so the
 * user understands the notification without opening it.
 */
const GENERIC_TITLES = new Set<string>([
  "お仕事が完了しました",
  "仕事が完了しました",
  "お知らせ",
  "完了",
  "完了報告",
  "自動化が終了しました",
  "資料が完成しました",
  "処理を完了できませんでした",
  "ご確認が必要な仕事がございます",
  "仕事の実行に失敗しました",
  // Internal-sounding titles that must never surface to the user (ATLAS rule 10:
  // 内部技術・複数エージェント構成を過度に見せない).
  "AIオーケストレーター完了報告",
  "AIオーケストレーター一部完了",
  "AIオーケストレーター失敗報告",
  "AIオーケストレーターを中止しました",
]);

/**
 * Keyword → task-type title rules. Ordered by priority (first match wins) so
 * more specific kinds (契約書, ブログ, 画像解析) win over generic ones (資料).
 */
const DELIVERABLE_KIND_RULES: {
  pattern: RegExp;
  completed: string;
  failed: string;
}[] = [
  {
    pattern: /契約書|規約|利用規約/,
    completed: "契約書の要約が完了しました",
    failed: "契約書の処理を完了できませんでした",
  },
  {
    pattern: /画像.*(解析|認識|分析)|写真.*(解析|分析)/,
    completed: "画像解析が完了しました",
    failed: "画像解析を完了できませんでした",
  },
  {
    pattern: /家計簿|経費|レシート|支出|入出金/,
    completed: "家計簿へ登録しました",
    failed: "家計簿への登録を完了できませんでした",
  },
  {
    pattern: /ブログ|記事/,
    completed: "ブログ記事を作成しました",
    failed: "ブログ記事の作成を完了できませんでした",
  },
  {
    pattern: /議事録/,
    completed: "議事録を作成しました",
    failed: "議事録の作成を完了できませんでした",
  },
  {
    pattern: /翻訳/,
    completed: "翻訳が完了しました",
    failed: "翻訳を完了できませんでした",
  },
  {
    pattern: /要約|まとめ/,
    completed: "要約が完了しました",
    failed: "要約を完了できませんでした",
  },
  {
    pattern: /レポート|報告書|分析/,
    completed: "レポートを作成しました",
    failed: "レポートの作成を完了できませんでした",
  },
  {
    pattern: /プレゼン|スライド|提案書|企画書/,
    completed: "資料を作成しました",
    failed: "資料の作成を完了できませんでした",
  },
  {
    pattern: /画像(生成|作成)|イラスト/,
    completed: "画像を生成しました",
    failed: "画像の生成を完了できませんでした",
  },
  {
    pattern: /動画/,
    completed: "動画を作成しました",
    failed: "動画の作成を完了できませんでした",
  },
  {
    pattern: /メール|返信|gmail/i,
    completed: "メールの準備が完了しました",
    failed: "メールの処理を完了できませんでした",
  },
  {
    pattern: /資料|ドキュメント|文書|保存/,
    completed: "資料の作成が完了しました",
    failed: "資料の処理を完了できませんでした",
  },
];

function isGenericTitle(title: string): boolean {
  if (!title) return true;
  return GENERIC_TITLES.has(title);
}

/**
 * Build a task-type-specific title from job intent / deliverable kind / service
 * so「結果を見る」前に内容が分かる. Returns null when nothing more specific than
 * the category default fits.
 */
export function deriveTaskTypeTitle(
  notification: NotificationRecord,
  category: NoticeCategory = resolveNoticeCategory(notification),
): string | null {
  const text = `${notification.title} ${notification.message}`;
  const service = (notification.relatedService ?? "").toLowerCase();
  const jobName = extractJobName(notification);
  const rule = DELIVERABLE_KIND_RULES.find((item) => item.pattern.test(text));
  const looksFailed = /失敗|できませんでした|エラー|停止/.test(text);

  if (category === "completed") {
    // Guard: a「完了」category row whose body says it failed (e.g. partial SNS
    // run) must not claim success.
    if (looksFailed) return null;
    if (service === "x" || /X(自動)?投稿|ツイート|ポスト|SNS投稿/.test(text)) {
      return "X自動投稿が完了しました";
    }
    if (rule) return rule.completed;
    if (jobName) return `「${jobName}」が完了しました`;
    return null;
  }

  if (category === "error") {
    if (service === "x" || /X(自動)?投稿|ツイート|ポスト/.test(text)) {
      return "X投稿を完了できませんでした";
    }
    if (rule) return rule.failed;
    if (jobName) return `「${jobName}」を完了できませんでした`;
    return null;
  }

  if (category === "needs_review" && jobName) {
    return `「${jobName}」のご確認をお願いいたします`;
  }

  return null;
}

/** Soften stored copy into secretary tone for display (does not mutate storage). */
export function formatNoticeTitle(
  notification: NotificationRecord,
  category: NoticeCategory = resolveNoticeCategory(notification),
): string {
  // 1) Prefer a derived task-type title — it is guaranteed clean (no internal
  //    terms) and specific (「契約書の要約が完了しました」等) so the user understands
  //    the notification without opening it.
  const derived = deriveTaskTypeTitle(notification, category);
  if (derived) return derived;

  // 2) Otherwise keep a specific stored title (e.g. 「メールを受信しました」).
  const stored = sanitizeUserFacingText(notification.title);
  if (stored && !isGenericTitle(stored)) return stored;

  // 3) Secretary-tone category defaults as the last resort (never blank).
  switch (category) {
    case "needs_review":
      return "ご確認が必要な仕事がございます";
    case "completed":
      return "お仕事が完了しました";
    case "scheduled":
      return "次回の実行予定のご案内";
    case "improvement":
      return "改善のご提案がございます";
    case "needs_material":
      return "追加の資料が必要です";
    case "error":
      return "処理を完了できませんでした";
    case "ops":
      return "運営からのお知らせ";
    default:
      return stored || "お知らせ";
  }
}

export function formatNoticeMessage(
  notification: NotificationRecord,
  category: NoticeCategory = resolveNoticeCategory(notification),
): string {
  const original = sanitizeUserFacingText(notification.message);
  const jobName = extractJobName(notification);

  switch (category) {
    case "needs_review":
      return jobName
        ? `「${jobName}」について、ご確認をお願いいたします。`
        : "ご確認が必要な仕事がございます。内容をご確認ください。";
    case "completed":
      return jobName
        ? `お待たせいたしました。「${jobName}」の作成が完了しました。`
        : "お待たせいたしました。ご依頼の内容が完了しました。";
    case "scheduled":
      return original
        ? `次回の実行予定をご案内します。${original}`
        : "次回の実行予定をご案内します。";
    case "improvement":
      return original
        ? `改善できる可能性のある仕事が見つかりました。${original}`
        : "改善できる可能性のある仕事が見つかりました。";
    case "needs_material":
      return "作業を進めるため、追加の資料をご提供ください。";
    case "error":
      return "処理を完了できませんでした。内容をご確認ください。";
    case "ops":
      return original || "運営よりご案内がございます。";
    default:
      return original || "新しいお知らせがございます。";
  }
}

/** Strip stack traces / internal jargon from user-facing text. */
export function sanitizeUserFacingText(value: string): string {
  return value
    .replace(/at\s+\S+\s+\([^)]+\)/g, "")
    .replace(/Error:\s*/gi, "")
    .replace(/stack\s*trace/gi, "")
    .replace(/OPENAI_[A-Z_]+/g, "")
    .replace(/sk-[a-zA-Z0-9]+/g, "")
    .replace(/\s{2,}/g, " ")
    .trim()
    .slice(0, 240);
}

export function extractJobName(
  notification: NotificationRecord,
): string | null {
  const fromQuotes = notification.title.match(/「([^」]+)」/);
  if (fromQuotes?.[1]) return fromQuotes[1];

  const fromMessage = notification.message.match(/「([^」]+)」/);
  if (fromMessage?.[1]) return fromMessage[1];

  if (notification.relatedService && notification.relatedService !== "atlas") {
    return null;
  }

  return null;
}

export function getNoticeActionLabel(category: NoticeCategory): string {
  switch (category) {
    case "needs_review":
    case "needs_material":
    case "error":
      return "確認する";
    case "improvement":
      return "提案を見る";
    case "scheduled":
      return "予定を見る";
    case "completed":
      return "結果を見る";
    default:
      return "詳細を見る";
  }
}

export function matchesNoticeFilter(
  notification: NotificationRecord,
  filter: NoticeFilter,
): boolean {
  if (filter === "all") return true;
  if (filter === "unread") return !notification.isRead;

  const category = resolveNoticeCategory(notification);
  if (filter === "needs_review") return category === "needs_review";
  if (filter === "completed") return category === "completed";
  if (filter === "improvement") return category === "improvement";
  if (filter === "error") return category === "error";
  return true;
}

export function formatNoticeDateTime(iso: string): string {
  return new Date(iso).toLocaleString("ja-JP", {
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}
