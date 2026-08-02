import "server-only";

import { getOwnerEnvStatusSnapshot } from "@/lib/owner/env-status";

export type SecretHygieneRow = {
  key: string;
  configured: boolean;
  required: boolean;
  service: string;
};

export type ProductionSecuritySnapshot = {
  secrets: SecretHygieneRow[];
  requiredMissing: string[];
  piiRedactionEnabled: true;
  tokenEncryptionAvailable: boolean;
  auditLogEnabled: true;
  leastPrivilegeOwnerGate: boolean;
  recommendations: string[];
  generatedAt: string;
};

const PII_PATTERN =
  /\b[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}\b|\b\d{3}-\d{4}-\d{4}\b/gi;
const SECRET_PATTERN =
  /(sk-[a-zA-Z0-9]{10,}|Bearer\s+[A-Za-z0-9._-]+|api[_-]?key\s*[:=]\s*\S+)/gi;

/** Redact PII / tokens from free text before logging or export. */
export function redactPiiAndSecrets(input: string): string {
  return input
    .replace(SECRET_PATTERN, "[redacted-secret]")
    .replace(PII_PATTERN, "[redacted-pii]")
    .slice(0, 2000);
}

export function getProductionSecuritySnapshot(): ProductionSecuritySnapshot {
  const env = getOwnerEnvStatusSnapshot();
  const secrets: SecretHygieneRow[] = env.variables.map((row) => ({
    key: row.key,
    configured: row.configured,
    required: row.requirement === "required",
    service: row.service,
  }));
  const requiredMissing = secrets
    .filter((row) => row.required && !row.configured)
    .map((row) => row.key);

  const tokenEncryptionAvailable = Boolean(
    process.env.ATLAS_CREDENTIALS_ENCRYPTION_KEY?.trim() ||
      process.env.ATLAS_WP_CREDENTIALS_KEY?.trim(),
  );

  const leastPrivilegeOwnerGate = Boolean(
    process.env.ATLAS_OWNER_EMAILS?.trim(),
  );

  const recommendations: string[] = [];
  if (requiredMissing.length > 0) {
    recommendations.push("必須シークレット未設定を解消してください");
  }
  if (!tokenEncryptionAvailable) {
    recommendations.push("資格情報暗号化キーを設定してください");
  }
  if (!leastPrivilegeOwnerGate) {
    recommendations.push("ATLAS_OWNER_EMAILS でOwner権限を最小化してください");
  }
  if (!process.env.ATLAS_ALERT_SLACK_WEBHOOK_URL?.trim()) {
    recommendations.push("運用Alert用 Slack/Webhook を設定してください");
  }

  return {
    secrets,
    requiredMissing,
    piiRedactionEnabled: true,
    tokenEncryptionAvailable,
    auditLogEnabled: true,
    leastPrivilegeOwnerGate,
    recommendations,
    generatedAt: new Date().toISOString(),
  };
}
