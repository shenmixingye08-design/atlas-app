"use client";

import { useState } from "react";

import { Button } from "@/components/ui/button";

type VisionStyleSaveProps = {
  attachmentIds: string[];
  signals: Record<string, unknown>;
  onDone?: () => void;
};

export function VisionStyleSave({
  attachmentIds,
  signals,
  onDone,
}: VisionStyleSaveProps) {
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  const choose = async (choice: "session_only" | "profile_save" | "discard") => {
    setBusy(true);
    setMessage(null);
    try {
      const response = await fetch("/api/vision/style-reference", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          choice,
          signals,
          sourceAttachmentIds: attachmentIds,
        }),
      });
      const payload = (await response.json().catch(() => ({}))) as {
        error?: string;
        profilePendingApproval?: boolean;
      };
      if (!response.ok) {
        throw new Error(payload.error || "保存に失敗しました");
      }
      if (choice === "discard") setMessage("保存しませんでした");
      else if (choice === "session_only") setMessage("今回だけ参考にします");
      else setMessage("プロフィール保存は承認待ちとして記録しました（自動反映しません）");
      onDone?.();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "保存に失敗しました");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="space-y-2 rounded-lg border border-[var(--border-subtle)] p-3">
      <p className="text-sm text-foreground">
        この画像の文体・構成をどう扱いますか？
      </p>
      <div className="flex flex-wrap gap-2">
        <Button
          type="button"
          size="sm"
          disabled={busy}
          onClick={() => void choose("session_only")}
        >
          今回だけ参考にする
        </Button>
        <Button
          type="button"
          size="sm"
          variant="secondary"
          disabled={busy}
          onClick={() => void choose("profile_save")}
        >
          プロフィールへ保存
        </Button>
        <Button
          type="button"
          size="sm"
          variant="ghost"
          disabled={busy}
          onClick={() => void choose("discard")}
        >
          保存しない
        </Button>
      </div>
      {message && (
        <p className="text-xs text-[var(--text-secondary)]">{message}</p>
      )}
    </div>
  );
}
