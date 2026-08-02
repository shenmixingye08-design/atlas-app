/**
 * Map run artifacts into a "仕事完了一覧" (work finished), not a file dump.
 */

export type WorkCompletionStep = {
  id: string;
  label: string;
  status: "completed" | "pending" | "failed";
};

export type WorkCompletionItem = {
  id: string;
  title: string;
  href: string;
  completedAtLabel: string;
  steps: WorkCompletionStep[];
};

function inferStepsFromLabel(label: string): WorkCompletionStep[] {
  const text = label.toLowerCase();
  const steps: WorkCompletionStep[] = [];

  const push = (id: string, stepLabel: string) => {
    steps.push({ id, label: stepLabel, status: "completed" });
  };

  if (/営業|資料|powerpoint|ppt|word|docx|提案/.test(text)) {
    push("deliverable", "成果物");
  } else if (/excel|xlsx|表|整理/.test(text)) {
    push("deliverable", "表の作成");
  } else if (/pdf/.test(text)) {
    push("deliverable", "PDF作成");
  } else {
    push("deliverable", "成果物");
  }

  if (/dropbox|drive|保存|storage/.test(text)) {
    push("storage", "保存");
  }
  if (/mail|メール|gmail|送信/.test(text)) {
    push("email", "メール送信");
  }
  if (/\bx\b|twitter|投稿|sns/.test(text)) {
    push("x", "X投稿");
  }

  return steps;
}

export function buildWorkCompletionItems(
  rows: Array<{
    id: string;
    title: string;
    detail: string;
    href: string;
    meta: string;
  }>,
): WorkCompletionItem[] {
  return rows.map((row) => ({
    id: row.id,
    title: row.title,
    href: row.href,
    completedAtLabel: row.meta,
    steps: inferStepsFromLabel(`${row.title} ${row.detail}`),
  }));
}
