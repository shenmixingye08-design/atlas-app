import { oauthFailureCopy } from "@/lib/activation/oauth-errors";
import type { OAuthFailureReason } from "@/lib/activation/types";

export function IntegrationExplainer({
  service,
  failureReason,
}: {
  service: "x" | "google";
  failureReason?: OAuthFailureReason | string | null;
}) {
  const isX = service === "x";
  const classified =
    failureReason === "user_cancelled" ||
    failureReason === "insufficient_scope" ||
    failureReason === "token_persist_failed" ||
    failureReason === "callback_failed" ||
    failureReason === "provider_error" ||
    failureReason === "misconfigured"
      ? failureReason
      : null;

  return (
    <section
      className="rounded-[var(--radius-xl)] border border-[var(--border-subtle)] bg-[var(--surface-muted)] px-4 py-3"
      aria-label={isX ? "X連携の説明" : "Google連携の説明"}
    >
      <h2 className="text-sm font-semibold text-foreground">
        {isX ? "X接続が必要になるとき" : "カレンダー接続が必要になるとき"}
      </h2>
      <ul className="mt-2 list-disc space-y-1 pl-5 text-sm text-[var(--text-secondary)]">
        <li>
          {isX
            ? "投稿案の作成と確認は、接続前でも進められます。"
            : "予定の下書きは、接続前でも整えられます。"}
        </li>
        <li>
          {isX
            ? "実際の投稿・予約のときにだけ X へ接続します。"
            : "カレンダーへ登録するときにだけ Google へ接続します。"}
        </li>
        <li>
          {isX
            ? "使う権限は投稿の作成と読み取りです。MINERVOTは、承認制を選べば勝手に投稿しません。"
            : "使う権限はカレンダーの予定作成です。承認制を選べます。"}
        </li>
        <li>接続は設定からいつでも解除できます。</li>
      </ul>
      {classified ? (
        <p className="mt-3 text-sm text-[var(--error)]" role="alert">
          {oauthFailureCopy(classified)}
        </p>
      ) : null}
    </section>
  );
}
