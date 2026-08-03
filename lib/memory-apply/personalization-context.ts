/**
 * PersonalizationContext — normalized view of "who this person is" for all AI.
 */

import type {
  MemoryApplyChannel,
  MemoryApplyMode,
  MemoryContentOverlay,
  MemoryDeliverableOverlay,
} from "@/lib/memory-apply/types";
import type { MemoryProviderResult } from "@/lib/memory-apply/provider";
import {
  buildContentOverlay,
  buildDeliverableOverlay,
} from "@/lib/memory-apply/overlays";
import {
  assertMemoryVersionComplete,
  buildMemoryVersion,
  type MemoryVersion,
} from "@/lib/memory-apply/memory-version";

export type PersonalizationContext = {
  userId: string;
  organizationId: string | null;
  channel: MemoryApplyChannel;
  mode: MemoryApplyMode;
  /** User / company / role / tone / preferences block */
  profileSummary: string;
  content: MemoryContentOverlay;
  deliverable: MemoryDeliverableOverlay;
  injectionText: string;
  tokenEstimate: number;
  memoryIdsUsed: string[];
  scopesUsed: string[];
  /** Integrity metadata — required before AI execution */
  memoryVersion: MemoryVersion;
  /** Structured facts for PromptBuilder */
  facts: {
    companyName: string | null;
    department: string | null;
    role: string | null;
    region: string | null;
    writingStyle: string | null;
    tone: string | null;
    signature: string | null;
    forbiddenExpressions: string[];
    preferredFormats: string[];
  };
};

function firstContactLine(
  lines: string[],
  predicate: (line: string) => boolean,
): string | null {
  return lines.find(predicate) ?? null;
}

export function buildPersonalizationContext(input: {
  userId: string;
  channel: MemoryApplyChannel;
  provider: MemoryProviderResult;
}): PersonalizationContext {
  const content = buildContentOverlay({
    values: input.provider.personalValues,
    injectionText: input.provider.combinedInjectionText,
  });
  const deliverable = buildDeliverableOverlay({
    userId: input.userId,
    values: input.provider.personalValues,
    injectionText: input.provider.combinedInjectionText,
    tokenEstimate: input.provider.tokenEstimate,
  });

  const preferredFormats = input.provider.personalValues
    .filter((v) => v.scope === "preferred_formats")
    .map((v) => v.summary)
    .filter(Boolean);

  const profileSummary = [
    deliverable.companyName ? `会社: ${deliverable.companyName}` : null,
    deliverable.author ? `担当: ${deliverable.author}` : null,
    content.writingStyle ? `文体: ${content.writingStyle}` : null,
    content.tone ? `口調: ${content.tone}` : null,
    content.signature ? `署名あり` : null,
  ]
    .filter(Boolean)
    .join(" / ");

  const memoryVersion = buildMemoryVersion({
    channel: input.channel,
    provider: input.provider,
  });
  assertMemoryVersionComplete(memoryVersion);

  return {
    userId: input.userId,
    organizationId: input.provider.organizationId,
    channel: input.channel,
    mode: input.provider.mode,
    profileSummary,
    content,
    deliverable,
    injectionText: input.provider.combinedInjectionText,
    tokenEstimate: input.provider.tokenEstimate,
    memoryIdsUsed: input.provider.memoryIdsUsed,
    scopesUsed: input.provider.scopesUsed,
    memoryVersion,
    facts: {
      companyName: deliverable.companyName,
      department: firstContactLine(content.contactLines, (l) =>
        /department|部署|課/i.test(l),
      ),
      role: firstContactLine(content.contactLines, (l) =>
        /title|role|役職|担当/i.test(l),
      ),
      region: firstContactLine(content.contactLines, (l) =>
        /address|地域|region|都道府県/i.test(l),
      ),
      writingStyle: content.writingStyle,
      tone: content.tone,
      signature: content.signature,
      forbiddenExpressions: content.forbiddenExpressions,
      preferredFormats,
    },
  };
}
