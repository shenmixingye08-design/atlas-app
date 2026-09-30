import { XPostPanel } from "@/components/workspace/x-post-panel";

/**
 * Manual posting is secondary to 毎日のX投稿 (automation first):
 * collapsed by default so the primary setup path stays in focus.
 */
export function XManualPostSection() {
  return (
    <details className="ui-card group" data-testid="x-manual-post">
      <summary className="ui-row ui-row-link min-h-[var(--touch-target)] cursor-pointer list-none rounded-[inherit] [&::-webkit-details-marker]:hidden">
        <span className="min-w-0 flex-1">
          <span className="block text-sm font-semibold text-[var(--text-primary)]">
            手動で投稿する
          </span>
          <span className="block text-[length:var(--text-caption)] text-[var(--text-muted)]">
            今すぐ投稿・予約・下書き・テスト投稿（必要なときだけ）
          </span>
        </span>
        <span
          aria-hidden
          className="ui-chevron transition-transform group-open:rotate-90"
        >
          ›
        </span>
      </summary>
      <div className="border-t border-[var(--border)] p-4 sm:p-5">
        <XPostPanel />
      </div>
    </details>
  );
}
