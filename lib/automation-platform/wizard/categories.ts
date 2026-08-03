import type { AutomationCapabilityId } from "@/lib/automation-platform/types";
import { getCapability } from "@/lib/automation-platform/step-registry/registry";
import type { FeatureAvailabilityMap } from "@/lib/feature-flags/types";

export type WorkCategoryId =
  | "document"
  | "spreadsheet"
  | "vision"
  | "convert"
  | "email"
  | "sns"
  | "calendar"
  | "storage"
  | "blog"
  | "notify"
  | "combine";

export type WorkCategory = {
  id: WorkCategoryId;
  label: string;
  description: string;
  popular: boolean;
  capabilityIds: AutomationCapabilityId[];
};

export const WORK_CATEGORIES: readonly WorkCategory[] = [
  {
    id: "document",
    label: "文書を作る",
    description: "Word・提案書・報告書など",
    popular: true,
    capabilityIds: ["word_generate", "pdf_generate", "powerpoint_generate"],
  },
  {
    id: "spreadsheet",
    label: "表・データをまとめる",
    description: "Excelや集計",
    popular: true,
    capabilityIds: ["excel_generate", "data_extract"],
  },
  {
    id: "vision",
    label: "画像や書類を読み取る",
    description: "写真・PDFの読み取り",
    popular: false,
    capabilityIds: ["vision_analysis", "ocr"],
  },
  {
    id: "convert",
    label: "ファイルを変換する",
    description: "形式変換",
    popular: false,
    capabilityIds: ["file_convert", "pdf_generate"],
  },
  {
    id: "email",
    label: "メールを作る・送る",
    description: "下書きまたは送信",
    popular: true,
    capabilityIds: ["gmail"],
  },
  {
    id: "sns",
    label: "SNSへ投稿する",
    description: "Xへの投稿",
    popular: true,
    capabilityIds: ["x_post"],
  },
  {
    id: "calendar",
    label: "カレンダーへ登録する",
    description: "予定の作成",
    popular: false,
    capabilityIds: ["google_calendar"],
  },
  {
    id: "storage",
    label: "ファイルを保存する",
    description: "Google Drive・Dropboxなどへ保存",
    popular: true,
    capabilityIds: ["google_drive", "dropbox"],
  },
  {
    id: "blog",
    label: "ブログを作成・投稿する",
    description: "WordPress",
    popular: false,
    capabilityIds: ["wordpress", "word_generate"],
  },
  {
    id: "notify",
    label: "通知する",
    description: "完了や確認の知らせ",
    popular: true,
    capabilityIds: ["notify"],
  },
  {
    id: "combine",
    label: "複数の仕事を組み合わせる",
    description: "順番にいくつかの仕事を実行",
    popular: true,
    capabilityIds: ["orchestrate", "deliverable_generate"],
  },
] as const;

export type CategoryAvailability = {
  category: WorkCategory;
  available: boolean;
  reason: string | null;
  connectHref: string | null;
  availableCapabilities: AutomationCapabilityId[];
};

export function resolveCategoryAvailability(
  flags: FeatureAvailabilityMap,
  connectedProviders: ReadonlySet<string>,
): CategoryAvailability[] {
  return WORK_CATEGORIES.map((category) => {
    const flaggedCapabilities = category.capabilityIds.filter((id) => {
      const cap = getCapability(id);
      if (!cap?.enabled) return false;
      if (
        cap.requiredFeatureFlag &&
        flags[cap.requiredFeatureFlag as keyof FeatureAvailabilityMap] === false
      ) {
        return false;
      }
      return true;
    });

    const availableCapabilities = flaggedCapabilities.filter((id) => {
      const cap = getCapability(id);
      if (!cap?.requiredConnector) return true;
      return connectedProviders.has(cap.requiredConnector);
    });

    if (availableCapabilities.length > 0) {
      return {
        category,
        available: true,
        reason: null,
        connectHref: null,
        availableCapabilities,
      };
    }

    const missing = flaggedCapabilities
      .map((id) => getCapability(id))
      .find((cap) => cap?.requiredConnector);

    if (missing?.requiredConnector) {
      const href =
        missing.requiredConnector === "x"
          ? "/settings/x"
          : missing.requiredConnector === "wordpress"
            ? "/settings/wordpress"
            : "/connections";
      return {
        category,
        available: false,
        reason: "連携の接続が必要です",
        connectHref: href,
        availableCapabilities: [],
      };
    }

    return {
      category,
      available: false,
      reason: "現在ご利用いただけません",
      connectHref: null,
      availableCapabilities: [],
    };
  });
}
