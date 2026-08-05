import manifestJson from "@/public/samples/manifest.json";

import {
  PROOF_DISCLAIMER,
  PROOF_EMAIL_SAMPLE,
  PROOF_FILE_DEFS,
  PROOF_SNS_SAMPLE,
  computeSampleSavedMinutes,
  creationSecFromMs,
  type ProofFileSample,
  type ProofManifest,
  type ProofTextSample,
} from "./proof-samples";

const manifest = manifestJson as ProofManifest;

function entryById(id: string) {
  return manifest.entries.find((entry) => entry.id === id) ?? null;
}

function withTiming<T extends { id: string; typicalManualMinutes: number }>(
  base: T,
): T & {
  creationSec: number;
  creationMs: number;
  savedMinutes: number;
  href?: string;
  fileName?: string;
  bytes: number | null;
} {
  const entry = entryById(base.id);
  const creationMs = entry?.creationMs ?? (entry?.creationSec ?? 1) * 1000;
  const creationSec = creationSecFromMs(creationMs);
  return {
    ...base,
    creationSec,
    creationMs,
    savedMinutes: computeSampleSavedMinutes(base.typicalManualMinutes, creationSec),
    href: entry?.href,
    fileName: entry?.fileName,
    bytes: entry?.bytes ?? null,
  };
}

export function getProofDisclaimer(): string {
  return manifest.disclaimer || PROOF_DISCLAIMER;
}

export function getProofMeasuredAt(): string {
  return manifest.measuredAt;
}

export function getProofTextSamples(): Array<
  ProofTextSample & { creationMs: number; savedMinutes: number }
> {
  return [
    withTiming(PROOF_SNS_SAMPLE) as ProofTextSample & {
      creationMs: number;
      savedMinutes: number;
    },
    withTiming(PROOF_EMAIL_SAMPLE) as ProofTextSample & {
      creationMs: number;
      savedMinutes: number;
    },
  ];
}

export function getProofFileSamples(): Array<
  ProofFileSample & { creationMs: number; savedMinutes: number }
> {
  return PROOF_FILE_DEFS.map((def) => {
    const timed = withTiming(def);
    return {
      ...timed,
      href: timed.href ?? `/samples/${def.id}`,
      fileName: timed.fileName ?? def.id,
    } as ProofFileSample & { creationMs: number; savedMinutes: number };
  });
}
