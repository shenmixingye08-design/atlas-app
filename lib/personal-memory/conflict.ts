import { randomUUID } from "crypto";

import type {
  MemoryConflict,
  PersonalMemoryRecord,
  ResolvedMemoryValue,
} from "@/lib/personal-memory/types";

export function detectMemoryConflicts(input: {
  candidates: PersonalMemoryRecord[];
  currentInstructionKeys?: Record<string, unknown>;
  notesText?: string | null;
}): MemoryConflict[] {
  const conflicts: MemoryConflict[] = [];
  const byScope = new Map<string, PersonalMemoryRecord[]>();

  for (const memory of input.candidates) {
    if (memory.status !== "active") continue;
    const list = byScope.get(memory.scope) ?? [];
    list.push(memory);
    byScope.set(memory.scope, list);
  }

  for (const [scope, list] of byScope) {
    const globals = list.filter((m) => m.appliesTo.global);
    const locals = list.filter((m) => !m.appliesTo.global);
    if (globals.length > 0 && locals.length > 0) {
      conflicts.push({
        id: randomUUID(),
        kind: "global_vs_automation",
        memoryIds: [...globals, ...locals].map((m) => m.id),
        message: `全体の記憶と自動化専用の記憶が「${scope}」で競合しています`,
        highRisk:
          scope === "default_recipients" ||
          scope === "default_storage_locations",
        resolutionOptions: [
          "prefer_automation",
          "prefer_newer_memory",
          "ask_user",
          "disable_memory",
        ],
      });
    }

    if (list.length >= 2) {
      const sorted = [...list].sort((a, b) =>
        b.updatedAt.localeCompare(a.updatedAt),
      );
      const newest = sorted[0]!;
      const older = sorted[1]!;
      if (JSON.stringify(newest.value) !== JSON.stringify(older.value)) {
        conflicts.push({
          id: randomUUID(),
          kind:
            scope === "writing_style"
              ? "writing_style"
              : scope.includes("template") || scope.includes("theme")
                ? "template"
                : scope === "default_storage_locations" ||
                    scope === "default_recipients"
                  ? "destination"
                  : scope === "approval_preferences"
                    ? "approval_policy"
                    : "memory_vs_memory",
          memoryIds: [newest.id, older.id],
          message: `同じ項目に複数の記憶があります（新しい方を優先候補）`,
          highRisk:
            scope === "default_recipients" ||
            scope === "default_storage_locations" ||
            scope === "approval_preferences",
          resolutionOptions: [
            "prefer_newer_memory",
            "ask_user",
            "disable_memory",
          ],
        });
      }
    }
  }

  const instruction = input.currentInstructionKeys ?? {};
  for (const [key, value] of Object.entries(instruction)) {
    if (value === undefined || value === null || value === "") continue;
    const matching = input.candidates.filter(
      (m) =>
        m.status === "active" &&
        (m.key === key || m.scope === key) &&
        JSON.stringify(m.value) !== JSON.stringify({ value }),
    );
    if (matching.length > 0) {
      conflicts.push({
        id: randomUUID(),
        kind: "instruction_vs_memory",
        memoryIds: matching.map((m) => m.id),
        message: "今回の指定と記憶が食い違っています。今回の指定を優先します",
        highRisk: matching.some(
          (m) =>
            m.sensitivity === "sensitive" || m.sensitivity === "restricted",
        ),
        resolutionOptions: [
          "prefer_current_instruction",
          "ask_user",
          "disable_memory",
        ],
      });
    }
  }

  return conflicts;
}

export function applyConflictPolicy(input: {
  conflicts: MemoryConflict[];
  resolved: ResolvedMemoryValue[];
}): {
  resolved: ResolvedMemoryValue[];
  blockedMemoryIds: string[];
  needsUser: boolean;
} {
  const blocked = new Set<string>();
  let needsUser = false;

  for (const conflict of input.conflicts) {
    if (conflict.highRisk) {
      needsUser = true;
      for (const id of conflict.memoryIds) blocked.add(id);
      continue;
    }
    if (conflict.kind === "instruction_vs_memory") {
      for (const id of conflict.memoryIds) blocked.add(id);
      continue;
    }
    if (
      conflict.kind === "memory_vs_memory" ||
      conflict.kind === "stale_vs_fresh" ||
      conflict.kind === "writing_style" ||
      conflict.kind === "template"
    ) {
      // keep newest only — drop the rest listed after first
      for (const id of conflict.memoryIds.slice(1)) blocked.add(id);
    }
    if (conflict.kind === "global_vs_automation") {
      // automation-specific wins: block globals in the set that have global=true
      // We don't have that flag here; leave both and let resolver layer prefer automation
    }
  }

  return {
    resolved: input.resolved.filter((row) => !blocked.has(row.memoryId)),
    blockedMemoryIds: [...blocked],
    needsUser,
  };
}
