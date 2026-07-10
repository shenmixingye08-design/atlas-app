"use client";

import { useEffect, useMemo, useState } from "react";

import type { OrchestrationResult } from "@/lib/orchestration/types";
import {
  actionStatusLabel,
  generateActionEngineQueue,
} from "@/lib/actions";
import {
  buildConnectionCenterSnapshot,
  refreshActionPermissions,
} from "@/lib/connections";
import { fetchIntegrationCatalog } from "@/lib/integrations/client";
import { isCeoApprovedForPr } from "@/lib/pr";
import { ui } from "@/lib/i18n";
import { Card } from "@/components/ui/card";

import { ExecutionLogPanel } from "./execution-log-panel";

type ActionEnginePanelProps = {
  result: OrchestrationResult;
};

export function ActionEnginePanel({ result }: ActionEnginePanelProps) {
  const baseQueue = useMemo(() => generateActionEngineQueue(result), [result]);
  const [snapshot, setSnapshot] = useState(() => buildConnectionCenterSnapshot());

  useEffect(() => {
    void fetchIntegrationCatalog()
      .then((catalog) => {
        setSnapshot(buildConnectionCenterSnapshot(catalog.providers));
      })
      .catch(() => {
        setSnapshot(buildConnectionCenterSnapshot());
      });
  }, []);

  const queue = useMemo(() => {
    if (!baseQueue) return null;

    const workflowApproved = isCeoApprovedForPr(result);

    return {
      ...baseQueue,
      actions: baseQueue.actions.map((action) =>
        refreshActionPermissions(action, snapshot, workflowApproved),
      ),
    };
  }, [baseQueue, result, snapshot]);

  if (!queue || queue.actions.length === 0) {
    return null;
  }

  return (
    <>
      <section
        className="space-y-4 animate-comm-in"
        aria-labelledby="action-engine-heading"
      >
        <div className="flex items-center gap-3">
          <span
            className="flex h-10 w-10 items-center justify-center rounded-full bg-[var(--background-subtle)] text-lg"
            aria-hidden="true"
          >
            ⚙️
          </span>
          <div>
            <h2 id="action-engine-heading" className="text-title text-foreground">
              {ui.actionEngine.sectionTitle}
            </h2>
            <p className="text-caption">{ui.actionEngine.planningOnly}</p>
          </div>
        </div>

        <Card padding="lg">
        <div className="space-y-10">
          <p className="text-sm leading-relaxed text-[var(--foreground-muted)]">
            {queue.summary}
          </p>

          <div className="space-y-6">
            <p className="text-overline">{ui.actionEngine.queueTitle}</p>

            <ul className="space-y-8">
              {queue.actions.map((action) => (
                <li
                  key={action.id}
                  className="space-y-4 border-b border-[var(--border)] pb-8 last:border-0 last:pb-0"
                >
                  <div className="grid gap-4 sm:grid-cols-2">
                    <div>
                      <p className="text-overline">{ui.actionEngine.requestedByLabel}</p>
                      <p className="mt-1 text-sm text-foreground">
                        {action.requestedBy}
                      </p>
                    </div>
                    <div>
                      <p className="text-overline">{ui.actionEngine.actionLabel}</p>
                      <p className="mt-1 text-sm font-medium text-foreground">
                        {action.action}
                      </p>
                    </div>
                  </div>

                  <div className="grid gap-4 sm:grid-cols-2">
                    <div>
                      <p className="text-overline">{ui.actionEngine.providerLabel}</p>
                      <p className="mt-1 text-sm font-medium text-foreground">
                        {action.providerName}
                      </p>
                    </div>
                    <div>
                      <p className="text-overline">{ui.actionEngine.serviceLabel}</p>
                      <p className="mt-1 text-sm text-foreground">
                        {action.targetService}
                      </p>
                    </div>
                  </div>

                  <div className="grid gap-4 sm:grid-cols-2">
                    <div>
                      <p className="text-overline">{ui.actionEngine.permissionsLabel}</p>
                      <p className="mt-1 text-sm text-[var(--foreground-muted)]">
                        {action.requiredPermissions.join(" · ")}
                      </p>
                    </div>
                    <div>
                      <p className="text-overline">{ui.actionEngine.permissionLabel}</p>
                      <p className="mt-1 text-sm font-medium text-foreground">
                        {action.permissionStatus === "ready"
                          ? ui.actionEngine.permissionReady
                          : ui.actionEngine.permissionRequired}
                      </p>
                    </div>
                  </div>

                  <div className="grid gap-4 sm:grid-cols-2">
                    <div>
                      <p className="text-overline">{ui.actionEngine.statusLabel}</p>
                      <p className="mt-1 text-sm text-foreground">
                        {actionStatusLabel(action.status)}
                      </p>
                    </div>
                    <div>
                      <p className="text-overline">{ui.actionEngine.readyLabel}</p>
                      <p className="mt-1 text-sm text-foreground">
                        {action.readyForExecution
                          ? ui.actionEngine.readyYes
                          : ui.actionEngine.readyNo}
                      </p>
                    </div>
                  </div>
                </li>
              ))}
            </ul>
          </div>
        </div>
        </Card>
      </section>

      <ExecutionLogPanel actions={queue.actions} />
    </>
  );
}
