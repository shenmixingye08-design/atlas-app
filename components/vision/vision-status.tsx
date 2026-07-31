"use client";

type VisionStatusProps = {
  status?: string | null;
  label?: string | null;
  analyzing?: boolean;
  error?: string | null;
};

const STATUS_LABEL: Record<string, string> = {
  uploading: "画像をアップロード中",
  uploaded: "画像の準備ができました",
  processing: "画像を解析中",
  analyzed: "画像解析が完了しました",
  needs_input: "追加確認が必要です",
  needs_reanalysis: "再解析が可能です",
  temporary_error: "一時エラー（再解析可能）",
  artifact_generating: "成果物を作成中",
  completed: "完了",
  failed: "画像解析に失敗しました",
};
export function VisionStatus({
  status,
  label,
  analyzing,
  error,
}: VisionStatusProps) {
  if (!status && !analyzing && !error && !label) return null;

  return (
    <div className="rounded-lg border border-[var(--border-subtle)] bg-[var(--surface-elevated)] px-3 py-2 text-sm">
      {analyzing && <p className="text-accent">画像を解析しています…</p>}
      {!analyzing && status && (
        <p className="text-foreground">
          {STATUS_LABEL[status] ?? "画像処理中"}
        </p>
      )}
      {label && <p className="mt-1 text-[var(--text-secondary)]">{label}</p>}
      {error && <p className="mt-1 text-red-600">{error}</p>}
    </div>
  );
}
