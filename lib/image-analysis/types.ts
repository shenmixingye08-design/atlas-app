/** Image document analysis types (structured extraction from attachments). */

export type ImageDocumentType =
  | "table"
  | "receipt"
  | "invoice"
  | "estimate"
  | "handwritten"
  | "business_card"
  | "unknown";

/** User-visible processing status for image document jobs. */
export type ImageAnalysisStatus =
  | "fetching_attachments"
  | "analyzing_images"
  | "validating_data"
  | "creating_deliverable"
  | "completed"
  | "image_fetch_failed"
  | "analysis_failed";

export const IMAGE_ANALYSIS_STATUS_LABELS: Record<ImageAnalysisStatus, string> = {
  fetching_attachments: "添付画像を取得中",
  analyzing_images: "画像を解析中",
  validating_data: "データを確認中",
  creating_deliverable: "成果物を作成中",
  completed: "完了",
  image_fetch_failed: "画像取得失敗",
  analysis_failed: "解析失敗",
};

export const IMAGE_FETCH_FAILED_USER_MESSAGE =
  "画像を読み込めませんでした。通信環境を確認し、画像をもう一度添付してください。";

export const IMAGE_ANALYSIS_FAILED_USER_MESSAGE =
  "画像の解析結果を正しく生成できませんでした。もう一度お試しください。";

export const AMOUNT_MISMATCH_WARNING =
  "明細合計と記載された合計金額が一致しません。画像をご確認ください。";

export type ReviewFieldMark = "要確認" | "判読不能" | "空欄";

export type ImageAnalysisSourceFile = {
  sourceFileId: string;
  fileName: string;
  mimeType: string;
  pageIndex: number;
  status: "ok" | "failed";
  error?: string;
};

export type ImageAnalysisBase = {
  documentType: ImageDocumentType;
  title: string;
  warnings: string[];
  confidence: number;
  requiresReview: boolean;
  sourceFileId: string | null;
  sourceFiles: ImageAnalysisSourceFile[];
  createdAt: string;
};

export type TableImageAnalysis = ImageAnalysisBase & {
  documentType: "table";
  fields: {
    columns: string[];
    notes?: string;
  };
  rows: Array<Record<string, string | number | null>>;
};

export type ReceiptLineItem = {
  name: string;
  quantity: number | null;
  unitPrice: number | null;
  subtotal: number | null;
  discount: number | null;
  taxRate: number | null;
  category: string;
  note?: string;
};

export type ReceiptImageAnalysis = ImageAnalysisBase & {
  documentType: "receipt";
  fields: {
    purchaseDate: string | null;
    purchaseTime: string | null;
    storeName: string | null;
    storeAddress: string | null;
    taxAmount: number | null;
    totalAmount: number | null;
    paymentMethod: string | null;
    currency?: string;
  };
  rows: ReceiptLineItem[];
};

export type InvoiceLineItem = {
  name: string;
  quantity: number | null;
  unitPrice: number | null;
  amount: number | null;
  note?: string;
};

export type InvoiceImageAnalysis = ImageAnalysisBase & {
  documentType: "invoice" | "estimate";
  fields: {
    documentKind: "invoice" | "estimate";
    issueDate: string | null;
    billingDate: string | null;
    dueDate: string | null;
    documentNumber: string | null;
    issuerName: string | null;
    recipientName: string | null;
    postalCode: string | null;
    address: string | null;
    phone: string | null;
    email: string | null;
    subtotal: number | null;
    taxAmount: number | null;
    totalAmount: number | null;
    bankAccount: string | null;
    notes: string | null;
  };
  rows: InvoiceLineItem[];
};

export type HandwrittenTodoItem = {
  title: string;
  assignee: string | null;
  dueDate: string | null;
  priority: "high" | "medium" | "low" | "要確認" | null;
  note?: string;
};

export type HandwrittenImageAnalysis = ImageAnalysisBase & {
  documentType: "handwritten";
  fields: {
    transcript: string;
    cleanedText: string;
    unclearSpans: string[];
  };
  rows: HandwrittenTodoItem[];
};

export type BusinessCardRecord = {
  fullName: string | null;
  fullNameKana: string | null;
  company: string | null;
  department: string | null;
  title: string | null;
  postalCode: string | null;
  address: string | null;
  phone: string | null;
  mobile: string | null;
  fax: string | null;
  email: string | null;
  website: string | null;
  sns: string | null;
  note?: string;
  sourceFileId: string | null;
};

export type BusinessCardImageAnalysis = ImageAnalysisBase & {
  documentType: "business_card";
  fields: {
    contacts: BusinessCardRecord[];
  };
  rows: BusinessCardRecord[];
};

export type UnknownImageAnalysis = ImageAnalysisBase & {
  documentType: "unknown";
  fields: Record<string, unknown>;
  rows: Array<Record<string, unknown>>;
};

export type ImageAnalysisResult =
  | TableImageAnalysis
  | ReceiptImageAnalysis
  | InvoiceImageAnalysis
  | HandwrittenImageAnalysis
  | BusinessCardImageAnalysis
  | UnknownImageAnalysis;

export const IMAGE_ANALYSIS_METADATA_KEY = "imageAnalysis" as const;
export const IMAGE_ANALYSIS_STATUS_KEY = "imageAnalysisStatus" as const;
