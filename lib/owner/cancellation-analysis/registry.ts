import type {
  CancellationReasonDefinition,
  CancellationReasonId,
} from "./types";

export const CANCELLATION_REASON_DEFINITIONS: readonly CancellationReasonDefinition[] =
  [
    { id: "price", label: "価格" },
    { id: "not_used", label: "使わなかった" },
    { id: "too_difficult", label: "難しかった" },
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
