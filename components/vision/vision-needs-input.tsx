"use client";

import { Button } from "@/components/ui/button";

type VisionNeedsInputProps = {
  message: string;
  fields: string[];
  onContinueWithInput?: () => void;
  onRetake?: () => void;
  onContinueUnknown?: () => void;
};

export function VisionNeedsInput({
  message,
  fields,
  onContinueWithInput,
  onRetake,
  onContinueUnknown,
}: VisionNeedsInputProps) {
  if (fields.length === 0) return null;

  return (
    <div className="space-y-3 rounded-lg border border-amber-300/60 bg-amber-50/40 p-3">
      <div>
        <p className="text-sm font-medium text-foreground">{message}</p>
        <ul className="mt-2 list-disc pl-5 text-sm text-[var(--text-secondary)]">
          {fields.map((field) => (
            <li key={field}>{field}</li>
          ))}
        </ul>
      </div>
      <div className="flex flex-wrap gap-2">
        {onContinueWithInput && (
          <Button type="button" size="sm" onClick={onContinueWithInput}>
            入力して続ける
          </Button>
        )}
        {onRetake && (
          <Button type="button" size="sm" variant="secondary" onClick={onRetake}>
            画像を撮り直す
          </Button>
        )}
        {onContinueUnknown && (
          <Button type="button" size="sm" variant="ghost" onClick={onContinueUnknown}>
            不明のまま続ける
          </Button>
        )}
      </div>
    </div>
  );
}
