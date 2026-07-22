import type {
  BusinessCardImageAnalysis,
  ImageAnalysisResult,
  ReceiptImageAnalysis,
} from "./types";

function contactKey(contact: {
  fullName: string | null;
  company: string | null;
  email: string | null;
  phone: string | null;
}): string {
  return [
    contact.fullName ?? "",
    contact.company ?? "",
    contact.email ?? "",
    contact.phone ?? "",
  ]
    .join("|")
    .toLowerCase();
}

function receiptKey(analysis: ReceiptImageAnalysis): string {
  return [
    analysis.fields.purchaseDate ?? "",
    analysis.fields.storeName ?? "",
    analysis.fields.totalAmount ?? "",
  ]
    .join("|")
    .toLowerCase();
}

/**
 * Merge same-type analyses (e.g. 10 receipts → one household ledger).
 * Keeps page order and warns about likely duplicates.
 */
export function mergeImageAnalyses(
  analyses: ImageAnalysisResult[],
): ImageAnalysisResult | null {
  if (analyses.length === 0) return null;
  if (analyses.length === 1) return analyses[0]!;

  const type = analyses[0]!.documentType;
  if (!analyses.every((item) => item.documentType === type)) {
    return analyses[0]!;
  }

  const createdAt = new Date().toISOString();
  const sourceFiles = analyses.flatMap((item) => item.sourceFiles);
  const warnings = analyses.flatMap((item) => item.warnings);
  const confidence =
    analyses.reduce((sum, item) => sum + item.confidence, 0) / analyses.length;
  const requiresReview =
    analyses.some((item) => item.requiresReview) || warnings.length > 0;

  if (type === "receipt") {
    const receipts = analyses as ReceiptImageAnalysis[];
    const seen = new Set<string>();
    for (const receipt of receipts) {
      const key = receiptKey(receipt);
      if (seen.has(key)) {
        warnings.push("重複レシートの可能性があります。内容をご確認ください。");
      }
      seen.add(key);
    }

    return {
      documentType: "receipt",
      title: "家計簿（複数レシート統合）",
      confidence,
      requiresReview: true,
      sourceFileId: receipts[0]?.sourceFileId ?? null,
      sourceFiles,
      createdAt,
      warnings: [...new Set(warnings)],
      fields: {
        purchaseDate: receipts[0]?.fields.purchaseDate ?? null,
        purchaseTime: null,
        storeName: "複数店舗",
        storeAddress: null,
        taxAmount: receipts.reduce(
          (sum, item) => sum + (item.fields.taxAmount ?? 0),
          0,
        ),
        totalAmount: receipts.reduce(
          (sum, item) => sum + (item.fields.totalAmount ?? 0),
          0,
        ),
        paymentMethod: null,
      },
      rows: receipts.flatMap((item) =>
        item.rows.map((row) => {
          const note = [row.note, item.fields.storeName, item.fields.purchaseDate]
            .filter(Boolean)
            .join(" / ");
          return {
            name: row.name,
            quantity: row.quantity,
            unitPrice: row.unitPrice,
            subtotal: row.subtotal,
            discount: row.discount,
            taxRate: row.taxRate,
            category: row.category,
            note,
          };
        }),
      ),
    };
  }

  if (type === "business_card") {
    const cards = analyses as BusinessCardImageAnalysis[];
    const contacts = cards.flatMap((card) => card.fields.contacts ?? card.rows);
    const seen = new Set<string>();
    for (const contact of contacts) {
      const key = contactKey(contact);
      if (seen.has(key)) {
        warnings.push("重複名刺の可能性があります。内容をご確認ください。");
      }
      seen.add(key);
    }
    return {
      documentType: "business_card",
      title: "連絡先一覧（複数名刺統合）",
      confidence,
      requiresReview,
      sourceFileId: cards[0]?.sourceFileId ?? null,
      sourceFiles,
      createdAt,
      warnings: [...new Set(warnings)],
      fields: { contacts },
      rows: contacts,
    };
  }

  if (type === "invoice" || type === "estimate") {
    const docs = analyses.filter(
      (item): item is Extract<ImageAnalysisResult, { documentType: "invoice" | "estimate" }> =>
        item.documentType === "invoice" || item.documentType === "estimate",
    );
    return {
      documentType: type,
      title: type === "estimate" ? "見積書一覧" : "請求書一覧",
      confidence,
      requiresReview,
      sourceFileId: docs[0]?.sourceFileId ?? null,
      sourceFiles,
      createdAt,
      warnings: [...new Set(warnings)],
      fields: {
        ...docs[0]!.fields,
        issuerName: "複数書類",
        notes: `${docs.length}件を統合`,
      },
      rows: docs.flatMap((doc) =>
        doc.rows.map((row) => {
          const note = [
            row.note,
            doc.fields.documentNumber,
            doc.fields.issuerName,
          ]
            .filter(Boolean)
            .join(" / ");
          return {
            name: row.name,
            quantity: row.quantity,
            unitPrice: row.unitPrice,
            amount: row.amount,
            note,
          };
        }),
      ),
    };
  }

  if (type === "table") {
    const tables = analyses.filter(
      (item): item is Extract<ImageAnalysisResult, { documentType: "table" }> =>
        item.documentType === "table",
    );
    const columns = tables[0]?.fields.columns ?? [];
    return {
      documentType: "table",
      title: "表データ（複数画像統合）",
      confidence,
      requiresReview,
      sourceFileId: tables[0]?.sourceFileId ?? null,
      sourceFiles,
      createdAt,
      warnings: [...new Set(warnings)],
      fields: { columns, notes: `${tables.length}枚を統合` },
      rows: tables.flatMap((table) => table.rows),
    };
  }

  return analyses[0]!;
}
