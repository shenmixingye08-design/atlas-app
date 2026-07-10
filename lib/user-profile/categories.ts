import type { JobCategoryId } from "./types";

const CATEGORY_LABELS: Record<JobCategoryId, string> = {
  sales_material: "営業資料",
  blog: "ブログ",
  sns_post: "SNS投稿",
  video: "動画",
  email: "メール",
  file_organize: "ファイル整理",
  generic: "その他",
};

/** Infer job category from free text (title, assignment, habit name). */
export function inferJobCategory(text: string): JobCategoryId {
  const normalized = text.toLowerCase();

  if (/営業資料|プレゼン|powerpoint|pptx|ppt|提案資料|スライド/.test(normalized)) {
    return "sales_material";
  }
  if (/ブログ|blog|wordpress|記事/.test(normalized)) {
    return "blog";
  }
  if (/sns|x\(|twitter|ツイート|投稿|instagram|インスタ|ココナラ/.test(normalized)) {
    return "sns_post";
  }
  if (/動画|youtube|ユーチューブ|video/.test(normalized)) {
    return "video";
  }
  if (/メール|mail|返信/.test(normalized)) {
    return "email";
  }
  if (/ファイル|整理|drive|フォルダ/.test(normalized)) {
    return "file_organize";
  }

  return "generic";
}

export function getJobCategoryLabel(category: JobCategoryId): string {
  return CATEGORY_LABELS[category];
}
