import type { MemorySuggestion, UserMemory } from "./types";

const WEEKDAY_LABELS = ["日", "月", "火", "水", "木", "金", "土"];

function countByCategory(memories: UserMemory[]): Map<string, number> {
  const counts = new Map<string, number>();
  for (const memory of memories) {
    counts.set(memory.category, (counts.get(memory.category) ?? 0) + 1);
  }
  return counts;
}

export function buildMemorySuggestions(memories: UserMemory[]): MemorySuggestion[] {
  if (memories.length === 0) return [];

  const suggestions: MemorySuggestion[] = [];
  const counts = countByCategory(memories);

  const salesCount = counts.get("sales") ?? 0;
  if (salesCount >= 2) {
    const day = WEEKDAY_LABELS[new Date().getDay()];
    suggestions.push({
      id: "sales-frequency",
      message: `毎週${day}曜は営業資料が多いようです。`,
      category: "sales",
      confidence: 0.7,
    });
  }

  const timeMemory = memories.find((m) => m.learningKey === "post_time");
  if (timeMemory) {
    suggestions.push({
      id: "post-time",
      message: `${timeMemory.content}の投稿を優先しています。`,
      category: "sns",
      confidence: timeMemory.confidence,
    });
  } else {
    suggestions.push({
      id: "post-time-default",
      message: "朝8時投稿を優先しています。",
      category: "sns",
      confidence: 0.45,
    });
  }

  const formatMemory = memories.find(
    (m) => m.learningKey === "layout" && m.category === "sales",
  );
  if (formatMemory) {
    suggestions.push({
      id: "sales-style",
      message: `営業資料は「${formatMemory.content}」を好む傾向があります。`,
      category: "sales",
      confidence: formatMemory.confidence,
    });
  }

  const automationCount = counts.get("automation") ?? 0;
  if (automationCount >= 2) {
    suggestions.push({
      id: "automation-trend",
      message: "自動化の利用が増えています。",
      category: "automation",
      confidence: 0.65,
    });
  }

  const topService = memories.find((m) => m.learningKey === "preferred_service");
  if (topService) {
    suggestions.push({
      id: "preferred-service",
      message: `「${topService.title.replace("よく使う仕事: ", "")}」をよく使っています。`,
      category: topService.category,
      confidence: topService.confidence,
    });
  }

  return suggestions.slice(0, 5);
}

export function partitionMemoriesForUi(memories: UserMemory[]) {
  const pinned = memories.filter((m) => m.pinned);
  const recent = [...memories]
    .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())
    .slice(0, 8);

  const workStyle = memories.filter((m) =>
    ["writing", "honorific", "sentence_ending", "text_length", "emoji", "color", "font", "layout"].includes(
      m.learningKey ?? "",
    ) || ["writing", "sales", "blog"].includes(m.category),
  );

  const preferredAi = memories.filter(
    (m) => m.learningKey === "preferred_ai_employee" || m.category === "automation",
  );

  const usageTrends = memories.filter(
    (m) => m.learningKey === "preferred_service" || m.title.startsWith("よく使う仕事"),
  );

  const automationTrends = memories.filter(
    (m) =>
      m.category === "automation" ||
      m.category === "schedule" ||
      m.learningKey === "post_time" ||
      m.learningKey === "post_day",
  );

  return {
    recent,
    workStyle: workStyle.slice(0, 10),
    preferredAi: preferredAi.slice(0, 8),
    usageTrends: usageTrends.slice(0, 8),
    automationTrends: automationTrends.slice(0, 8),
    pinned,
  };
}
