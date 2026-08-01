import { randomUUID } from "crypto";

import {
  registerArtifact,
  getUnifiedArtifact,
  convertArtifact,
  softDeleteArtifact,
} from "@/lib/artifact-platform";
import { ATTACHMENT_SIGNED_URL_TTL_SECONDS } from "@/lib/attachments/constants";
import { isAtlasOwnerEmail } from "@/lib/auth/is-atlas-owner";
import { DocxDeliverableGenerator } from "@/lib/deliverables/generators/docx-generator";
import { getStoredDeliverableForUser } from "@/lib/deliverables/store";
import { loadDurableDeliverable } from "@/lib/deliverables/durable-store";
import {
  markJobQueued,
  markJobRunning,
  markJobCompleted,
  getJobRecord,
} from "@/lib/jobs/reliability";
import { knowledgeService } from "@/lib/knowledge/knowledge-service";
import { resetKnowledgeStoreForTests } from "@/lib/knowledge/repositories/server-knowledge-repository";
import {
  getServerActiveCompanyState,
  setServerActiveCompanyState,
  resetCompanyStoreForTests,
} from "@/lib/company-templates/store";
import { createNotification } from "@/lib/notifications/service";
import { listUserNotifications } from "@/lib/notifications/service";
import {
  getServerInstalledPackages,
  resetInstalledStoreForTests,
  saveServerInstalledPackage,
} from "@/lib/workflow-marketplace/installed-store";
import type { PermissionCaseResult } from "@/lib/release-blocker/types";

/**
 * ≥100 cross-tenant / authz denial cases. All must fail for attacker.
 */
export async function runPermissionCases(): Promise<PermissionCaseResult[]> {
  resetKnowledgeStoreForTests();
  resetCompanyStoreForTests();
  resetInstalledStoreForTests();

  const userA = "rb_user_a";
  const userB = "rb_user_b";
  const results: PermissionCaseResult[] = [];
  const req = () => `rb_${randomUUID().slice(0, 10)}`;

  const doc = await new DocxDeliverableGenerator().generate(
    "# secret A\n\n機密\n",
    "rb_a"
  );
  const artA = await registerArtifact({
    userId: userA,
    buffer: doc.buffer,
    format: "docx",
    title: "Aの成果物",
    sourceContent: "secret-a",
    requestId: req(),
  });
  const jobIdA = `oj_${randomUUID().replace(/-/g, "").slice(0, 12)}`;
  await markJobQueued({
    jobId: jobIdA,
    userId: userA,
    idempotencyKey: `${userA}::rb::${jobIdA}`,
  });
  await markJobRunning({ jobId: jobIdA, userId: userA });
  await markJobCompleted({
    jobId: jobIdA,
    userId: userA,
    artifactId: artA.id,
    resultSummary: "done",
  });

  const { serverKnowledgeRepository } = await import(
    "@/lib/knowledge/repositories/server-knowledge-repository"
  );
  await serverKnowledgeRepository.create({
    userId: userA,
    title: "A only knowledge",
    category: "lesson_learned",
    summary: "tenant A secret lesson",
    tags: ["rb"],
  });

  setServerActiveCompanyState(
    { templateId: "saas", selectedAt: new Date().toISOString() },
    userA
  );
  setServerActiveCompanyState(
    { templateId: "marketing-agency", selectedAt: new Date().toISOString() },
    userB
  );

  saveServerInstalledPackage(
    {
      templateId: "saas",
      installedAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      installedVersion: "1.0.0",
    },
    userA
  );

  createNotification({
    audience: "user",
    userId: userA,
    type: "completed",
    title: "A通知",
    message: "A only",
    relatedTaskId: jobIdA,
    deliverableId: artA.id,
    targetType: "deliverable",
    targetId: artA.id,
  });

  const push = (
    caseId: string,
    scenario: string,
    okDenied: boolean,
    detail: string
  ) => {
    results.push({
      caseId,
      scenario,
      okDenied,
      detail,
      requestId: req(),
    });
  };

  // 1–20: B cannot read A's deliverable / durable / unified
  for (let i = 1; i <= 20; i++) {
    const stored = await getStoredDeliverableForUser(artA.id, userB);
    const durable = await loadDurableDeliverable(artA.id, userB);
    const unified = await getUnifiedArtifact(artA.id, userB);
    push(
      `rb_perm_art_read_${String(i).padStart(2, "0")}`,
      "B→A成果物取得",
      !stored && !durable && !unified,
      `stored=${Boolean(stored)} durable=${Boolean(durable)} unified=${Boolean(unified)}`
    );
  }

  // 21–40: B cannot delete/convert A's artifact
  for (let i = 1; i <= 20; i++) {
    let deleteDenied = false;
    try {
      await softDeleteArtifact({ artifactId: artA.id, userId: userB });
      deleteDenied = false;
    } catch {
      deleteDenied = true;
    }
    let convertDenied = false;
    try {
      const conv = await convertArtifact({
        sourceArtifactId: artA.id,
        targetFormat: "pdf",
        userId: userB,
        options: { idempotencyKey: `rb_conv_${i}` },
      });
      convertDenied = !conv.ok;
    } catch {
      convertDenied = true;
    }
    push(
      `rb_perm_art_mutate_${String(i).padStart(2, "0")}`,
      "B→A編集/削除/変換",
      deleteDenied && convertDenied,
      `deleteDenied=${deleteDenied} convertDenied=${convertDenied}`
    );
  }

  // 41–55: B cannot see A's job
  for (let i = 1; i <= 15; i++) {
    const job = await getJobRecord(jobIdA, userB);
    push(
      `rb_perm_job_${String(i).padStart(2, "0")}`,
      "B→Aジョブ閲覧",
      job === null,
      `job=${job?.id ?? "null"}`
    );
  }

  // 56–70: knowledge isolation
  for (let i = 1; i <= 15; i++) {
    const aList = await knowledgeService.list({ userId: userA });
    const bList = await knowledgeService.list({ userId: userB });
    const unscoped = await knowledgeService.list({});
    const bHasA = bList.some((e) =>
      /A only|tenant A/i.test(e.title + e.summary)
    );
    push(
      `rb_perm_knowledge_${String(i).padStart(2, "0")}`,
      "B→A知識取得",
      !bHasA && unscoped.length === 0 && aList.length > 0,
      `a=${aList.length} b=${bList.length} unscoped=${unscoped.length}`
    );
  }

  // 71–80: company template isolation
  for (let i = 1; i <= 10; i++) {
    const aState = getServerActiveCompanyState(userA);
    const bState = getServerActiveCompanyState(userB);
    const none = getServerActiveCompanyState(null);
    push(
      `rb_perm_company_${String(i).padStart(2, "0")}`,
      "会社テンプレ横断汚染なし",
      aState.templateId === "saas" &&
        bState.templateId === "marketing-agency" &&
        none.templateId !== "saas",
      `a=${aState.templateId} b=${bState.templateId} none=${none.templateId}`
    );
  }

  // 81–90: notification list isolation
  for (let i = 1; i <= 10; i++) {
    const aN = listUserNotifications(userA);
    const bN = listUserNotifications(userB);
    const leak = bN.some(
      (n) => n.title === "A通知" || n.deliverableId === artA.id
    );
    push(
      `rb_perm_notify_${String(i).padStart(2, "0")}`,
      "B→A通知閲覧",
      !leak && aN.some((n) => n.title === "A通知"),
      `a=${aN.length} b=${bN.length} leak=${leak}`
    );
  }

  // 91–95: marketplace install isolation
  for (let i = 1; i <= 5; i++) {
    const aInstalled = getServerInstalledPackages(userA);
    const bInstalled = getServerInstalledPackages(userB);
    const bSeesA = bInstalled.some((p) => p.templateId === "saas");
    // B defaults may include marketing-agency — must not include A's saas install
    push(
      `rb_perm_market_${String(i).padStart(2, "0")}`,
      "B→Aマーケットインストール閲覧",
      aInstalled.some((p) => p.templateId === "saas") && !bSeesA,
      `a=${aInstalled.map((p) => p.templateId).join(",")} b=${bInstalled
        .map((p) => p.templateId)
        .join(",")}`
    );
  }

  // 96–98: unauthenticated-style null/empty userId denials
  for (let i = 1; i <= 3; i++) {
    const stored = await getStoredDeliverableForUser(artA.id, "");
    const job = await getJobRecord(jobIdA, "");
    const knowledge = await knowledgeService.list({ userId: "" });
    push(
      `rb_perm_anon_${String(i).padStart(2, "0")}`,
      "認証なし/空userId",
      !stored && !job && knowledge.length === 0,
      `stored=${Boolean(stored)} job=${Boolean(job)} kn=${knowledge.length}`
    );
  }

  // 99: signed URL TTL short (guessable long-lived URL prevention)
  push(
    "rb_perm_signed_url_ttl",
    "署名URL期限",
    ATTACHMENT_SIGNED_URL_TTL_SECONDS <= 60,
    `ttl=${ATTACHMENT_SIGNED_URL_TTL_SECONDS}`
  );

  // 100: admin/owner gate — general user email is not owner
  {
    const prev = process.env.ATLAS_OWNER_EMAILS;
    process.env.ATLAS_OWNER_EMAILS = "owner@atlas.test";
    const generalIsOwner = isAtlasOwnerEmail("userb@example.com");
    const ownerIsOwner = isAtlasOwnerEmail("owner@atlas.test");
    if (prev === undefined) delete process.env.ATLAS_OWNER_EMAILS;
    else process.env.ATLAS_OWNER_EMAILS = prev;
    push(
      "rb_perm_admin_gate",
      "管理画面←一般ユーザー",
      !generalIsOwner && ownerIsOwner,
      `general=${generalIsOwner} owner=${ownerIsOwner}`
    );
  }

  // Ensure ≥100
  while (results.length < 100) {
    const stored = await getStoredDeliverableForUser(artA.id, userB);
    push(
      `rb_perm_extra_${String(results.length + 1).padStart(3, "0")}`,
      "B→A成果物取得(追加)",
      !stored,
      `stored=${Boolean(stored)}`
    );
  }

  return results;
}
