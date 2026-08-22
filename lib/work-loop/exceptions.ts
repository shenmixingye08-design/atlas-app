/**
 * Exception-first copy for failed receipts / reconnect CTAs.
 */

export type WorkLoopException = {
  title: string;
  body: string;
  cta: { label: string; href: string };
};

export function classifyWorkLoopException(input: {
  errorText?: string | null;
  alreadyPosted?: boolean;
}): WorkLoopException {
  if (input.alreadyPosted) {
    return {
      title: "投稿は完了しています",
      body: "すでにXへ投稿済みです。再投稿はしません。",
      cta: { label: "履歴を見る", href: "/history" },
    };
  }
  const hay = (input.errorText ?? "").toLowerCase();
  if (/x_|twitter|再連携|oauth|token|disconnected/.test(hay)) {
    return {
      title: "Xとの接続が切れています",
      body: "この仕事を再開するには、Xを再連携してください。",
      cta: { label: "Xを再連携", href: "/settings/x" },
    };
  }
  if (/calendar|カレンダー|permission|権限/.test(hay)) {
    return {
      title: "Google Calendarの予定を読み取れません",
      body: "権限を再確認してから、この仕事を続けられます。",
      cta: { label: "権限を再確認", href: "/settings/google/calendar" },
    };
  }
  return {
    title: "この仕事は途中で止まりました",
    body: input.errorText?.trim() || "内容を確認して、必要な操作だけ行ってください。",
    cta: { label: "仕事を確認", href: "/automations" },
  };
}
