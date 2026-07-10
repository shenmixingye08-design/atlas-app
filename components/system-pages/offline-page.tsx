"use client";

import Link from "next/link";

import {
  SystemPageActions,
  SystemPageLayout,
} from "@/components/system-pages/system-page-layout";
import { SystemPageIcon } from "@/components/system-pages/system-page-icon";
import { Button } from "@/components/ui/button";
import { ui } from "@/lib/i18n";

export function OfflinePageContent() {
  return (
    <SystemPageLayout
      icon={<SystemPageIcon variant="offline" />}
      badge={ui.systemPages.offlineBadge}
      title={ui.systemPages.offlineTitle}
      description={
        <>
          <p>{ui.systemPages.offlineDescription}</p>
          <p className="mt-3 text-sm">{ui.systemPages.offlineCacheNote}</p>
        </>
      }
    >
      <SystemPageActions>
        <Button
          type="button"
          className="w-full sm:w-auto"
          onClick={() => window.location.reload()}
        >
          {ui.systemPages.reconnect}
        </Button>
        <Link href="/">
          <Button variant="secondary" className="w-full sm:w-auto">
            {ui.systemPages.backHome}
          </Button>
        </Link>
      </SystemPageActions>
    </SystemPageLayout>
  );
}
