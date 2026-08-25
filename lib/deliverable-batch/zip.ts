import { createZipArchive } from "@/lib/data-export/zip";

import type { DeliverableBatch, DeliverableBatchItem } from "./types";

const SAFE_NAME = /[^A-Za-z0-9._\u3040-\u30ff\u4e00-\u9fff-]+/g;

export function safeZipEntryName(name: string, used: Set<string>): string {
  const cleaned = name
    .replace(/\\/g, "/")
    .split("/")
    .filter((part) => part && part !== "." && part !== "..")
    .join("_")
    .replace(SAFE_NAME, "_")
    .replace(/^\.+/, "")
    .slice(0, 80);
  const base = cleaned || "item";
  let candidate = base;
  let index = 2;
  while (used.has(candidate.toLowerCase())) {
    const dot = base.lastIndexOf(".");
    candidate =
      dot > 0
        ? `${base.slice(0, dot)}-${index}${base.slice(dot)}`
        : `${base}-${index}`;
    index += 1;
  }
  used.add(candidate.toLowerCase());
  return candidate;
}

export function buildBatchManifest(
  batch: DeliverableBatch,
  items: DeliverableBatchItem[],
): string {
  const success = items.filter(
    (item) => item.status === "ready" || item.status === "approved",
  ).length;
  const failed = items.filter((item) => item.status === "failed").length;
  return JSON.stringify(
    {
      batchName: batch.name,
      createdAt: batch.createdAt,
      itemCount: items.length,
      successCount: success,
      failedCount: failed,
      items: items.map((item) => ({
        order: item.order + 1,
        title: item.title,
        fileName: item.fileName,
        status: item.status,
        format: item.outputFormat,
      })),
    },
    null,
    2,
  );
}

export function buildBatchReadme(batch: DeliverableBatch): string {
  return [
    `${batch.name} の成果物`,
    "",
    "このZIPには、まとめて作成した成果物と一覧（manifest.json）が入っています。",
    "各ファイルを開いて内容をご確認ください。",
    "失敗した項目がある場合は、画面から失敗項目だけ再試行できます。",
  ].join("\n");
}

export function createDeliverableBatchZip(input: {
  batch: DeliverableBatch;
  items: DeliverableBatchItem[];
  files: Array<{ itemId: string; fileName: string; data: Uint8Array }>;
}): Uint8Array {
  const used = new Set<string>();
  const entries: Array<{ name: string; data: Uint8Array }> = [];
  for (const file of input.files) {
    entries.push({
      name: safeZipEntryName(file.fileName, used),
      data: file.data,
    });
  }
  const manifest = buildBatchManifest(input.batch, input.items);
  const readme = buildBatchReadme(input.batch);
  entries.push({
    name: safeZipEntryName("manifest.json", used),
    data: new TextEncoder().encode(manifest),
  });
  entries.push({
    name: safeZipEntryName("README.txt", used),
    data: new TextEncoder().encode(readme),
  });
  return createZipArchive(entries);
}
