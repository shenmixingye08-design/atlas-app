import type { LedgerEntry, ReceiptSchema } from "./types";

/** Rule-based secretary suggestions — no extra LLM. */
export function buildReceiptSuggestions(input: {
  schemas: ReceiptSchema[];
  entries: LedgerEntry[];
  newEntries: Array<Pick<LedgerEntry, "storeName" | "itemName" | "amountInclTax" | "date" | "category" | "moneyUse">>;
}): string[] {
  const tips: string[] = [];
  const store = input.schemas[0]?.storeName?.trim();

  if (store) {
    const sameStore = input.entries.filter((entry) => entry.storeName === store);
    if (sameStore.length >= 3) {
      tips.push(
        `「${store}」での購入が続いています。定期購入や習慣支出の可能性があります。`,
      );
    }
  }

  const itemNames = new Set(
    input.newEntries.map((entry) => entry.itemName.replace(/\s+/g, "")),
  );
  for (const name of itemNames) {
    const recent = input.entries.filter(
      (entry) => entry.itemName.replace(/\s+/g, "") === name,
    );
    if (recent.length >= 2) {
      tips.push(`「${name}」を繰り返し購入しています。在庫・まとめ買いを見直せます。`);
      break;
    }
  }

  const totals = input.schemas
    .map((schema) => schema.total)
    .filter((n): n is number => typeof n === "number");
  const sum = totals.reduce((a, b) => a + b, 0);
  if (sum >= 10_000) {
    tips.push("今回の合計が1万円以上です。予算内か一度確認することをおすすめします。");
  }

  if (input.newEntries.some((entry) => entry.moneyUse === "business")) {
    tips.push("経費候補です。確定申告や会社経費精算の明細として残しておくと便利です。");
  }

  const payment = input.schemas[0]?.paymentMethod ?? "";
  if (/サブスク|定期|subscription|月額/i.test(payment + (input.schemas[0]?.rawNotes ?? ""))) {
    tips.push("サブスクリプションの可能性があります。解約忘れがないか確認してください。");
  }

  if (tips.length === 0) {
    tips.push("登録後は月次分析で先月比を確認できます。");
  }

  return tips.slice(0, 5);
}
