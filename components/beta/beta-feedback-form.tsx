"use client";

import { useState } from "react";

import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/input";
import type { PayIntent } from "@/lib/beta-ux/types";

const PAY_OPTIONS: { id: PayIntent; label: string }[] = [
  { id: "definitely", label: "絶対払う" },
  { id: "probably", label: "たぶん払う" },
  { id: "neutral", label: "どちらともいえない" },
  { id: "probably_not", label: "たぶん払わない" },
  { id: "no", label: "払わない" },
];

/**
 * βインタビュー相当の短フォーム。誘導せず自由記述を優先。
 */
export function BetaFeedbackForm({ sessionId }: { sessionId?: string }) {
  const [payIntent980, setPayIntent980] = useState<PayIntent | "">("");
  const [mostConfused, setMostConfused] = useState("");
  const [mostUseful, setMostUseful] = useState("");
  const [whyNotChatgpt, setWhyNotChatgpt] = useState("");
  const [firstImpression, setFirstImpression] = useState("");
  const [wouldReuse, setWouldReuse] = useState<boolean | null>(null);
  const [status, setStatus] = useState<string | null>(null);
  const [sending, setSending] = useState(false);

  const submit = async () => {
    setSending(true);
    setStatus(null);
    try {
      const anonymousUserId =
        localStorage.getItem("atlas.anonFunnelId") ?? undefined;
      const res = await fetch("/api/beta/feedback", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          sessionId: sessionId ?? sessionStorage.getItem("atlas.funnelSession"),
          anonymousUserId,
          firstImpression,
          mostConfused,
          mostUseful,
          whyNotChatgpt,
          payIntent980: payIntent980 || null,
          wouldReuse,
        }),
      });
      setStatus(res.ok ? "送信しました。ご協力ありがとうございます。" : "送信に失敗しました。");
    } catch {
      setStatus("送信に失敗しました。");
    } finally {
      setSending(false);
    }
  };

  return (
    <section className="space-y-4 rounded-[24px] border border-[var(--border-subtle)] bg-[var(--card)] p-5">
      <h2 className="text-lg font-semibold">βテストのご感想</h2>
      <p className="text-sm text-[var(--foreground-muted)]">
        正解はありません。迷ったこと・不安だったことをそのまま書いてください。
      </p>
      <label className="block space-y-1 text-sm">
        <span>最初に何のサービスだと思いましたか？</span>
        <Textarea
          value={firstImpression}
          onChange={(e) => setFirstImpression(e.target.value)}
          rows={2}
        />
      </label>
      <label className="block space-y-1 text-sm">
        <span>一番迷った場所</span>
        <Textarea
          value={mostConfused}
          onChange={(e) => setMostConfused(e.target.value)}
          rows={2}
        />
      </label>
      <label className="block space-y-1 text-sm">
        <span>一番便利だと思った機能</span>
        <Textarea
          value={mostUseful}
          onChange={(e) => setMostUseful(e.target.value)}
          rows={2}
        />
      </label>
      <label className="block space-y-1 text-sm">
        <span>ChatGPTではなくMINERVOTを使う理由はありますか？</span>
        <Textarea
          value={whyNotChatgpt}
          onChange={(e) => setWhyNotChatgpt(e.target.value)}
          rows={2}
        />
      </label>
      <fieldset className="space-y-2 text-sm">
        <legend>月額980円を払う価値があると思いますか？</legend>
        <div className="flex flex-wrap gap-2">
          {PAY_OPTIONS.map((opt) => (
            <button
              key={opt.id}
              type="button"
              className={`min-h-[44px] rounded-full border px-3 py-2 ${
                payIntent980 === opt.id
                  ? "border-accent bg-accent/10"
                  : "border-[var(--border-subtle)]"
              }`}
              onClick={() => setPayIntent980(opt.id)}
            >
              {opt.label}
            </button>
          ))}
        </div>
      </fieldset>
      <fieldset className="space-y-2 text-sm">
        <legend>もう一度使いたいですか？</legend>
        <div className="flex gap-2">
          <button
            type="button"
            className={`min-h-[44px] rounded-full border px-4 ${
              wouldReuse === true ? "border-accent bg-accent/10" : ""
            }`}
            onClick={() => setWouldReuse(true)}
          >
            はい
          </button>
          <button
            type="button"
            className={`min-h-[44px] rounded-full border px-4 ${
              wouldReuse === false ? "border-accent bg-accent/10" : ""
            }`}
            onClick={() => setWouldReuse(false)}
          >
            いいえ
          </button>
        </div>
      </fieldset>
      <Button type="button" onClick={() => void submit()} isLoading={sending}>
        送信する
      </Button>
      {status ? <p className="text-sm">{status}</p> : null}
    </section>
  );
}
