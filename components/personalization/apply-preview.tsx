"use client";

type ApplyPreviewProps = {
  lines: string[];
  onContinue?: () => void;
  onEdit?: () => void;
  onSkipThisTime?: () => void;
};

/**
 * Pre-generation preview — user-facing preference lines only.
 * No confidence numbers or internal jargon.
 */
export function MemoryApplyPreview({
  lines,
  onContinue,
  onEdit,
  onSkipThisTime,
}: ApplyPreviewProps) {
  if (lines.length === 0) return null;

  return (
    <section className="space-y-3" aria-label="今回適用する好み">
      <h2 className="text-base font-medium">今回適用する好み</h2>
      <ul className="list-disc space-y-1 pl-5 text-sm">
        {lines.map((line) => (
          <li key={line}>{line}</li>
        ))}
      </ul>
      <div className="flex flex-wrap gap-2">
        <button type="button" className="text-sm underline" onClick={onContinue}>
          このまま作成
        </button>
        <button type="button" className="text-sm underline" onClick={onEdit}>
          一部変更
        </button>
        <button
          type="button"
          className="text-sm underline"
          onClick={onSkipThisTime}
        >
          今回だけ外す
        </button>
      </div>
    </section>
  );
}
