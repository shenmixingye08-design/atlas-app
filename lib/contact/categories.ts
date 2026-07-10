import type { ContactCategoryId } from "./types";

export type ContactCategoryOption = {
  id: ContactCategoryId;
  label: string;
};

export const CONTACT_CATEGORIES: readonly ContactCategoryOption[] = [
  { id: "service", label: "サービスについて" },
  { id: "bug", label: "不具合報告" },
  { id: "billing", label: "請求/支払い" },
  { id: "cancellation", label: "解約" },
  { id: "integration", label: "外部連携" },
  { id: "enterprise", label: "法人利用" },
  { id: "other", label: "その他" },
] as const;

const categoryIds = new Set(CONTACT_CATEGORIES.map((item) => item.id));

export function isContactCategoryId(value: string): value is ContactCategoryId {
  return categoryIds.has(value as ContactCategoryId);
}

export function getContactCategoryLabel(id: ContactCategoryId): string {
  return CONTACT_CATEGORIES.find((item) => item.id === id)?.label ?? id;
}
