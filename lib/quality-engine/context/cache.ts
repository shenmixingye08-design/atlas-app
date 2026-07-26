import { createHash } from "node:crypto"

import { SMART_CONTEXT_CACHE_TTL_MS } from "@/lib/quality-engine/context/config"
import type {
  SmartContextCacheKeyInput,
  SmartContextSelectionResult,
} from "@/lib/quality-engine/context/types"

type CacheRecord = {
  key: string
  userId: string
  organizationId: string
  expiresAt: number
  result: SmartContextSelectionResult
  fingerprints: {
    knowledge: string
    reference: string
    template: string
    businessProfile: string
    assignment: string
    promptKind: string
    language: string
  }
}

const store = new Map<string, CacheRecord>()

function scopeId(userId: string, organizationId?: string | null): string {
  const org = (organizationId ?? "").trim() || "personal"
  const user = userId.trim() || "anonymous"
  return `${org}::${user}`
}

export function fingerprintText(value: string): string {
  return createHash("sha256").update(value || "").digest("hex").slice(0, 24)
}

export function buildSmartContextCacheKey(
  input: SmartContextCacheKeyInput,
): string {
  const scope = scopeId(input.userId, input.organizationId)
  const raw = [
    scope,
    input.promptKind,
    input.language,
    input.assignmentFingerprint,
    input.knowledgeFingerprint,
    input.referenceFingerprint,
    input.templateFingerprint,
    input.businessProfileFingerprint,
  ].join("|")
  return `sc:${fingerprintText(raw)}`
}

export function getSmartContextCache(
  key: string,
  userId: string,
  organizationId?: string | null,
): SmartContextSelectionResult | null {
  const hit = store.get(key)
  if (!hit) return null
  if (Date.now() > hit.expiresAt) {
    store.delete(key)
    return null
  }
  // Hard isolation — never cross users/orgs
  if (
    hit.userId !== (userId.trim() || "anonymous") ||
    hit.organizationId !== ((organizationId ?? "").trim() || "personal")
  ) {
    return null
  }
  return {
    ...hit.result,
    stats: {
      ...hit.result.stats,
      cacheHit: true,
      extraLlmCalls: 0,
    },
  }
}

export function setSmartContextCache(input: {
  key: string
  userId: string
  organizationId?: string | null
  result: SmartContextSelectionResult
  fingerprints: CacheRecord["fingerprints"]
}): void {
  const user = input.userId.trim() || "anonymous"
  const org = (input.organizationId ?? "").trim() || "personal"
  store.set(input.key, {
    key: input.key,
    userId: user,
    organizationId: org,
    expiresAt: Date.now() + SMART_CONTEXT_CACHE_TTL_MS,
    result: {
      ...input.result,
      stats: { ...input.result.stats, cacheHit: false },
    },
    fingerprints: input.fingerprints,
  })
}

/** Invalidate cache entries when Knowledge / Profile / Reference / Template updates. */
export function invalidateSmartContextCache(input: {
  userId?: string
  organizationId?: string | null
  knowledgeFingerprint?: string
  referenceFingerprint?: string
  templateFingerprint?: string
  businessProfileFingerprint?: string
}): number {
  let removed = 0
  for (const [key, rec] of store) {
    if (input.userId && rec.userId !== (input.userId.trim() || "anonymous")) {
      continue
    }
    if (
      input.organizationId != null &&
      rec.organizationId !==
        ((input.organizationId ?? "").trim() || "personal")
    ) {
      continue
    }
    const match =
      (input.knowledgeFingerprint &&
        rec.fingerprints.knowledge === input.knowledgeFingerprint) ||
      (input.referenceFingerprint &&
        rec.fingerprints.reference === input.referenceFingerprint) ||
      (input.templateFingerprint &&
        rec.fingerprints.template === input.templateFingerprint) ||
      (input.businessProfileFingerprint &&
        rec.fingerprints.businessProfile ===
          input.businessProfileFingerprint) ||
      (!input.knowledgeFingerprint &&
        !input.referenceFingerprint &&
        !input.templateFingerprint &&
        !input.businessProfileFingerprint &&
        (input.userId || input.organizationId != null))

    if (match) {
      store.delete(key)
      removed += 1
    }
  }
  return removed
}

export function resetSmartContextCacheForTests(): void {
  store.clear()
}

export function listSmartContextCacheKeysForTests(): string[] {
  return Array.from(store.keys())
}
