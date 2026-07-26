import type { SecretaryIntelligencePlan } from "@/lib/secretary-intelligence/types"

export type SecretaryIntelligenceLogEntry = {
  userId: string | null
  assignmentHint: string
  plan: SecretaryIntelligencePlan
  recordedAt: string
}

type Scope = typeof globalThis & {
  __atlasSecretaryIntelligenceLogs?: SecretaryIntelligenceLogEntry[]
}

function bucket(): SecretaryIntelligenceLogEntry[] {
  const s = globalThis as Scope
  if (!s.__atlasSecretaryIntelligenceLogs) {
    s.__atlasSecretaryIntelligenceLogs = []
  }
  return s.__atlasSecretaryIntelligenceLogs
}

export function recordSecretaryIntelligence(
  entry: Omit<SecretaryIntelligenceLogEntry, "recordedAt"> & {
    recordedAt?: string
  },
): void {
  bucket().unshift({
    ...entry,
    recordedAt: entry.recordedAt ?? new Date().toISOString(),
  })
  if (bucket().length > 300) bucket().length = 300
}

export function listSecretaryIntelligence(limit = 100): SecretaryIntelligenceLogEntry[] {
  return bucket().slice(0, Math.max(1, Math.min(limit, 300)))
}

export function resetSecretaryIntelligenceForTests(): void {
  ;(globalThis as Scope).__atlasSecretaryIntelligenceLogs = []
}
