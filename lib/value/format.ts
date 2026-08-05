export function formatHoursMinutes(totalMinutes: number): string {
  const minutes = Math.max(0, Math.round(totalMinutes));
  const hours = Math.floor(minutes / 60);
  const rem = minutes % 60;
  if (hours <= 0) return `${rem}分`;
  if (rem === 0) return `${hours}時間`;
  return `${hours}時間${rem}分`;
}

export function formatYen(amount: number): string {
  return `¥${Math.round(amount).toLocaleString("ja-JP")}`;
}
