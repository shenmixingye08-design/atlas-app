"use client";

import type { IntegrationProviderView, UploadBatchStatus } from "@/lib/integrations/types";
import {
  INTEGRATION_ACTION_LABELS,
  formatIntegrationTimestamp,
} from "@/lib/integrations/client";
import { ui } from "@/lib/i18n";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";

type IntegrationCardProps = {
  provider: IntegrationProviderView;
  onConnect: (providerId: IntegrationProviderView["id"]) => void;
  onDisconnect: (connectionId: string) => void;
  isBusy: boolean;
};

function ConnectionBadge({
  status,
  connected,
}: {
  status: IntegrationProviderView["connectionStatus"];
  connected: boolean;
}) {
  if (connected && status === "connected") {
    return (
      <span className="rounded-full bg-[var(--status-success-bg)] px-2.5 py-1 text-xs font-medium text-[var(--status-success)]">
        {ui.integrations.connected}
      </span>
    );
  }

  if (status === "pending") {
    return (
      <span className="rounded-full bg-[var(--status-warning-bg)] px-2.5 py-1 text-xs font-medium text-[var(--status-warning)]">
        接続中
      </span>
    );
  }

  if (status === "error") {
    return (
      <span className="rounded-full bg-[var(--status-error-bg)] px-2.5 py-1 text-xs font-medium text-[var(--status-error)]">
        エラー
      </span>
    );
  }

  return (
    <span className="rounded-full bg-[var(--status-neutral-bg)] px-2.5 py-1 text-xs text-[var(--foreground-muted)]">
      {ui.integrations.notConnected}
    </span>
  );
}

function UploadStatusLabel({ status }: { status?: UploadBatchStatus | null }) {
  if (status === "success") return "成功";
  if (status === "partial") return "一部失敗";
  if (status === "failed") return "失敗";
  return "—";
}

export function IntegrationCard({
  provider,
  onConnect,
  onDisconnect,
  isBusy,
}: IntegrationCardProps) {
  const isConnected = provider.connection?.connected === true;
  const metadata = provider.connection?.metadata;
  const isGoogleDrive = provider.id === "google_drive";

  return (
    <Card padding="md" className="animate-status-in">
      <div className="flex flex-col gap-4">
        <div className="flex items-start justify-between gap-3">
          <div className="flex min-w-0 items-start gap-3">
            <div
              className="flex h-11 w-11 shrink-0 items-center justify-center rounded-[var(--radius-lg)] bg-[var(--background-subtle)] text-xl"
              aria-hidden
            >
              {provider.icon}
            </div>
            <div className="min-w-0">
              <div className="flex flex-wrap items-center gap-2">
                <h2 className="text-base font-semibold text-foreground">
                  {provider.displayName}
                </h2>
                <ConnectionBadge
                  status={provider.connectionStatus}
                  connected={isConnected}
                />
              </div>
              <p className="mt-1.5 text-sm leading-relaxed text-[var(--foreground-muted)]">
                {provider.description}
              </p>
            </div>
          </div>
        </div>

        {isGoogleDrive && isConnected && metadata?.accountEmail && (
          <div className="rounded-[var(--radius-lg)] border border-[var(--status-success)]/20 bg-[var(--status-success-bg)] px-4 py-3">
            <p className="text-sm text-[var(--status-success)]">
              ✓ {ui.integrations.connectedAccount(metadata.accountEmail)}
            </p>
          </div>
        )}

        <div className="grid gap-2 sm:grid-cols-2">
          <div className="atlas-surface-subtle px-3 py-2.5">
            <p className="text-overline">認証方式</p>
            <p className="mt-1 text-sm text-foreground">{provider.authType}</p>
          </div>
          <div className="atlas-surface-subtle px-3 py-2.5">
            <p className="text-overline">最終同期</p>
            <p className="mt-1 text-sm text-foreground">
              {formatIntegrationTimestamp(provider.connection?.lastSyncAt ?? null)}
            </p>
          </div>
        </div>

        {isGoogleDrive && isConnected && (
          <div className="grid gap-2 sm:grid-cols-2">
            <div className="atlas-surface-subtle px-3 py-2.5">
              <p className="text-overline">最終アップロード</p>
              <p className="mt-1 text-sm text-foreground">
                {formatIntegrationTimestamp(metadata?.lastUploadAt ?? null)}
              </p>
            </div>
            <div className="atlas-surface-subtle px-3 py-2.5">
              <p className="text-overline">アップロード状態</p>
              <p className="mt-1 text-sm text-foreground">
                <UploadStatusLabel status={metadata?.lastUploadStatus ?? null} />
              </p>
            </div>
            <div className="atlas-surface-subtle px-3 py-2.5 sm:col-span-2">
              <p className="text-overline">保存場所</p>
              <p className="mt-1 truncate text-sm text-foreground">
                {metadata?.storageLocation ?? "ATLAS/Projects/<プロジェクト名>"}
              </p>
            </div>
          </div>
        )}

        <div>
          <p className="text-overline">対応アクション</p>
          <div className="mt-2 flex flex-wrap gap-2">
            {provider.supportedActions.map((action) => (
              <span
                key={action.kind}
                className="rounded-full bg-[var(--accent-muted)] px-2.5 py-1 text-xs text-accent"
                title={action.description}
              >
                {INTEGRATION_ACTION_LABELS[action.kind]}
              </span>
            ))}
          </div>
        </div>

        {provider.requiredScopes.length > 0 && (
          <div>
            <p className="text-overline">必要スコープ</p>
            <div className="mt-2 flex flex-wrap gap-1.5">
              {provider.requiredScopes.map((scope) => (
                <span
                  key={scope}
                  className="rounded-md bg-[var(--background-subtle)] px-2 py-0.5 font-mono text-[10px] text-[var(--foreground-muted)]"
                >
                  {scope}
                </span>
              ))}
            </div>
          </div>
        )}

        {metadata?.lastUploadError && (
          <p className="text-sm text-[var(--status-error)]" role="alert">
            {metadata.lastUploadError}
          </p>
        )}

        <div className="flex flex-wrap gap-2 pt-1">
          {isConnected && provider.connection ? (
            <>
              {isGoogleDrive && metadata?.lastUploadDriveUrl && (
                <a
                  href={metadata.lastUploadDriveUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex h-9 items-center justify-center rounded-full bg-[var(--background-subtle)] px-4 text-sm font-medium text-foreground transition-all duration-[var(--motion-base)] hover:bg-[#ebebed] focus-ring"
                >
                  Google Drive を開く
                </a>
              )}
              <Button
                variant="ghost"
                size="sm"
                disabled={isBusy}
                onClick={() => onDisconnect(provider.connection!.id)}
              >
                {ui.actions.disconnect}
              </Button>
            </>
          ) : (
            <Button
              variant="primary"
              size="sm"
              disabled={isBusy}
              onClick={() => onConnect(provider.id)}
            >
              {isGoogleDrive ? "Google アカウントで接続" : ui.actions.connect}
            </Button>
          )}
        </div>
      </div>
    </Card>
  );
}
