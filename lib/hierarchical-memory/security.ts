const SECRET_PATTERNS: RegExp[] = [
  /api[_-]?key/i,
  /password/i,
  /secret/i,
  /token/i,
  /bearer\s+[a-z0-9._-]+/i,
  /sk-(?:live|test)?[_-]?[a-z0-9]+/i,
  /pk_(?:live|test)_[a-z0-9]+/i,
  /-----BEGIN (?:RSA )?PRIVATE KEY-----/i,
  /\b(?:\d[ -]*?){13,19}\b/, // crude card-like
];

const INJECTION_PATTERNS: RegExp[] = [
  /以前の指示を無視/i,
  /ignore\s+(all\s+)?previous\s+instructions/i,
  /この内容を記憶しろ/i,
  /system\s*prompt/i,
  /あなたは今後/i,
];

export function containsForbiddenSecret(text: string): boolean {
  return SECRET_PATTERNS.some((pattern) => pattern.test(text));
}

export function containsPromptInjection(text: string): boolean {
  return INJECTION_PATTERNS.some((pattern) => pattern.test(text));
}

export function sanitizeMemoryValue(value: string): string {
  return value.trim().slice(0, 2_000);
}

export function assertSafeMemoryContent(value: string): void {
  if (!value.trim()) throw new Error("記憶内容が空です");
  if (containsForbiddenSecret(value)) {
    throw new Error("機密情報の可能性があるため保存できません");
  }
  if (containsPromptInjection(value)) {
    throw new Error("外部文書の命令は記憶できません");
  }
}
