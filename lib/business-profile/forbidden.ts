import { FORBIDDEN_FIELD_PATTERNS } from "./constants";

export type ForbiddenSecretDetection = {
  forbidden: boolean;
  reasonJa: string;
};

const TOKEN_VALUE_PATTERNS: ReadonlyArray<{ pattern: RegExp; reasonJa: string }> = [
  {
    pattern: /\bsk-[A-Za-z0-9_-]{16,}\b/,
    reasonJa: "APIキーと思われる値は保存できません。",
  },
  {
    pattern: /\b(?:ghp|gho|github_pat)_[A-Za-z0-9_]{20,}\b/,
    reasonJa: "アクセストークンと思われる値は保存できません。",
  },
  {
    pattern: /\bxox[baprs]-[A-Za-z0-9-]{20,}\b/,
    reasonJa: "OAuthトークンと思われる値は保存できません。",
  },
  {
    pattern: /\bAKIA[0-9A-Z]{16}\b/,
    reasonJa: "アクセスキーと思われる値は保存できません。",
  },
  {
    pattern: /\bya29\.[A-Za-z0-9_-]{20,}\b/,
    reasonJa: "OAuthトークンと思われる値は保存できません。",
  },
  {
    pattern: /\bBearer\s+[A-Za-z0-9._~+/-]+=*\b/i,
    reasonJa: "Bearerトークンは保存できません。",
  },
];

function normalize(value: string | null | undefined): string {
  return String(value ?? "").trim();
}

function digitsOnly(value: string): string {
  return value.replace(/\D/g, "");
}

function passesLuhn(value: string): boolean {
  let sum = 0;
  let doubleNext = false;

  for (let i = value.length - 1; i >= 0; i -= 1) {
    let digit = Number(value[i]);
    if (!Number.isInteger(digit)) return false;
    if (doubleNext) {
      digit *= 2;
      if (digit > 9) digit -= 9;
    }
    sum += digit;
    doubleNext = !doubleNext;
  }

  return sum > 0 && sum % 10 === 0;
}

function looksLikeCreditCard(value: string): boolean {
  const digits = digitsOnly(value);
  return digits.length >= 13 && digits.length <= 19 && passesLuhn(digits);
}

function looksLikeMyNumber(value: string): boolean {
  const digits = digitsOnly(value);
  return digits.length === 12;
}

function looksLikeRecoveryCode(value: string): boolean {
  return /(?:[A-Z0-9]{4}[-\s]){2,}[A-Z0-9]{4}/i.test(value);
}

function labelSuggestsCvv(labelOrKey: string): boolean {
  return /(?:cvv|cvc|security[_\s-]?code|セキュリティコード)/i.test(labelOrKey);
}

export function detectForbiddenSecretInput(
  label: string | null | undefined,
  key: string | null | undefined,
  value: string | null | undefined,
): ForbiddenSecretDetection {
  const normalizedLabel = normalize(label);
  const normalizedKey = normalize(key);
  const normalizedValue = normalize(value);
  const searchable = `${normalizedLabel} ${normalizedKey}`;

  for (const entry of FORBIDDEN_FIELD_PATTERNS) {
    if (entry.pattern.test(searchable)) {
      return { forbidden: true, reasonJa: entry.reasonJa };
    }
  }

  if (!normalizedValue) {
    return { forbidden: false, reasonJa: "" };
  }

  for (const entry of TOKEN_VALUE_PATTERNS) {
    if (entry.pattern.test(normalizedValue)) {
      return { forbidden: true, reasonJa: entry.reasonJa };
    }
  }

  if (looksLikeCreditCard(normalizedValue)) {
    return {
      forbidden: true,
      reasonJa: "クレジットカード番号と思われる値は保存できません。",
    };
  }

  if (looksLikeMyNumber(normalizedValue)) {
    return {
      forbidden: true,
      reasonJa: "マイナンバーと思われる値は保存できません。",
    };
  }

  if (
    labelSuggestsCvv(searchable) &&
    /^\d{3,4}$/.test(digitsOnly(normalizedValue))
  ) {
    return {
      forbidden: true,
      reasonJa: "カードのセキュリティコードは保存できません。",
    };
  }

  if (looksLikeRecoveryCode(normalizedValue)) {
    return {
      forbidden: true,
      reasonJa: "復旧コードやバックアップコードと思われる値は保存できません。",
    };
  }

  return { forbidden: false, reasonJa: "" };
}
