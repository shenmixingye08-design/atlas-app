import "server-only";

import type { DocumentModel } from "@/lib/documents/schema/document-model.zod";
import type { OutputFormat, TemplateId } from "@/lib/documents/schema/enums";
import type { FileValidationResult } from "@/lib/documents/validate";

export type StoredDocumentModel = {
  id: string;
  userId: string | null;
  jobId: string | null;
  model: DocumentModel;
  createdAt: string;
  updatedAt: string;
};

export type StoredDeliverableArtifact = {
  id: string;
  documentModelId: string;
  userId: string | null;
  jobId: string | null;
  format: OutputFormat;
  templateId: TemplateId;
  fileName: string;
  mimeType: string;
  sizeBytes: number;
  pageCount: number | null;
  sheetCount: number | null;
  validationPassed: boolean;
  validationError: string | null;
  buffer: Buffer;
  createdAt: string;
  expiresAt: string;
};

const MODEL_TTL_MS = 1000 * 60 * 60 * 24 * 7;
const ARTIFACT_TTL_MS = 1000 * 60 * 60;

type ModelBucket = Map<string, StoredDocumentModel>;
type ArtifactBucket = Map<string, StoredDeliverableArtifact>;

function modelStore(): ModelBucket {
  const g = globalThis as typeof globalThis & { __atlasDocModels?: ModelBucket };
  if (!g.__atlasDocModels) g.__atlasDocModels = new Map();
  return g.__atlasDocModels;
}

function artifactStore(): ArtifactBucket {
  const g = globalThis as typeof globalThis & { __atlasDocArtifacts?: ArtifactBucket };
  if (!g.__atlasDocArtifacts) g.__atlasDocArtifacts = new Map();
  return g.__atlasDocArtifacts;
}

function purgeArtifacts(store: ArtifactBucket): void {
  const now = Date.now();
  for (const [id, entry] of store.entries()) {
    if (new Date(entry.expiresAt).getTime() < now) store.delete(id);
  }
}

export function saveDocumentModel(input: {
  model: DocumentModel;
  userId?: string | null;
  jobId?: string | null;
}): StoredDocumentModel {
  const now = new Date().toISOString();
  const stored: StoredDocumentModel = {
    id: crypto.randomUUID(),
    userId: input.userId ?? null,
    jobId: input.jobId ?? null,
    model: input.model,
    createdAt: now,
    updatedAt: now,
  };
  modelStore().set(stored.id, stored);
  return stored;
}

export function getDocumentModel(id: string): StoredDocumentModel | null {
  return modelStore().get(id) ?? null;
}

export function saveDeliverableArtifact(input: {
  documentModelId: string;
  userId?: string | null;
  jobId?: string | null;
  format: OutputFormat;
  templateId: TemplateId;
  fileName: string;
  mimeType: string;
  buffer: Buffer;
  validation: FileValidationResult;
}): StoredDeliverableArtifact {
  const store = artifactStore();
  purgeArtifacts(store);
  const now = Date.now();
  const stored: StoredDeliverableArtifact = {
    id: crypto.randomUUID(),
    documentModelId: input.documentModelId,
    userId: input.userId ?? null,
    jobId: input.jobId ?? null,
    format: input.format,
    templateId: input.templateId,
    fileName: input.fileName,
    mimeType: input.mimeType,
    sizeBytes: input.buffer.byteLength,
    pageCount: input.validation.pageCount ?? null,
    sheetCount: input.validation.sheetCount ?? null,
    validationPassed: input.validation.valid,
    validationError: input.validation.error ?? null,
    buffer: input.buffer,
    createdAt: new Date(now).toISOString(),
    expiresAt: new Date(now + ARTIFACT_TTL_MS).toISOString(),
  };
  store.set(stored.id, stored);
  return stored;
}

export function getDeliverableArtifact(id: string): StoredDeliverableArtifact | null {
  const store = artifactStore();
  purgeArtifacts(store);
  return store.get(id) ?? null;
}

export function listArtifactsForModel(documentModelId: string): StoredDeliverableArtifact[] {
  purgeArtifacts(artifactStore());
  return [...artifactStore().values()].filter(
    (item) => item.documentModelId === documentModelId,
  );
}

export { MODEL_TTL_MS, ARTIFACT_TTL_MS };
