/**
 * Deliverable version groups — each version has its own deliverable id.
 * Group id links revisions; binaries are never silently overwritten.
 */

import "server-only";

import { createServiceRoleClientIfConfigured } from "@/lib/supabase/service-role";

export type DeliverableVersionRecord = {
  groupId: string;
  deliverableId: string;
  parentDeliverableId: string | null;
  version: number;
  isLatest: boolean;
  revisionReason: string | null;
  createdBy: string;
  createdAt: string;
  jobId: string | null;
  displayName: string;
  internalFileName: string;
  diffSummary: string | null;
};

type VersionBucket = Map<string, DeliverableVersionRecord[]>;

type DeliverableVersionDbRow = {
  group_id: string;
  deliverable_id: string;
  parent_deliverable_id: string | null;
  version: number;
  is_latest: boolean;
  revision_reason: string | null;
  created_by: string;
  created_at: string;
  job_id: string | null;
  display_name: string;
  internal_file_name: string;
  diff_summary: string | null;
};

function getVersionBucket(): VersionBucket {
  const scope = globalThis as typeof globalThis & {
    __atlasDeliverableVersions?: VersionBucket;
  };
  if (!scope.__atlasDeliverableVersions) {
    scope.__atlasDeliverableVersions = new Map();
  }
  return scope.__atlasDeliverableVersions;
}

export function resetDeliverableVersionsForTests(): void {
  getVersionBucket().clear();
}

function sortVersions(records: DeliverableVersionRecord[]): DeliverableVersionRecord[] {
  return [...records].sort((a, b) => b.version - a.version);
}

function mapDbRow(row: DeliverableVersionDbRow): DeliverableVersionRecord {
  return {
    groupId: row.group_id,
    deliverableId: row.deliverable_id,
    parentDeliverableId: row.parent_deliverable_id,
    version: row.version,
    isLatest: row.is_latest,
    revisionReason: row.revision_reason,
    createdBy: row.created_by,
    createdAt: row.created_at,
    jobId: row.job_id,
    displayName: row.display_name,
    internalFileName: row.internal_file_name,
    diffSummary: row.diff_summary,
  };
}

async function hydrateGroupFromRemote(
  groupId: string,
): Promise<DeliverableVersionRecord[]> {
  try {
    const client = createServiceRoleClientIfConfigured();
    if (!client) return [];
    const { data, error } = await client
      .from("atlas_deliverable_versions")
      .select("*")
      .eq("group_id", groupId)
      .order("version", { ascending: false });
    if (error || !data) return [];
    const records = (data as DeliverableVersionDbRow[]).map(mapDbRow);
    if (records.length > 0) {
      getVersionBucket().set(groupId, records);
    }
    return sortVersions(records);
  } catch {
    return [];
  }
}

async function persistGroup(groupId: string, records: DeliverableVersionRecord[]) {
  getVersionBucket().set(groupId, records);
  try {
    const client = createServiceRoleClientIfConfigured();
    if (!client) return;
    for (const record of records) {
      await client.from("atlas_deliverable_versions").upsert({
        group_id: record.groupId,
        deliverable_id: record.deliverableId,
        parent_deliverable_id: record.parentDeliverableId,
        version: record.version,
        is_latest: record.isLatest,
        revision_reason: record.revisionReason,
        created_by: record.createdBy,
        created_at: record.createdAt,
        job_id: record.jobId,
        display_name: record.displayName,
        internal_file_name: record.internalFileName,
        diff_summary: record.diffSummary,
      } as never);
    }
  } catch (error) {
    console.warn("[deliverable-versions] persist failed", error);
  }
}

export function createVersionGroup(input: {
  deliverableId: string;
  createdBy: string;
  displayName: string;
  internalFileName: string;
  jobId?: string | null;
  groupId?: string;
}): DeliverableVersionRecord {
  const groupId = input.groupId ?? `dvg_${crypto.randomUUID().replace(/-/g, "").slice(0, 16)}`;
  const record: DeliverableVersionRecord = {
    groupId,
    deliverableId: input.deliverableId,
    parentDeliverableId: null,
    version: 1,
    isLatest: true,
    revisionReason: null,
    createdBy: input.createdBy,
    createdAt: new Date().toISOString(),
    jobId: input.jobId ?? null,
    displayName: input.displayName,
    internalFileName: input.internalFileName,
    diffSummary: null,
  };
  void persistGroup(groupId, [record]);
  return record;
}

/**
 * Create a new version with a NEW deliverable id.
 * Old binaries keep their ids so existing download URLs stay stable.
 */
export function addDeliverableVersion(input: {
  groupId: string;
  newDeliverableId: string;
  parentDeliverableId: string;
  createdBy: string;
  displayName: string;
  internalFileName: string;
  revisionReason?: string | null;
  jobId?: string | null;
  diffSummary?: string | null;
}): DeliverableVersionRecord {
  const existing = sortVersions(getVersionBucket().get(input.groupId) ?? []);
  const nextVersion =
    existing.reduce((max, item) => Math.max(max, item.version), 0) + 1;
  const updated = existing.map((item) => ({ ...item, isLatest: false }));
  const record: DeliverableVersionRecord = {
    groupId: input.groupId,
    deliverableId: input.newDeliverableId,
    parentDeliverableId: input.parentDeliverableId,
    version: nextVersion,
    isLatest: true,
    revisionReason: input.revisionReason ?? null,
    createdBy: input.createdBy,
    createdAt: new Date().toISOString(),
    jobId: input.jobId ?? null,
    displayName: input.displayName,
    internalFileName: input.internalFileName,
    diffSummary: input.diffSummary ?? null,
  };
  updated.unshift(record);
  void persistGroup(input.groupId, updated);
  return record;
}

export function listDeliverableVersions(
  groupId: string,
): DeliverableVersionRecord[] {
  return sortVersions(getVersionBucket().get(groupId) ?? []);
}

export async function listDeliverableVersionsAsync(
  groupId: string,
): Promise<DeliverableVersionRecord[]> {
  const cached = listDeliverableVersions(groupId);
  if (cached.length > 0) return cached;
  return hydrateGroupFromRemote(groupId);
}

export function getLatestDeliverableVersion(
  groupId: string,
): DeliverableVersionRecord | null {
  return listDeliverableVersions(groupId)[0] ?? null;
}

export function findVersionGroupByDeliverableId(
  deliverableId: string,
): { groupId: string; record: DeliverableVersionRecord } | null {
  for (const [groupId, records] of getVersionBucket().entries()) {
    const record = records.find((item) => item.deliverableId === deliverableId);
    if (record) return { groupId, record };
  }
  return null;
}

export async function findVersionGroupByDeliverableIdAsync(
  deliverableId: string,
): Promise<{ groupId: string; record: DeliverableVersionRecord } | null> {
  const cached = findVersionGroupByDeliverableId(deliverableId);
  if (cached) return cached;

  try {
    const client = createServiceRoleClientIfConfigured();
    if (!client) return null;
    const { data, error } = await client
      .from("atlas_deliverable_versions")
      .select("*")
      .eq("deliverable_id", deliverableId)
      .maybeSingle();
    if (error || !data) return null;
    const record = mapDbRow(data as DeliverableVersionDbRow);
    await hydrateGroupFromRemote(record.groupId);
    return { groupId: record.groupId, record };
  } catch {
    return null;
  }
}

export function buildVersionedDisplayName(
  baseDisplayName: string,
  version: number,
): string {
  const cleaned = baseDisplayName.replace(/_v\d+$/i, "").trim() || "文書";
  return `${cleaned}_v${version}`;
}

export function buildVersionedInternalFileName(
  baseFileName: string,
  version: number,
  extension = ".docx",
): string {
  const stem = baseFileName.replace(/\.docx$/i, "").replace(/_v\d+$/i, "");
  return `${stem}_v${version}${extension}`;
}
