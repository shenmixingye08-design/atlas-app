import type { MoneyUse, ReceiptSchema } from "./types";

export type BusinessGuessInput = {
  schemas: ReceiptSchema[];
  /** Optional company/brand signal from company template or memory. */
  companyHint?: string | null;
  hasBusinessContext?: boolean;
};

export type BusinessGuessResult = {
  moneyUse: MoneyUse;
  askExpenseConfirmation: boolean;
  reason: string;
};

/**
 * Estimate personal vs business spend.
 * Business Profile entity is not on main — use company hint + receipt cues.
 */
export function guessMoneyUse(input: BusinessGuessInput): BusinessGuessResult {
  const text = input.schemas
    .map((schema) =>
      [
        schema.storeName,
        schema.address,
        schema.rawNotes,
        ...schema.items.map((item) => item.name),
      ].join(" "),
    )
    .join(" ");

  const businessSignals =
    /株式会社|有限会社|領収書|御中|請求|税理士|オフィス|文具|会議|接待|出張|copa|コピー/.test(
      text,
    ) ||
    (input.companyHint
      ? text.includes(input.companyHint.replace(/\s+/g, ""))
      : false);

  if (businessSignals || input.hasBusinessContext) {
    return {
      moneyUse: "business",
      askExpenseConfirmation: true,
      reason: "会社経費の可能性があるため確認します",
    };
  }

  return {
    moneyUse: "personal",
    askExpenseConfirmation: false,
    reason: "個人利用と推定",
  };
}
