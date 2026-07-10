import type { SalesCostMode, SalesMaterialOutline } from "./types";

export async function requestSalesMaterialOutline(
  assignment: string,
  costMode: SalesCostMode,
  signal?: AbortSignal,
): Promise<SalesMaterialOutline> {
  const response = await fetch("/api/sales-material/outline", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ assignment, costMode }),
    signal,
  });

  const data = (await response.json()) as {
    outline?: SalesMaterialOutline;
    error?: string;
  };

  if (!response.ok) {
    throw new Error(data.error ?? "構成案の生成に失敗しました");
  }

  if (!data.outline) {
    throw new Error("構成案が返されませんでした");
  }

  return data.outline;
}
