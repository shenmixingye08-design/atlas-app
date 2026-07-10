import { ProgressBar as UIProgressBar } from "@/components/ui/progress";

type ProgressBarProps = {
  progress: number;
  size?: "sm" | "md";
};

export function ProgressBar({ progress, size = "md" }: ProgressBarProps) {
  const clamped = Math.min(100, Math.max(0, progress));

  return (
    <UIProgressBar
      value={clamped}
      size={size === "sm" ? "sm" : "md"}
      showLabel
    />
  );
}
