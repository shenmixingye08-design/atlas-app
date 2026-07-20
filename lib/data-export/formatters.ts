import type { AtlasExportBundle } from "./types";
import { createZipArchive } from "./zip";

function escapeCsv(value: unknown): string {
  const text =
    value === null || value === undefined
      ? ""
      : typeof value === "string"
        ? value
        : JSON.stringify(value);
  if (/[",\n\r]/.test(text)) {
    return `"${text.replace(/"/g, '""')}"`;
  }
  return text;
}

function rowsToCsv(headers: string[], rows: unknown[][]): string {
  const lines = [
    headers.map(escapeCsv).join(","),
    ...rows.map((row) => row.map(escapeCsv).join(",")),
  ];
  return `${lines.join("\n")}\n`;
}

export function bundleToJson(bundle: AtlasExportBundle): string {
  return JSON.stringify(bundle, null, 2);
}

export function bundleToMarkdown(bundle: AtlasExportBundle): string {
  const lines: string[] = [
    "# MINERVOT データエクスポート",
    "",
    `- エクスポート日時: ${bundle.exportedAt}`,
    `- スキーマバージョン: ${bundle.schemaVersion}`,
    "",
  ];

  const { sections } = bundle;

  lines.push("## 仕事履歴", "");
  lines.push(`- プロジェクト数: ${sections.workHistory.projects.length}`);
  for (const project of sections.workHistory.projects.slice(0, 20)) {
    lines.push(
      `- ${project.title} (${project.status}) — ${project.workRequest.slice(0, 120)}`,
    );
  }
  if (sections.workHistory.projects.length > 20) {
    lines.push(`- …他 ${sections.workHistory.projects.length - 20} 件`);
  }
  lines.push("");

  lines.push("## 追加依頼", "", sections.chat.note, "");

  lines.push("## Memory", "");
  lines.push(`- 記憶数: ${sections.memory.memories.length}`);
  for (const memory of sections.memory.memories.slice(0, 15)) {
    lines.push(`- **${memory.title}**: ${memory.content.slice(0, 100)}`);
  }
  lines.push("");

  lines.push("## 通知", "");
  lines.push(`- 通知数: ${sections.notifications.notifications.length}`);
  lines.push("");

  lines.push("## 自動化", "");
  lines.push(`- 自動化数: ${sections.automations.automations.length}`);
  for (const automation of sections.automations.automations) {
    lines.push(`- ${automation.name} (${automation.enabled ? "有効" : "無効"})`);
  }
  lines.push("");

  lines.push("## Google連携（設定のみ）", "");
  for (const service of sections.googleSettings.services) {
    lines.push(`- ${service.serviceName}: ${service.status}`);
  }
  lines.push("");

  lines.push("## テンプレート", "");
  lines.push(`- 履歴テンプレート: ${sections.templates.activityTemplates.length}`);
  lines.push(`- 会社テンプレート: ${sections.templates.companyTemplate.templateId}`);
  lines.push("");

  lines.push("## お気に入り", "");
  lines.push(`- 件数: ${sections.favorites.items.length}`);
  lines.push("");

  lines.push("## プロフィール", "");
  lines.push(`- 更新日時: ${sections.profile.workProfile.updatedAt}`);
  lines.push("");

  return lines.join("\n");
}

export function bundleToCsv(bundle: AtlasExportBundle): string {
  const parts: string[] = [];

  parts.push("# projects");
  parts.push(
    rowsToCsv(
      ["id", "title", "status", "workRequest", "updatedAt"],
      bundle.sections.workHistory.projects.map((project) => [
        project.id,
        project.title,
        project.status,
        project.workRequest,
        project.updatedAt,
      ]),
    ),
  );

  parts.push("# memories");
  parts.push(
    rowsToCsv(
      ["memoryId", "category", "title", "content", "updatedAt"],
      bundle.sections.memory.memories.map((memory) => [
        memory.memoryId,
        memory.category,
        memory.title,
        memory.content,
        memory.updatedAt,
      ]),
    ),
  );

  parts.push("# notifications");
  parts.push(
    rowsToCsv(
      ["notificationId", "type", "title", "read", "createdAt"],
      bundle.sections.notifications.notifications.map((notification) => [
        notification.notificationId,
        notification.type,
        notification.title,
        notification.isRead,
        notification.createdAt,
      ]),
    ),
  );

  parts.push("# automations");
  parts.push(
    rowsToCsv(
      ["id", "name", "enabled", "lastRun"],
      bundle.sections.automations.automations.map((automation) => [
        automation.id,
        automation.name,
        automation.enabled,
        automation.lastRun ?? "",
      ]),
    ),
  );

  parts.push("# favorites");
  parts.push(
    rowsToCsv(
      ["id", "favorite", "templateId"],
      bundle.sections.favorites.items.map((item) => [
        item.id,
        item.favorite,
        item.metadata.templateId ?? "",
      ]),
    ),
  );

  return parts.join("\n");
}

export function bundleToZip(bundle: AtlasExportBundle): Uint8Array {
  const encoder = new TextEncoder();
  return createZipArchive([
    {
      name: "atlas-export.json",
      data: encoder.encode(bundleToJson(bundle)),
    },
    {
      name: "atlas-export.md",
      data: encoder.encode(bundleToMarkdown(bundle)),
    },
    {
      name: "atlas-export.csv",
      data: encoder.encode(bundleToCsv(bundle)),
    },
    {
      name: "README.txt",
      data: encoder.encode(
        "MINERVOT data export archive.\nImport support is planned for a future release.\n",
      ),
    },
  ]);
}

export function buildExportFileName(format: "json" | "csv" | "markdown" | "zip"): string {
  const stamp = new Date().toISOString().slice(0, 10);
  switch (format) {
    case "json":
      return `atlas-export-${stamp}.json`;
    case "csv":
      return `atlas-export-${stamp}.csv`;
    case "markdown":
      return `atlas-export-${stamp}.md`;
    case "zip":
      return `atlas-export-${stamp}.zip`;
  }
}

export function formatToMimeType(format: "json" | "csv" | "markdown" | "zip"): string {
  switch (format) {
    case "json":
      return "application/json;charset=utf-8";
    case "csv":
      return "text/csv;charset=utf-8";
    case "markdown":
      return "text/markdown;charset=utf-8";
    case "zip":
      return "application/zip";
  }
}
