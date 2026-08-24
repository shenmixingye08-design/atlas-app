import { listRevenueEvents, listRevenueItems } from "@/lib/owner/revenue-agent/store";

import { listCalendarSkips } from "./store";

export const CALENDAR_CATEGORIES = [
  "悩み訴求",
  "実際の使い方",
  "開発の裏側",
  "失敗と改善",
  "機能比較",
  "無料診断",
  "実在する事例",
  "FAQ",
  "短いデモ",
] as const;

export type CalendarDay = {
  date: string;
  ideas: Array<{
    category: (typeof CALENDAR_CATEGORIES)[number];
    hook: string;
    measuredCashYen: number | null;
    skip: boolean;
  }>;
};

function tokyoDate(offset: number, now = new Date()): string {
  const date = new Date(now.getTime() + offset * 24 * 60 * 60 * 1000);
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Tokyo",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(date);
}

const HOOKS: Record<(typeof CALENDAR_CATEGORIES)[number], string[]> = {
  悩み訴求: [
    "投稿文を毎日ゼロから書いていないか",
    "同じ事務を毎週やり直していないか",
    "資料の見出しで止まっていないか",
  ],
  実際の使い方: [
    "無料診断から最初の1依頼まで",
    "X投稿案を1件作る手順",
    "自動化1件を画面から作る手順",
  ],
  開発の裏側: [
    "未確認の実績は宣伝に使わない理由",
    "Owner承認なしでは投稿しない",
    "未連携媒体はコピーまでにする理由",
  ],
  失敗と改善: [
    "クリックだけ増えて登録されない案は捨てる",
    "診断後に同じ質問を繰り返した失敗",
    "未取得を0にした表示をやめた理由",
  ],
  機能比較: [
    "投稿案作成と自動投稿の違い",
    "資料アウトラインとPowerPointエンジン",
    "今日の整理とカレンダー同期",
  ],
  無料診断: [
    "5問・ログイン不要・個人情報なし",
    "結果は実在機能だけ出す",
    "登録後は診断結果を引き継ぐ",
  ],
  実在する事例: [
    "公開許可がある事例だけ使う",
    "許可なしのコメントは宣伝しない",
    "件数は実測があるときだけ出す",
  ],
  FAQ: [
    "無料で試せる範囲はプラン表どおり",
    "自動投稿はX連携後",
    "紹介特典は未設定",
  ],
  短いデモ: [
    "診断完了までの画面",
    "登録後の最初の依頼",
    "Ownerの証拠台帳",
  ],
};

export function buildContentCalendar(now = new Date()): CalendarDay[] {
  const cashByKind = new Map<string, number>();
  for (const event of listRevenueEvents()) {
    if (event.eventName !== "invoice_paid") continue;
    const yen = event.metadata.amountYen;
    if (typeof yen !== "number") continue;
    const item = listRevenueItems().find((row) => row.contentId === event.contentId);
    const key = item?.kind ?? null;
    if (!key) continue;
    cashByKind.set(key, (cashByKind.get(key) ?? 0) + yen);
  }

  const skips = new Set(listCalendarSkips());
  const days: CalendarDay[] = [];
  let previousFirst = "";
  let previousCta = "";
  for (let i = 0; i < 14; i += 1) {
    const date = tokyoDate(i, now);
    const offset = (i * 2) % CALENDAR_CATEGORIES.length;
    const ideas = [0, 1, 2].map((index) => {
      const category = CALENDAR_CATEGORIES[(offset + index * 3) % CALENDAR_CATEGORIES.length];
      const variants = HOOKS[category];
      const hook = variants[(i + index) % variants.length];
      const skip = skips.has(`${date}:${category}`);
      return {
        category,
        hook: hook === previousFirst ? `${hook}（別切り口）` : hook,
        measuredCashYen: cashByKind.get(category) ?? null,
        skip,
      };
    });
    if (ideas[0]?.hook === previousCta) {
      ideas[0] = { ...ideas[0], hook: `${ideas[0].hook} / 別CTA` };
    }
    previousFirst = ideas[0]?.hook ?? "";
    previousCta = ideas[0]?.hook ?? "";
    days.push({ date, ideas });
  }
  return days;
}
