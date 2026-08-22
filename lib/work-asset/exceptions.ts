/**
 * VALUE 7 — exception-first. Never "エラーが発生しました" alone.
 */

export type WorkExceptionKind =
  | "x_disconnected"
  | "calendar_permission"
  | "low_confidence"
  | "gmail_missing_to"
  | "generic_failed";

export type WorkExceptionView = {
  kind: WorkExceptionKind;
  workStatus: "needs_attention";
  title: string;
  body: string;
  cta: { label: string; href: string };
  alreadyPosted: boolean;
};

const GENERIC_ONLY = /^(エラーが発生しました|再試行してください)[。．]?$/;

export function classifyWorkException(input: {
  errorText?: string | null;
  code?: string | null;
  alreadyPosted?: boolean;
  lowConfidenceCount?: number;
}): WorkExceptionView {
  const hay = `${input.code ?? ""} ${input.errorText ?? ""}`.toLowerCase();
  if (input.alreadyPosted) {
    return {
      kind: "x_disconnected",
      workStatus: "needs_attention",
      title: "投稿は完了しています",
      body: "すでにXへ投稿済みです。再投稿はしません。",
      cta: { label: "履歴を見る", href: "/history" },
      alreadyPosted: true,
    };
  }
  if (/x_|twitter|再連携|再接続|oauth|token|disconnected/.test(hay)) {
    return {
      kind: "x_disconnected",
      workStatus: "needs_attention",
      title: "Xとの接続が切れています",
      body: "この仕事を再開するには、Xを再連携してください。",
      cta: { label: "Xを再連携", href: "/settings/x" },
      alreadyPosted: false,
    };
  }
  if (/calendar|カレンダー|permission|権限|読み取/.test(hay)) {
    return {
      kind: "calendar_permission",
      workStatus: "needs_attention",
      title: "Google Calendarの予定を読み取れません",
      body: "権限を再確認してから、この仕事を続けられます。",
      cta: { label: "権限を再確認", href: "/settings/google/calendar" },
      alreadyPosted: false,
    };
  }
  if ((input.lowConfidenceCount ?? 0) > 0 || /要確認|low_confidence|低信頼/.test(hay)) {
    const n = input.lowConfidenceCount ?? 1;
    return {
      kind: "low_confidence",
      workStatus: "needs_attention",
      title: `この${n}箇所だけ確認してください`,
      body: "成果物全体ではなく、要確認箇所だけ直せば次に進めます。",
      cta: { label: "要確認を見る", href: "/workspace" },
      alreadyPosted: false,
    };
  }
  if (/gmail|宛先|missing_to|to が/.test(hay)) {
    return {
      kind: "gmail_missing_to",
      workStatus: "needs_attention",
      title: "メールの宛先がありません",
      body: "宛先を設定してから下書きを作れます。送信はしません。",
      cta: { label: "Gmail設定を開く", href: "/settings/google/gmail" },
      alreadyPosted: false,
    };
  }
  return {
    kind: "generic_failed",
    workStatus: "needs_attention",
    title: "この仕事は途中で止まりました",
    body: input.errorText?.trim() || "内容を確認して、必要な操作だけ行ってください。",
    cta: { label: "仕事を確認", href: "/automations" },
    alreadyPosted: false,
  };
}

export function isGenericFailureOnly(text: string): boolean {
  return GENERIC_ONLY.test(text.trim());
}
