import "server-only";

export type XApiErrorEntry = {
  message?: string;
  detail?: string;
  code?: number | string;
  label?: string;
  resource_type?: string;
  parameter?: string;
};

export type ParsedXApiError = {
  httpStatus: number;
  title: string | null;
  detail: string | null;
  type: string | null;
  bodyStatus: number | null;
  errors: XApiErrorEntry[];
  rawBody: Record<string, unknown>;
};

export type XApiErrorResolution = {
  userMessage: string;
  reconnectRequired: boolean;
  errorCodes: number[];
  /** Safe summary for owner telemetry (no tokens). */
  logSummary: string;
};

export class XApiError extends Error {
  readonly httpStatus: number;
  readonly parsed: ParsedXApiError;
  readonly resolution: XApiErrorResolution;

  constructor(parsed: ParsedXApiError, resolution: XApiErrorResolution) {
    super(resolution.userMessage);
    this.name = "XApiError";
    this.httpStatus = parsed.httpStatus;
    this.parsed = parsed;
    this.resolution = resolution;
  }
}

const WRITE_SCOPE_HINT =
  "X Developer Portalでアプリの権限を「Read and write」に設定し、設定画面からX連携をやり直してください。";

const RECONNECT_HINT = "X連携をやり直してください。";

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}

function asErrorEntries(value: unknown): XApiErrorEntry[] {
  if (!Array.isArray(value)) return [];
  return value.filter((entry) => entry && typeof entry === "object") as XApiErrorEntry[];
}

function readString(record: Record<string, unknown>, key: string): string | null {
  const value = record[key];
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

function readNumber(record: Record<string, unknown>, key: string): number | null {
  const value = record[key];
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "string" && value.trim()) {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : null;
  }
  return null;
}

/** Parse X API v2 error JSON (title/detail/type/status + errors[]). */
export function parseXApiErrorResponse(
  httpStatus: number,
  body: unknown,
): ParsedXApiError {
  const record = asRecord(body);
  const errors = asErrorEntries(record.errors);

  return {
    httpStatus,
    title: readString(record, "title"),
    detail: readString(record, "detail"),
    type: readString(record, "type"),
    bodyStatus: readNumber(record, "status"),
    errors,
    rawBody: record,
  };
}

function collectErrorCodes(parsed: ParsedXApiError): number[] {
  const codes = parsed.errors
    .map((entry) => {
      if (typeof entry.code === "number") return entry.code;
      if (typeof entry.code === "string" && entry.code.trim()) {
        const numeric = Number(entry.code);
        return Number.isFinite(numeric) ? numeric : null;
      }
      return null;
    })
    .filter((code): code is number => code != null);
  return [...new Set(codes)];
}

function firstErrorText(parsed: ParsedXApiError): string | null {
  for (const entry of parsed.errors) {
    const detail = entry.detail?.trim();
    if (detail) return detail;
    const message = entry.message?.trim();
    if (message) return message;
  }
  return parsed.detail ?? parsed.title;
}

function haystack(parsed: ParsedXApiError): string {
  return [
    parsed.title,
    parsed.detail,
    parsed.type,
    ...parsed.errors.flatMap((entry) => [
      entry.message,
      entry.detail,
      entry.label,
      entry.resource_type,
      entry.parameter,
    ]),
  ]
    .filter(Boolean)
    .join(" ")
    .toLowerCase();
}

function buildLogSummary(parsed: ParsedXApiError, codes: number[]): string {
  const parts = [`HTTP ${parsed.httpStatus}`];
  if (parsed.title) parts.push(parsed.title);
  if (parsed.detail && parsed.detail !== parsed.title) parts.push(parsed.detail);
  if (codes.length > 0) parts.push(`codes=${codes.join(",")}`);
  const first = firstErrorText(parsed);
  if (first && !parts.includes(first)) parts.push(first);
  return parts.join(" | ");
}

/** Map parsed X API errors to user-facing Japanese messages. */
export function resolveXApiError(parsed: ParsedXApiError): XApiErrorResolution {
  const codes = collectErrorCodes(parsed);
  const text = haystack(parsed);
  const first = firstErrorText(parsed);

  const reconnectRequired =
    parsed.httpStatus === 401 ||
    codes.includes(32) ||
    codes.includes(89) ||
    codes.includes(220) ||
    /invalid.*token|token.*expired|expired token|unauthorized client|could not authenticate/.test(
      text,
    );

  if (reconnectRequired) {
    return {
      userMessage: `トークンが失効しています。${RECONNECT_HINT}`,
      reconnectRequired: true,
      errorCodes: codes,
      logSummary: buildLogSummary(parsed, codes),
    };
  }

  if (
    codes.includes(187) ||
    /duplicate|already posted|status is a duplicate/.test(text)
  ) {
    return {
      userMessage: "同じ内容の投稿は重複のため送信できません。文面を変更してお試しください。",
      reconnectRequired: false,
      errorCodes: codes,
      logSummary: buildLogSummary(parsed, codes),
    };
  }

  if (
    parsed.httpStatus === 429 ||
    codes.includes(88) ||
    codes.includes(185) ||
    /rate limit|too many requests/.test(text)
  ) {
    return {
      userMessage:
        "X APIの利用上限に達しました。しばらく時間をおいてから再度お試しください。",
      reconnectRequired: false,
      errorCodes: codes,
      logSummary: buildLogSummary(parsed, codes),
    };
  }

  if (
    codes.includes(326) ||
    codes.includes(64) ||
    /temporarily locked|account is suspended|suspended/.test(text)
  ) {
    return {
      userMessage:
        "Xアカウントが一時的に制限されています。X側の設定をご確認ください。",
      reconnectRequired: false,
      errorCodes: codes,
      logSummary: buildLogSummary(parsed, codes),
    };
  }

  if (
    codes.includes(453) ||
    /subset of x api|different access level|elevated access|project.*access/.test(
      text,
    )
  ) {
    return {
      userMessage:
        "X Developer Portalのアプリ権限またはAPIプランが投稿に対応していません。Portalで「Read and write」と投稿API利用権限を確認してください。",
      reconnectRequired: false,
      errorCodes: codes,
      logSummary: buildLogSummary(parsed, codes),
    };
  }

  if (
    /insufficient.*scope|missing scope|not authorized to|forbidden.*scope|tweet\.write|write permission|read only|read-only/.test(
      text,
    ) ||
    (parsed.httpStatus === 403 &&
      /forbidden|not allowed|permission|scope|write/.test(text))
  ) {
    return {
      userMessage: `投稿権限（Write）がありません。${WRITE_SCOPE_HINT}`,
      reconnectRequired: true,
      errorCodes: codes,
      logSummary: buildLogSummary(parsed, codes),
    };
  }

  if (parsed.httpStatus === 403) {
    return {
      userMessage: first
        ? `Xへの投稿が拒否されました（403）。${first}`
        : "Xへの投稿権限がありません。X連携の権限設定をご確認のうえ、再接続してください。",
      reconnectRequired: true,
      errorCodes: codes,
      logSummary: buildLogSummary(parsed, codes),
    };
  }

  if (parsed.httpStatus === 401) {
    return {
      userMessage: `認証に失敗しました。${RECONNECT_HINT}`,
      reconnectRequired: true,
      errorCodes: codes,
      logSummary: buildLogSummary(parsed, codes),
    };
  }

  if (first) {
    return {
      userMessage: `X APIエラー（${parsed.httpStatus}）: ${first}`,
      reconnectRequired: false,
      errorCodes: codes,
      logSummary: buildLogSummary(parsed, codes),
    };
  }

  return {
    userMessage: `X APIエラー（${parsed.httpStatus}）。しばらくしてから再度お試しください。`,
    reconnectRequired: false,
    errorCodes: codes,
    logSummary: buildLogSummary(parsed, codes),
  };
}

/** Log a safe snapshot of the X API error (never tokens). */
export function logXApiError(
  operation: string,
  parsed: ParsedXApiError,
  resolution: XApiErrorResolution,
): void {
  console.warn(
    `[X API] ${operation}`,
    JSON.stringify({
      httpStatus: parsed.httpStatus,
      bodyStatus: parsed.bodyStatus,
      title: parsed.title,
      detail: parsed.detail,
      type: parsed.type,
      errorCodes: resolution.errorCodes,
      reconnectRequired: resolution.reconnectRequired,
      errors: parsed.errors.map((entry) => ({
        code: entry.code ?? null,
        message: entry.message ?? null,
        detail: entry.detail ?? null,
        label: entry.label ?? null,
      })),
      userMessage: resolution.userMessage,
    }),
  );
}

export function createXApiError(
  httpStatus: number,
  body: unknown,
): XApiError {
  const parsed = parseXApiErrorResponse(httpStatus, body);
  const resolution = resolveXApiError(parsed);
  logXApiError("request", parsed, resolution);
  return new XApiError(parsed, resolution);
}

/** User-facing message when stored OAuth scopes lack tweet.write. */
export function xWriteScopeMissingMessage(): string {
  return `Write権限がありません。${WRITE_SCOPE_HINT}`;
}
