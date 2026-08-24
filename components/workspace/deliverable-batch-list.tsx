"use client";

import { useEffect, useState } from "react";
import Link from "next/link";

import { Card } from "@/components/ui/card";
import { fetchDeliverableBatchesClient } from "@/lib/deliverable-batch/client";
import type { DeliverableBatch } from "@/lib/deliverable-batch/types";

const STATUS_LABEL: Record<string, string> = {
  draft: "下書き",
  generating_sample: "試作中",
  sample_ready: "試作待ち",
  generating: "作成中",
  partially_failed: "一部失敗",
  ready: "完成",
  completed: "完了",
  cancelled: "取消",
};

export function DeliverableBatchList() {
  const [batches, setBatches] = useState<DeliverableBatch[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    void fetchDeliverableBatchesClient()
      .then(setBatches)
      .catch((err) =>
        setError(err instanceof Error ? err.message : "読み込めませんでした。"),
      );
  }, []);

  if (!batches) {
    return (
      <p className="text-sm text-[var(--text-secondary)]" role="status">
        {error ?? "読み込み中…"}
      </p>
    );
  }

  if (batches.length === 0) {
    return (
      <p className="text-sm text-[var(--text-secondary)]">
        まだまとめて作成はありません。同じ種類の成果物を一度に作れます。
      </p>
    );
  }

  return (
    <ul className="space-y-3">
      {batches.map((batch) => (
        <li key={batch.id}>
          <Link href={`/workspace/batch/${batch.id}`} className="block focus-ring">
            <Card padding="md" className="space-y-1">
              <p className="font-medium">{batch.name}</p>
              <p className="text-caption text-[var(--text-secondary)]">
                {STATUS_LABEL[batch.status] ?? batch.status} ・ {batch.requestedCount}件 ・{" "}
                {batch.format} ・ {batch.createdAt.slice(0, 16).replace("T", " ")}
              </p>
            </Card>
          </Link>
        </li>
      ))}
    </ul>
  );
}
