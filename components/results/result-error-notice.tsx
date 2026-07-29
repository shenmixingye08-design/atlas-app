"use client";

import Link from "next/link";

import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/empty-state";
import {
  resultMessage,
  resultTitle,
  type ResultResolutionCode,
} from "@/lib/notifications/result-messages";
import { ui } from "@/lib/i18n";

type ResultErrorNoticeProps = {
  code: ResultResolutionCode;
  /** Optional extra detail (e.g. sanitized failure reason). */
  reason?: string | null;
};

const ICONS: Partial<Record<ResultResolutionCode, string>> = {
  pending: "⏳",
  not_saved: "🗂️",
  generation_failed: "⚠️",
  ai_error: "⚠️",
  storage_failed: "💾",
  notification_failed: "🔔",
  timeout: "⏱️",
  not_found: "🔍",
  forbidden: "🔒",
  legacy: "🕰️",
  unauthorized: "🔑",
  unknown: "🔍",
};

/**
 * Never-blank fallback for `/results/<id>`. Every unresolved「結果を見る」click
 * shows a clear Japanese reason + a way forward instead of a dead screen.
 */
export function ResultErrorNotice({ code, reason }: ResultErrorNoticeProps) {
  const showSignIn = code === "unauthorized";

  return (
    <Card variant="elevated" padding="lg">
      <EmptyState
        icon={ICONS[code] ?? "🔍"}
        title={resultTitle(code)}
        description={resultMessage(code)}
        action={
          <div className="flex flex-col items-center gap-3">
            {reason && (
              <p className="max-w-md rounded-[var(--radius-lg)] bg-[var(--surface-muted)] px-4 py-3 text-sm text-[var(--text-secondary)]">
                {reason}
              </p>
            )}
            <div className="flex flex-wrap justify-center gap-2">
              {showSignIn ? (
                <Link href="/sign-in">
                  <Button variant="primary" size="sm">
                    ログイン
                  </Button>
                </Link>
              ) : (
                <>
                  {(code === "generation_failed" ||
                    code === "ai_error" ||
                    code === "storage_failed" ||
                    code === "timeout") && (
                    <Link href="/workspace">
                      <Button variant="primary" size="sm">
                        {ui.notifications.retryWork}
                      </Button>
                    </Link>
                  )}
                  <Link href="/notifications">
                    <Button variant="secondary" size="sm">
                      {ui.notifications.title}
                    </Button>
                  </Link>
                  <Link href="/history">
                    <Button variant="ghost" size="sm">
                      {ui.nav.history}
                    </Button>
                  </Link>
                </>
              )}
            </div>
          </div>
        }
      />
    </Card>
  );
}
