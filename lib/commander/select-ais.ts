import type { WorkTask } from "@/lib/agents/tasks/types";
import { inferDepartmentFromTask } from "@/lib/departments/task-routing";
import {
  DEFAULT_WORKFLOW_EMPLOYEE_IDS,
  findEmployeeById,
  getEmployeesByDepartment,
} from "@/lib/employees/registry";
import type { EmployeeId } from "@/lib/employees/types";
import type { DeliverableType } from "@/lib/orchestration/deliverable-types";
import { assignWorkersToTasks } from "@/lib/orchestration/worker-assignment";

import type { CommanderPhaseId, CommanderSelectedAi } from "./types";

function toSelected(
  employeeId: EmployeeId,
  phase: CommanderPhaseId,
  reason: string,
): CommanderSelectedAi | null {
  const employee = findEmployeeById(employeeId);
  if (!employee) return null;
  return {
    employeeId: employee.id,
    name: employee.name,
    role: employee.role,
    department: employee.department,
    phase,
    reason,
  };
}

/** Select existing AIs only — no new employees created. */
export function selectRequiredAis(input: {
  assignment: string;
  deliverableType: DeliverableType;
  keywords: string[];
}): CommanderSelectedAi[] {
  const selected: CommanderSelectedAi[] = [];
  const seen = new Set<EmployeeId>();

  const push = (item: CommanderSelectedAi | null) => {
    if (!item || seen.has(item.employeeId)) return;
    seen.add(item.employeeId);
    selected.push(item);
  };

  // Core workflow cast (existing pipeline)
  push(
    toSelected(
      DEFAULT_WORKFLOW_EMPLOYEE_IDS[0],
      "ceo",
      "司令塔パイプラインの CEO フェーズ",
    ),
  );
  push(
    toSelected(
      DEFAULT_WORKFLOW_EMPLOYEE_IDS[1],
      "planner",
      "仕事分解・実行順の計画",
    ),
  );

  const needsResearch =
    input.deliverableType === "research" ||
    input.keywords.includes("research") ||
    /調査|リサーチ|競合|市場/i.test(input.assignment);

  if (needsResearch) {
    const researchers = getEmployeesByDepartment("research");
    for (const employee of researchers.slice(0, 2)) {
      push(
        toSelected(
          employee.id,
          "research",
          "調査・情報収集が必要な依頼のため",
        ),
      );
    }
  }

  // Soft task preview for department routing (existing assignWorkersToTasks)
  const previewTasks: WorkTask[] = buildPreviewTasks(input.assignment, input.keywords);
  const assignments = assignWorkersToTasks(previewTasks);

  for (const assignment of assignments) {
    push(
      toSelected(
        assignment.employeeId,
        "workers",
        `部門「${assignment.department}」の実行担当`,
      ),
    );
  }

  // Ensure default worker present
  push(
    toSelected(
      DEFAULT_WORKFLOW_EMPLOYEE_IDS[2],
      "workers",
      "デフォルト実行担当（Worker）",
    ),
  );

  push(
    toSelected(
      DEFAULT_WORKFLOW_EMPLOYEE_IDS[3],
      "review",
      "品質確認・承認前レビュー",
    ),
  );

  // Domain specialists from keywords
  if (input.keywords.includes("sns") || input.keywords.includes("blog")) {
    for (const employee of getEmployeesByDepartment("marketing").slice(0, 1)) {
      push(
        toSelected(employee.id, "workers", "コンテンツ・SNS 関連の専門担当"),
      );
    }
  }
  if (/営業|提案|見積/i.test(input.assignment)) {
    for (const employee of getEmployeesByDepartment("sales").slice(0, 1)) {
      push(toSelected(employee.id, "workers", "営業・提案関連の専門担当"));
    }
  }
  if (/デザイン|UI|スライド|資料/i.test(input.assignment)) {
    for (const employee of getEmployeesByDepartment("design").slice(0, 1)) {
      push(toSelected(employee.id, "workers", "デザイン・資料関連の専門担当"));
    }
  }

  return selected;
}

function buildPreviewTasks(
  assignment: string,
  keywords: string[],
): WorkTask[] {
  const tasks: WorkTask[] = [
    {
      id: 1,
      title: assignment.slice(0, 80) || "メイン作業",
      description: assignment,
    },
  ];

  if (keywords.includes("research")) {
    tasks.push({
      id: 2,
      title: "[Research] 調査",
      description: "関連情報の調査と整理",
      department: "research",
    });
  }
  if (keywords.includes("sns") || keywords.includes("blog")) {
    tasks.push({
      id: tasks.length + 1,
      title: "[Marketing] コンテンツ作成",
      description: "コンテンツ・投稿文の作成",
      department: "marketing",
    });
  }
  if (/営業|提案/i.test(assignment)) {
    tasks.push({
      id: tasks.length + 1,
      title: "[Sales] 提案準備",
      description: "営業提案の作成",
      department: "sales",
    });
  }

  // Touch inferDepartmentFromTask for each to keep routing consistent
  for (const task of tasks) {
    if (!task.department) {
      const inferred = inferDepartmentFromTask(task);
      if (inferred) task.department = inferred;
    }
  }

  return tasks;
}
