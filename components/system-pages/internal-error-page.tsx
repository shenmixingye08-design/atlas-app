"use client";

import Link from "next/link";

import {
  SystemPageActions,
  SystemPageLayout,
} from "@/components/system-pages/system-page-layout";
import { SystemPageIcon } from "@/components/system-pages/system-page-icon";
import { Button } from "@/components/ui/button";
import { ui } from "@/lib/i18n";

type InternalErrorPageContentProps = {
  errorId?: string | null;
  onReload?: () => void;
};

export function InternalErrorPageContent({
  errorId,
  onReload,
}: InternalErrorPageContentProps) {
  return (
    <SystemPageLayout
      icon={<SystemPageIcon variant="500" />}
      badge={ui.systemPages.internalErrorBadge}
      title={ui.systemPages.internalErrorTitle}
      description={ui.systemPages.internalErrorDescription}
    >
      {errorId ? (
        <p className="mb-6 rounded-xl border border-[var(--border-subtle)] bg-[var(--terms-toc-hover-bg)] px-4 py-3 text-sm text-[var(--terms-muted)]">
          {ui.systemPages.errorIdLabel}:{" "}
          <span className="font-mono text-[var(--terms-heading)]">{errorId}</span>
        </p>
      ) : null}

      <SystemPageActions>
        <Button
          type="button"
          className="w-full sm:w-auto"
          onClick={() => (onReload ? onReload() : window.location.reload())}
        >
          {ui.systemPages.reload}
        </Button>
        <Link href="/">
          <Button variant="secondary" className="w-full sm:w-auto">
            {ui.systemPages.backHome}
          </Button>
        </Link>
        <Link href="/contact">
          <Button variant="ghost" className="w-full sm:w-auto">
            {ui.systemPages.contact}
          </Button>
        </Link>
      </SystemPageActions>
    </SystemPageLayout>
  );
}
