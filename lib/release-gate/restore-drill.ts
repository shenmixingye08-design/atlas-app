/**
 * Controlled restore drills. Full production PITR is NOT claimed here.
 * We prove what we can in-agent: ops-state snapshot round-trip, flag history,
 * synthetic artifact metadata, and document gaps honestly.
 */

import { mkdirSync, readFileSync, writeFileSync, existsSync, rmSync } from "fs";
import { join } from "path";
import { randomUUID } from "crypto";

import {
  listCapabilityFlags,
  listCapabilityFlagAudit,
  setCapabilityFlag,
  resetCapabilityFlagsForTests,
} from "./capability-flags";
import {
  listKillSwitches,
  listKillSwitchAudit,
  setKillSwitch,
  resetKillSwitchesForTests,
} from "./kill-switch";

export type RestoreDrillCase = {
  id: string;
  title: string;
  attempted: boolean;
  passed: boolean;
  evidence: string;
  notes: string;
};

export type RestoreDrillResult = {
  suiteId: string;
  rpoTargetHours: number;
  rtoTargetHours: number;
  rpoMeasuredHours: number | null;
  rtoMeasuredHours: number | null;
  cases: RestoreDrillCase[];
  fullProductionRestoreProven: boolean;
  pass: boolean;
};

export function runRestoreDrills(options?: {
  outDir?: string;
}): RestoreDrillResult {
  const suiteId = `restore_${new Date().toISOString().replace(/[:.]/g, "-")}_${randomUUID().slice(0, 8)}`;
  const outDir =
    options?.outDir ??
    join("/opt/cursor/artifacts/release-gate-phase7", suiteId, "restore");
  mkdirSync(outDir, { recursive: true });

  const started = Date.now();
  const cases: RestoreDrillCase[] = [];

  // 1) Capability flag history restore (in-process)
  resetCapabilityFlagsForTests();
  setCapabilityFlag({
    id: "vision",
    state: "off",
    actor: "restore-drill",
    reason: "drill baseline",
  });
  setCapabilityFlag({
    id: "vision",
    state: "invite",
    actor: "restore-drill",
    reason: "drill change",
  });
  const flagSnap = {
    flags: listCapabilityFlags(),
    audit: listCapabilityFlagAudit(50),
  };
  const flagPath = join(outDir, "capability-flags-snapshot.json");
  writeFileSync(flagPath, JSON.stringify(flagSnap, null, 2));
  resetCapabilityFlagsForTests();
  const restoredFlags = JSON.parse(readFileSync(flagPath, "utf8")) as {
    flags: Array<{ id: string; state: string }>;
    audit: unknown[];
  };
  for (const f of restoredFlags.flags) {
    setCapabilityFlag({
      id: f.id as "vision",
      state: f.state as "off",
      actor: "restore-drill-replay",
      reason: "replay from snapshot",
    });
  }
  const visionState = listCapabilityFlags().find((f) => f.id === "vision")?.state;
  cases.push({
    id: "flag_history_restore",
    title: "Feature Flag履歴復元",
    attempted: true,
    passed: visionState === "invite" && restoredFlags.audit.length >= 1,
    evidence: flagPath,
    notes: "プロセス内ストアのスナップショット往復。永続DBではない。",
  });

  // 2) Kill switch audit restore
  resetKillSwitchesForTests();
  setKillSwitch({
    id: "vision",
    engaged: true,
    reason: "drill engage",
    actor: "restore-drill",
  });
  const ksPath = join(outDir, "kill-switches-snapshot.json");
  writeFileSync(
    ksPath,
    JSON.stringify(
      { switches: listKillSwitches(), audit: listKillSwitchAudit(50) },
      null,
      2
    )
  );
  resetKillSwitchesForTests();
  const ksSnap = JSON.parse(readFileSync(ksPath, "utf8")) as {
    switches: Array<{ id: string; engaged: boolean; reason: string | null }>;
  };
  for (const s of ksSnap.switches) {
    if (s.engaged) {
      setKillSwitch({
        id: s.id as "vision",
        engaged: true,
        reason: s.reason,
        actor: "restore-drill-replay",
      });
    }
  }
  cases.push({
    id: "kill_switch_restore",
    title: "Kill Switch設定復元",
    attempted: true,
    passed: listKillSwitches().some((s) => s.id === "vision" && s.engaged),
    evidence: ksPath,
    notes: "緊急停止状態の再適用を確認。",
  });
  resetKillSwitchesForTests();

  // 3) Synthetic artifact metadata restore
  const artifactMeta = {
    artifactId: `art_drill_${randomUUID().slice(0, 8)}`,
    userId: "user_drill_1",
    revision: 2,
    title: "restore-drill.docx",
    bytes: 4096,
    requestId: `req_drill_${randomUUID().slice(0, 8)}`,
  };
  const artPath = join(outDir, "artifact-meta.json");
  writeFileSync(artPath, JSON.stringify(artifactMeta, null, 2));
  const artRound = JSON.parse(readFileSync(artPath, "utf8"));
  cases.push({
    id: "artifact_meta_restore",
    title: "1Artifactメタデータ復元",
    attempted: true,
    passed:
      artRound.artifactId === artifactMeta.artifactId &&
      artRound.revision === 2,
    evidence: artPath,
    notes: "メタデータのファイル往復のみ。StorageバイナリPITRは未実施。",
  });

  // 4) Revision restore (synthetic chain)
  const revisions = [
    { revision: 1, changeReason: "create", bufferSha: "aaa" },
    { revision: 2, changeReason: "revise", bufferSha: "bbb" },
  ];
  const revPath = join(outDir, "revisions.json");
  writeFileSync(revPath, JSON.stringify(revisions, null, 2));
  const revRound = JSON.parse(readFileSync(revPath, "utf8")) as typeof revisions;
  cases.push({
    id: "revision_restore",
    title: "1Artifactのrevision復元",
    attempted: true,
    passed: revRound.length === 2 && revRound[1]?.revision === 2,
    evidence: revPath,
    notes: "版履歴JSONの復元。実Storageオブジェクト復元は未証明。",
  });

  // 5) Job history restore
  const job = {
    jobId: `job_drill_${randomUUID().slice(0, 8)}`,
    status: "completed",
    events: ["queued", "running", "completed"],
  };
  const jobPath = join(outDir, "job-history.json");
  writeFileSync(jobPath, JSON.stringify(job, null, 2));
  const jobRound = JSON.parse(readFileSync(jobPath, "utf8"));
  cases.push({
    id: "job_history_restore",
    title: "1ジョブの履歴復元",
    attempted: true,
    passed: jobRound.jobId === job.jobId && jobRound.events.length === 3,
    evidence: jobPath,
    notes: "ジョブ履歴スナップショット往復。",
  });

  // 6) Mis-deleted file restore (local file)
  const filePath = join(outDir, "user-file.bin");
  const backupPath = join(outDir, "user-file.bin.bak");
  writeFileSync(filePath, Buffer.from("MINERVOT_RESTORE_DRILL"));
  writeFileSync(backupPath, readFileSync(filePath));
  rmSync(filePath);
  writeFileSync(filePath, readFileSync(backupPath));
  cases.push({
    id: "misdelete_file_restore",
    title: "誤削除ファイルの復元",
    attempted: true,
    passed:
      existsSync(filePath) &&
      readFileSync(filePath, "utf8") === "MINERVOT_RESTORE_DRILL",
    evidence: backupPath,
    notes: "ローカルバックアップからの復元。クラウドStorageのバージョニング未実測。",
  });

  // 7–8) DB / Storage full restore — NOT proven
  cases.push({
    id: "db_rollback",
    title: "DBロールバック",
    attempted: false,
    passed: false,
    evidence: "n/a",
    notes: "本番/ステージングでのPITR未実施。バックアップ存在≠合格。",
  });
  cases.push({
    id: "storage_restore",
    title: "Storage復元",
    attempted: false,
    passed: false,
    evidence: "n/a",
    notes: "オブジェクトストレージの実復元未実施。",
  });

  const elapsedMs = Date.now() - started;
  const localPass = cases
    .filter((c) => c.attempted)
    .every((c) => c.passed);

  const result: RestoreDrillResult = {
    suiteId,
    rpoTargetHours: 1,
    rtoTargetHours: 4,
    // Measured only for in-agent drills; production RTO/RPO unverified.
    rpoMeasuredHours: localPass ? 0 : null,
    rtoMeasuredHours: localPass ? elapsedMs / 3_600_000 : null,
    cases,
    fullProductionRestoreProven: false,
    pass: false, // full DR not proven ⇒ overall fail
  };

  writeFileSync(join(outDir, "result.json"), JSON.stringify(result, null, 2));
  return result;
}
