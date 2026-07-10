import Link from "next/link";

import {
  SystemPageActions,
  SystemPageLayout,
  SystemPageLinkGrid,
} from "@/components/system-pages/system-page-layout";
import { SystemPageIcon } from "@/components/system-pages/system-page-icon";
import { Button } from "@/components/ui/button";
import { ui } from "@/lib/i18n";

const POPULAR_LINKS = [
  { href: "/", label: ui.systemPages.popularHome },
  { href: "/#pricing", label: ui.systemPages.popularPricing },
  { href: "/sign-in", label: ui.systemPages.popularSignIn },
  { href: "/mihon", label: ui.systemPages.popularDemo },
] as const;

export function NotFoundPageContent() {
  return (
    <SystemPageLayout
      icon={<SystemPageIcon variant="404" />}
      badge={ui.systemPages.notFoundBadge}
      title={ui.systemPages.notFoundTitle}
      description={ui.systemPages.notFoundDescription}
    >
      <SystemPageActions>
        <Link href="/">
          <Button className="w-full sm:w-auto">{ui.systemPages.backHome}</Button>
        </Link>
        <Link href="/chat">
          <Button variant="secondary" className="w-full sm:w-auto">
            {ui.systemPages.goChat}
          </Button>
        </Link>
        <Link href="/contact">
          <Button variant="ghost" className="w-full sm:w-auto">
            {ui.systemPages.contact}
          </Button>
        </Link>
      </SystemPageActions>

      <SystemPageLinkGrid
        title={ui.systemPages.popularPages}
        links={POPULAR_LINKS}
      />
    </SystemPageLayout>
  );
}
