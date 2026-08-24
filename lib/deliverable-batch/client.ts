import type {
  CreateDeliverableBatchInput,
  DeliverableBatch,
  DeliverableBatchWithItems,
} from "./types";

async function parseJson<T>(response: Response): Promise<T> {
  if (!response.ok) {
    const body = (await response.json().catch(() => ({}))) as { error?: string };
    throw new Error(body.error ?? "まとめて作成を進められませんでした。");
  }
  return (await response.json()) as T;
}

export async function createDeliverableBatchClient(
  input: CreateDeliverableBatchInput,
): Promise<DeliverableBatchWithItems> {
  const response = await fetch("/api/deliverable-batches", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(input),
  });
  const payload = await parseJson<{ view: DeliverableBatchWithItems }>(response);
  return payload.view;
}

export async function fetchDeliverableBatchesClient(): Promise<DeliverableBatch[]> {
  const response = await fetch("/api/deliverable-batches", { cache: "no-store" });
  const payload = await parseJson<{ batches: DeliverableBatch[] }>(response);
  return payload.batches;
}

export async function fetchDeliverableBatchClient(
  batchId: string,
): Promise<DeliverableBatchWithItems> {
  const response = await fetch(`/api/deliverable-batches/${batchId}`, {
    cache: "no-store",
  });
  return parseJson<DeliverableBatchWithItems>(response);
}

export async function runDeliverableBatchAction(
  batchId: string,
  action:
    | "sample"
    | "generate_remaining"
    | "retry_failed"
    | "cancel"
    | "clone"
    | "approve_all"
    | "delete_items"
    | "regenerate_selected",
  extra?: Record<string, unknown>,
): Promise<DeliverableBatchWithItems> {
  const response = await fetch(`/api/deliverable-batches/${batchId}/actions`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ action, ...extra }),
  });
  return parseJson<DeliverableBatchWithItems>(response);
}

export async function parseDeliverableBatchSpreadsheetClient(
  file: File,
): Promise<{
  headers: string[];
  rows: Array<Record<string, string>>;
  previewCount: number;
  duplicateWarnings: string[];
  emptyDropped: number;
}> {
  const form = new FormData();
  form.set("file", file);
  const response = await fetch("/api/deliverable-batches/parse-spreadsheet", {
    method: "POST",
    body: form,
  });
  return parseJson(response);
}

export async function patchDeliverableBatchItemClient(
  batchId: string,
  itemId: string,
  patch: Record<string, unknown>,
): Promise<void> {
  await fetch(`/api/deliverable-batches/${batchId}/items/${itemId}`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(patch),
  });
}
