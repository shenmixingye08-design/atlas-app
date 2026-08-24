export type PersonalMemoryErrorCode =
  | "MEMORY_NOT_FOUND"
  | "NOT_A_CANDIDATE"
  | "CANDIDATE_EXPIRED"
  | "CANDIDATE_SUPERSEDED"
  | "MEMORY_DISABLED"
  | "SENSITIVE_STORAGE_BLOCKED"
  | "INFERENCE_CANNOT_AUTO_ACTIVATE"
  | "EXTERNAL_CONTENT_BLOCKED"
  | "PAYLOAD_TOO_LARGE"
  | "RATE_LIMITED";

export class PersonalMemoryError extends Error {
  readonly code: PersonalMemoryErrorCode;
  readonly httpStatus: number;
  readonly retryHint: string;

  constructor(
    code: PersonalMemoryErrorCode,
    message: string,
    httpStatus: number,
    retryHint: string,
  ) {
    super(message);
    this.name = "PersonalMemoryError";
    this.code = code;
    this.httpStatus = httpStatus;
    this.retryHint = retryHint;
  }
}

export const PERSONAL_MEMORY_ERRORS: Record<
  PersonalMemoryErrorCode,
  { message: string; httpStatus: number; retryHint: string }
> = {
  MEMORY_NOT_FOUND: {
    message: "確認待ちの記憶が見つかりませんでした。",
    httpStatus: 404,
    retryHint:
      "画面を再読み込みしてから、もう一度「確認して記憶する」を押してください。",
  },
  NOT_A_CANDIDATE: {
    message: "この記憶は確認待ちの候補ではありません。",
    httpStatus: 409,
    retryHint: "一覧を再読み込みして、対象の状態を確認してください。",
  },
  CANDIDATE_EXPIRED: {
    message: "この候補の有効期限が切れています。",
    httpStatus: 410,
    retryHint: "新しい候補が必要なら、もう一度同じ修正を行うか明示して覚えてください。",
  },
  CANDIDATE_SUPERSEDED: {
    message: "この候補は新しい記憶に置き換え済みです。",
    httpStatus: 409,
    retryHint: "最新の記憶一覧を確認してください。",
  },
  MEMORY_DISABLED: {
    message: "記憶機能はオフです。",
    httpStatus: 400,
    retryHint: "設定で記憶機能をオンにしてから保存してください。",
  },
  SENSITIVE_STORAGE_BLOCKED: {
    message: "大切な連絡先・保存先は、今の設定では保存できません。",
    httpStatus: 400,
    retryHint: "設定を確認するか、別の項目として保存してください。",
  },
  INFERENCE_CANNOT_AUTO_ACTIVATE: {
    message: "推測した内容は、確認するまで記憶しません。",
    httpStatus: 400,
    retryHint: "候補を確認してから記憶してください。",
  },
  EXTERNAL_CONTENT_BLOCKED: {
    message: "外部文書からの内容は記憶しません。",
    httpStatus: 400,
    retryHint: "覚えたい内容は、ご自身の言葉で保存してください。",
  },
  PAYLOAD_TOO_LARGE: {
    message: "記憶できる文字数または件数を超えています。",
    httpStatus: 400,
    retryHint: "内容を短くするか、使っていない記憶を整理してください。",
  },
  RATE_LIMITED: {
    message: "操作が少し集中しています。",
    httpStatus: 429,
    retryHint: "数秒待ってから、もう一度お試しください。",
  },
};

export function personalMemoryError(
  code: PersonalMemoryErrorCode,
): PersonalMemoryError {
  const spec = PERSONAL_MEMORY_ERRORS[code];
  return new PersonalMemoryError(code, spec.message, spec.httpStatus, spec.retryHint);
}

export function clientErrorPayload(error: PersonalMemoryError, diagnosticId: string) {
  return {
    error: `${error.message} ${error.retryHint}`.trim(),
    code: error.code,
    diagnosticId,
    retryHint: error.retryHint,
  };
}
