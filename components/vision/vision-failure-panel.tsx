"use client";

import { Button } from "@/components/ui/button";
import type { CommanderVisionGate } from "@/lib/commander/types";

type VisionFailurePanelProps = {
  gate: CommanderVisionGate;
  onRetryAnalyze?: () => void;
  onRetake?: () => void;
  onPickAnother?: () => void;
};

export function VisionFailurePanel({
  gate,
  onRetryAnalyze,
  onRetake,
  onPickAnother,
}: VisionFailurePanelProps) {
  const title =
    gate.status === "needs_input"
      ? gate.message
      : gate.status === "config_missing"
        ? "画像解析の設定が不足しています"
        : "画像の内容を解析できませんでした";

  const detail =
    gate.status === "needs_input"
      ? "画像は読み取れましたが、依頼の必須項目を確認できませんでした。成果物はまだ作成していません。"
      : gate.userCode === "missing_attachment_ids"
        ? "画像の添付IDが送信されていません。ファイル名だけでは解析できません。画像を選び直してください。"
        : gate.analysisSuccess
          ? null
          : "成果物の生成は停止しました。画像を確認してから再試行してください。";

  return (
    <div className="space-y-3 rounded-xl border border-amber-300/70 bg-amber-50/50 p-4">
      <div>
        <p className="text-sm font-medium text-foreground">{title}</p>
        {detail && (
          <p className="mt-1 text-sm text-[var(--text-secondary)]">{detail}</p>
        )}
      </div>
      <div className="flex flex-wrap gap-2">
        {onRetryAnalyze && gate.status !== "config_missing" && (
          <Button type="button" size="sm" onClick={onRetryAnalyze}>
            再解析する
          </Button>
        )}
        {onRetake && (
          <Button type="button" size="sm" variant="secondary" onClick={onRetake}>
            画像を撮り直す
          </Button>
        )}
        {onPickAnother && (
          <Button type="button" size="sm" variant="ghost" onClick={onPickAnother}>
            別の画像を選ぶ
          </Button>
        )}
      </div>
    </div>
  );
}
