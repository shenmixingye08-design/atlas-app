import type {
  CancellationReasonDefinition,
  CancellationReasonId,
} from "./types";

export const CANCELLATION_REASON_DEFINITIONS: readonly CancellationReasonDefinition[] =
  [
    { id: "price", label: "価格が高い" },
    { id: "too_difficult", label: "使い方が分からない" },
    { id: "missing_feature", label: "必要な機能がない" },
    { id: "not_working", label: "正常に動かなかった" },
    { id: "not_used", label: "利用頻度が少ない" },
    { id: "temporary", label: "一時的に不要" },
    { id: "other", label: "その他" },
  ] as const;

export const CANCELLATION_REASON_IDS: readonly CancellationReasonId[] =
  CANCELLATION_REASON_DEFINITIONS.map((definition) => definition.id);

export function getCancellationReasonDefinition(
  id: CancellationReasonId,
): CancellationReasonDefinition {
  const definition = CANCELLATION_REASON_DEFINITIONS.find(
    (entry) => entry.id === id,
  );
  if (!definition) {
    throw new Error(`Cancellation reason not found: ${id}`);
  }
  return definition;
}

export function isCancellationReasonId(
  value: string,
): value is CancellationReasonId {
  return CANCELLATION_REASON_IDS.includes(value as CancellationReasonId);
}
