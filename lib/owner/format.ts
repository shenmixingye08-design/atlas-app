const usdFormatter = new Intl.NumberFormat("ja-JP", {
  style: "currency",
  currency: "USD",
  maximumFractionDigits: 0,
});

const usdDetailedFormatter = new Intl.NumberFormat("ja-JP", {
  style: "currency",
  currency: "USD",
  maximumFractionDigits: 2,
});

export function formatOwnerUsd(amount: number, detailed = false): string {
  const formatter = detailed ? usdDetailedFormatter : usdFormatter;
  return formatter.format(amount);
}

export function formatOwnerPercent(value: number): string {
  return `${Math.round(value)}%`;
}

export function formatOwnerMonthLabel(now: Date = new Date()): string {
  return new Intl.DateTimeFormat("ja-JP", {
    year: "numeric",
    month: "long",
  }).format(now);
}

export function formatOwnerMonthKey(now: Date = new Date()): string {
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;
}

export function formatOwnerDate(iso: string): string {
  try {
    return new Intl.DateTimeFormat("ja-JP", {
      dateStyle: "medium",
      timeStyle: "short",
    }).format(new Date(iso));
  } catch {
    return iso;
  }
}

export function formatOwnerJpy(amount: number): string {
  return new Intl.NumberFormat("ja-JP", {
    style: "currency",
    currency: "JPY",
    maximumFractionDigits: 0,
  }).format(amount);
}

export function formatOwnerDuration(ms: number): string {
  if (ms <= 0) return "—";
  if (ms < 1000) return `${Math.round(ms)}ms`;

  const totalSeconds = Math.round(ms / 1000);
  if (totalSeconds < 60) return `${totalSeconds}秒`;

  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  return seconds > 0 ? `${minutes}分${seconds}秒` : `${minutes}分`;
}
