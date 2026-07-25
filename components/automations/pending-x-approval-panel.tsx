"use client";

import { useCallback, useEffect, useState } from "react";

import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/input";
import { formatNextRunDisplay } from "@/lib/automations/form-utils";

type PendingItem = {
  id: string;
  automationId: string;
  scheduledAt: string;
  generatedText: string;
  status: string;
  accountUsername: string | null;
  xPostId: string | null;
  xPostUrl: string | null;
  errorMessage: string | null;
};

type PendingXApprovalPanelProps = {
  automationId: string;
  onChanged?: () => void;
};

export function PendingXApprovalPanel({
  automationId,
  onChanged,
}: PendingXApprovalPanelProps) {
  const [items, setItems] = useState<PendingItem[]>([]);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editText, setEditText] = useState("");
  const [busyId, setBusyId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    const response = await fetch(
      `/api/automations/pending-x-posts?automationId=${encodeURIComponent(automationId)}&status=pending`,
      { cache: "no-store" },
    );
    if (!response.ok) return;
    const body = (await response.json()) as { items?: PendingItem[] };
    setItems(body.items ?? []);
  }, [automationId]);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      const response = await fetch(
        `/api/automations/pending-x-posts?automationId=${encodeURIComponent(automationId)}&status=pending`,
        { cache: "no-store" },
      );
      if (!response.ok || cancelled) return;
      const body = (await response.json()) as { items?: PendingItem[] };
      if (cancelled) return;
      setItems(body.items ?? []);
    })();
    return () => {
      cancelled = true;
    };
  }, [automationId]);

  const runAction = async (
    id: string,
    action: "publish" | "skip" | "edit",
    text?: string,
  ) => {
    setBusyId(id);
    setError(null);
    try {
      const response = await fetch("/api/automations/pending-x-posts", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id, action, text }),
      });
      const body = (await response.json().catch(() => ({}))) as {
        error?: string;
        item?: PendingItem;
      };
      if (!response.ok) {
        setError(body.error ?? "操作に失敗しました");
        return;
      }
      setEditingId(null);
      await load();
      onChanged?.();
    } catch (err) {
      setError(err instanceof Error ? err.message : "操作に失敗しました");
    } finally {
      setBusyId(null);
    }
  };

  if (items.length === 0) return null;

  return (
    <section className="space-y-3 rounded-[var(--radius-xl)] border border-accent/30 bg-accent/5 px-4 py-4">
      <h3 className="text-sm font-semibold text-foreground">投稿前の確認</h3>
      {error && (
        <p className="text-sm text-[var(--error)]" role="alert">
          {error}
        </p>
      )}
      <ul className="space-y-4">
        {items.map((item) => (
          <li key={item.id} className="space-y-3">
            <p className="text-xs text-[var(--text-secondary)]">
              予定日時: {formatNextRunDisplay(item.scheduledAt)}
            </p>
            <p className="text-xs text-[var(--text-secondary)]">
              投稿先アカウント:{" "}
              {item.accountUsername ? `@${item.accountUsername}` : "連携中のX"}
            </p>
            {editingId === item.id ? (
              <Textarea
                label="投稿予定文章"
                value={editText}
                onChange={(e) => setEditText(e.target.value)}
                rows={4}
              />
            ) : (
              <div>
                <p className="mb-1 text-xs text-[var(--text-secondary)]">
                  投稿予定文章
                </p>
                <p className="whitespace-pre-wrap text-sm text-foreground">
                  {item.generatedText}
                </p>
              </div>
            )}
            <div className="flex flex-wrap gap-2">
              {editingId === item.id ? (
                <>
                  <Button
                    size="sm"
                    isLoading={busyId === item.id}
                    onClick={() => void runAction(item.id, "edit", editText)}
                  >
                    修正を保存
                  </Button>
                  <Button
                    size="sm"
                    variant="secondary"
                    onClick={() => setEditingId(null)}
                  >
                    戻る
                  </Button>
                </>
              ) : (
                <>
                  <Button
                    size="sm"
                    isLoading={busyId === item.id}
                    onClick={() => void runAction(item.id, "publish")}
                  >
                    投稿する
                  </Button>
                  <Button
                    size="sm"
                    variant="secondary"
                    onClick={() => {
                      setEditingId(item.id);
                      setEditText(item.generatedText);
                    }}
                  >
                    修正する
                  </Button>
                  <Button
                    size="sm"
                    variant="secondary"
                    isLoading={busyId === item.id}
                    onClick={() => void runAction(item.id, "skip")}
                  >
                    今回は停止する
                  </Button>
                </>
              )}
            </div>
          </li>
        ))}
      </ul>
    </section>
  );
}
