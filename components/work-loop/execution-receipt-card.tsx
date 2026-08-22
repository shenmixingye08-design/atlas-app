import {
  RECEIPT_HEADING,
  type ExecutionReceipt,
} from "@/lib/work-loop";

export function ExecutionReceiptCard({ receipt }: { receipt: ExecutionReceipt }) {
  return (
    <section
      data-testid="execution-receipt"
      className="space-y-2 rounded-[var(--radius-lg)] border border-[var(--border)] bg-[var(--surface-elevated)] px-3.5 py-3"
    >
      <h4 className="text-sm font-semibold text-[var(--text-primary)]">{RECEIPT_HEADING}</h4>
      <p className="text-sm text-[var(--text-primary)]">{receipt.workName}</p>
      <p className="text-[length:var(--text-meta)] text-[var(--text-muted)]">
        {receipt.summary}
      </p>
      <p className="text-[length:var(--text-meta)] text-[var(--text-muted)]">
        実行ID {receipt.executionId}
      </p>
      {receipt.sideEffects.map((effect) => (
        <p
          key={`${effect.provider}-${effect.resourceId ?? effect.action}`}
          className="text-sm text-[var(--text-secondary)]"
        >
          {effect.label}
        </p>
      ))}
      {receipt.artifact ? (
        <p className="text-sm text-[var(--text-secondary)]">
          {receipt.artifact.fileName} · {receipt.artifact.format}
          {receipt.artifact.downloadable ? " · ダウンロード可" : ""}
        </p>
      ) : null}
      {receipt.gmailSent ? (
        <p className="text-sm text-[var(--text-secondary)]">メールを送信しました</p>
      ) : null}
    </section>
  );
}
