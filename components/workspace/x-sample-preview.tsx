"use client";

import { useState } from "react";

import { Button } from "@/components/ui/button";
import { trackAutomationFirstEvent } from "@/lib/automation-first/analytics";
import { fetchXSampleClient } from "@/lib/integrations/x/post/autopost-client";

/**
 * Before X is connected: let the user see one real sample post for their
 * theme. Text only — nothing is posted (labelled as a sample).
 */
export function XSamplePreview({
  onConnect,
  connecting = false,
}: {
  onConnect?: () => void;
  connecting?: boolean;
}) {
  const [theme, setTheme] = useState("");
  const [loading, setLoading] = useState(false);
  const [sample, setSample] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);

  async function makeSample() {
    if (!theme.trim() || loading) return;
    setLoading(true);
    setMessage(null);
    try {
      const result = await fetchXSampleClient({ theme: theme.trim() });
      if (result.status === "ready") {
        setSample(result.text);
        trackAutomationFirstEvent("x_sample_generated", {
          fallback: result.usedFallback,
        });
      } else {
        setMessage(result.message);
      }
    } catch {
      setMessage("見本を作成できませんでした。時間をおいてお試しください。");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="space-y-3" data-testid="x-sample-preview">
      <div>
        <p className="text-sm font-semibold text-[var(--text-primary)]">
          連携の前に、見本を1件つくってみる
        </p>
        <p className="text-[length:var(--text-caption)] text-[var(--text-muted)]">
          テーマを入れると、毎日届く投稿と同じ方法で見本を作ります（投稿はされません）。
        </p>
      </div>
      <form
        className="flex flex-col gap-2 sm:flex-row"
        onSubmit={(event) => {
          event.preventDefault();
          void makeSample();
        }}
      >
        <label className="sr-only" htmlFor="x-sample-theme">
          投稿テーマ
        </label>
        <input
          id="x-sample-theme"
          value={theme}
          maxLength={60}
          onChange={(event) => setTheme(event.target.value)}
          placeholder="例：美容室の集客、副業、筋トレ"
          className="min-h-[44px] flex-1 rounded-[var(--radius-lg)] border border-[var(--border)] px-4 text-sm focus:border-[var(--border-focus)] focus:outline-none"
        />
        <Button
          type="submit"
          variant="secondary"
          isLoading={loading}
          disabled={!theme.trim()}
          className="min-h-[44px] sm:w-auto"
        >
          {sample ? "別の見本" : "見本をつくる"}
        </Button>
      </form>
      {message ? (
        <p role="status" className="text-[length:var(--text-caption)] text-[var(--warning)]">
          {message}
        </p>
      ) : null}
      {sample ? (
        <figure
          role="status"
          className="animate-card-enter ui-card ui-card-pad space-y-2 bg-[var(--surface-muted)]"
        >
          <figcaption className="flex items-center gap-2 text-[length:var(--text-meta)] font-semibold text-[var(--text-muted)]">
            <span className="rounded-full bg-[var(--brand-muted)] px-2 py-0.5 text-[var(--brand)]">
              見本
            </span>
            まだ投稿されていません
          </figcaption>
          <p className="whitespace-pre-wrap text-sm leading-relaxed text-[var(--text-primary)]">
            {sample}
          </p>
          <p className="text-[length:var(--text-caption)] text-[var(--text-secondary)]">
            Xを連携すると、この調子で毎日MINERVOTが作成して投稿します。
          </p>
          {onConnect ? (
            <Button
              onClick={() => {
                trackAutomationFirstEvent("x_sample_connect_clicked", {});
                onConnect();
              }}
              isLoading={connecting}
              className="min-h-[44px] w-full sm:w-auto"
            >
              この調子で毎日任せる（Xを連携）
            </Button>
          ) : null}
        </figure>
      ) : null}
    </div>
  );
}
