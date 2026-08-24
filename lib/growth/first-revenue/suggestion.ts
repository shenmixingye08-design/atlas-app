import type { FirstRevenueEventName } from "./types";

export function resolveDropoff(counts: Record<FirstRevenueEventName, number | null>): string {
  if (!counts.offer_lp_viewed) return "LP表示";
  if (!counts.offer_cta_clicked) return "CTAクリック";
  if (!counts.signup_completed) return "無料登録";
  if (!counts.first_use_succeeded) return "初回成功";
  if (!counts.checkout_started) return "Checkout開始";
  if (!counts.checkout_completed) return "有料契約";
  if (!counts.invoice_paid) return "入金";
  return "継続利用";
}

export function buildNextAction(dropoff: string): {
  facts: string;
  hypothesis: string;
  nextChange: string;
  success: string;
  revert: string;
} {
  switch (dropoff) {
    case "LP表示":
      return {
        facts: "LP表示が未取得、または0件です。",
        hypothesis: "投稿または流入が足りない可能性があります。",
        nextChange: "承認済みのX短文を1本だけ手動投稿する。",
        success: "7日以内にLP表示が1以上。",
        revert: "表示が増えても登録0ならフックを戻す。",
      };
    case "CTAクリック":
      return {
        facts: "LP表示はありますが、CTAクリックが未取得です。",
        hypothesis: "見出しとCTAが一致していない可能性があります。",
        nextChange: "CTA文言だけを「投稿案を1件作る」に固定する。",
        success: "同じ期間でクリックが発生する。",
        revert: "クリック後の登録が落ちたら元に戻す。",
      };
    case "無料登録":
      return {
        facts: "クリックまたは表示のあと、登録がありません。",
        hypothesis: "LPの約束と登録後の体験がずれている可能性があります。",
        nextChange: "LPの3ステップを登録後画面と同じ文言にする。",
        success: "登録が1件以上。",
        revert: "登録後の初回成功が落ちたら文言を戻す。",
      };
    case "初回成功":
      return {
        facts: "登録はあるが、初回成功がありません。",
        hypothesis: "初回依頼の入力や失敗時の再試行が足りない可能性があります。",
        nextChange: "例文を先に入れた状態だけを維持し、質問を増やさない。",
        success: "登録者の初回成功が1件。",
        revert: "失敗理由が不明なまま成果物数を増やさない。",
      };
    case "Checkout開始":
      return {
        facts: "初回成功のあと、Checkout開始がありません。",
        hypothesis: "有料で増える範囲が伝わっていない可能性があります。",
        nextChange: "Lightの月額とX自動投稿上限だけを、成功画面に1行足す。",
        success: "Checkout開始が1件。",
        revert: "価格以外の文言を同時に変えない。",
      };
    case "有料契約":
      return {
        facts: "Checkout開始のあと、契約完了がありません。",
        hypothesis: "決済失敗または離脱の可能性があります。",
        nextChange: "失敗理由の表示と、設定画面への戻りを確認する。",
        success: "決済失敗を成功扱いせず、再開できる。",
        revert: "Priceやプランは変えない。",
      };
    default:
      return {
        facts: "契約または入金イベントを待っています。",
        hypothesis: "テスト決済と実入金を混ぜると判断を誤ります。",
        nextChange: "livemode の入金だけを実入金として見る。",
        success: "本番 livemode の invoice.paid が1件。",
        revert: "テスト決済を実入金にしない。",
      };
  }
}
