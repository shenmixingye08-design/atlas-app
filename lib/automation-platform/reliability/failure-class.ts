/**
 * Classify automation failures for ops dashboards and retry policy.
 */

export type FailureClass =
  | "storage"
  | "ai"
  | "timeout"
  | "permission"
  | "network"
  | "validation"
  | "external"
  | "unknown";

const RULES: Array<{
  cls: FailureClass;
  patterns: RegExp[];
  permanent?: boolean;
}> = [
  {
    cls: "timeout",
    patterns: [/timeout/i, /timed out/i, /ETIMEDOUT/i, /deadline/i],
  },
  {
    cls: "storage",
    patterns: [/storage/i, /supabase.*upload/i, /object.?store/i, /ENOENT/i],
  },
  {
    cls: "network",
    patterns: [
      /ECONNRESET/i,
      /ENOTFOUND/i,
      /EAI_AGAIN/i,
      /network/i,
      /fetch failed/i,
      /socket/i,
      /\b5\d\d\b/,
    ],
  },
  {
    cls: "ai",
    patterns: [/\b429\b/, /rate.?limit/i, /openai/i, /model/i, /tokens?/i],
  },
  {
    cls: "permission",
    patterns: [/permission/i, /unauthorized/i, /forbidden/i, /\b401\b/, /\b403\b/],
    permanent: true,
  },
  {
    cls: "validation",
    patterns: [
      /invalid/i,
      /validation/i,
      /schema/i,
      /ooxml/i,
      /empty_deliverable/i,
      /not_ooxml/i,
    ],
    permanent: true,
  },
  {
    cls: "external",
    patterns: [/gmail/i, /dropbox/i, /wordpress/i, /x_post/i, /calendar/i],
  },
];

export function classifyFailure(input: {
  errorCode?: string | null;
  errorMessage?: string | null;
}): { failureClass: FailureClass; retryable: boolean } {
  const haystack = `${input.errorCode ?? ""} ${input.errorMessage ?? ""}`.trim();
  if (!haystack) {
    return { failureClass: "unknown", retryable: true };
  }

  for (const rule of RULES) {
    if (rule.patterns.some((pattern) => pattern.test(haystack))) {
      return {
        failureClass: rule.cls,
        retryable: rule.permanent !== true,
      };
    }
  }

  if (/hang_timeout|lease_expired|worker_crash/i.test(haystack)) {
    return { failureClass: "timeout", retryable: true };
  }

  return { failureClass: "unknown", retryable: true };
}
