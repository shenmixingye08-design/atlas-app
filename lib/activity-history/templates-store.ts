import type { ActivityHistoryTemplate } from "./types";

const STORAGE_KEY = "atlas-activity-history-templates";

function readTemplates(): ActivityHistoryTemplate[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    return JSON.parse(raw) as ActivityHistoryTemplate[];
  } catch {
    return [];
  }
}

function writeTemplates(templates: ActivityHistoryTemplate[]): void {
  if (typeof window === "undefined") return;
  window.localStorage.setItem(STORAGE_KEY, JSON.stringify(templates));
}

export function listActivityTemplates(): ActivityHistoryTemplate[] {
  return readTemplates().sort(
    (a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime(),
  );
}

export function saveActivityTemplate(
  template: Omit<ActivityHistoryTemplate, "id" | "createdAt">,
): ActivityHistoryTemplate {
  const entry: ActivityHistoryTemplate = {
    ...template,
    id: crypto.randomUUID(),
    createdAt: new Date().toISOString(),
  };
  writeTemplates([entry, ...readTemplates()]);
  return entry;
}
