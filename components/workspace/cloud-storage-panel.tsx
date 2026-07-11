"use client";

import { useSearchParams } from "next/navigation";
import { useEffect, useState } from "react";

import { Tabs } from "@/components/ui/tabs";
import { DropboxFilesPanel } from "@/components/workspace/dropbox-files-panel";
import { GoogleDrivePanel } from "@/components/workspace/google-drive-panel";
import { ui } from "@/lib/i18n";

export type CloudStorageProvider = "drive" | "dropbox";

const PROVIDER_TABS: { id: CloudStorageProvider; label: string }[] = [
  { id: "drive", label: ui.cloudStorage.providers.drive },
  { id: "dropbox", label: ui.cloudStorage.providers.dropbox },
];

/** Shared Drive + Dropbox workspace UI. */
export function CloudStoragePanel({
  initialProvider = "drive",
}: {
  initialProvider?: CloudStorageProvider;
}) {
  const searchParams = useSearchParams();
  const [provider, setProvider] = useState<CloudStorageProvider>(initialProvider);

  useEffect(() => {
    const fromQuery = searchParams.get("provider");
    if (fromQuery === "dropbox" || fromQuery === "drive") {
      setProvider(fromQuery);
    }
  }, [searchParams]);

  return (
    <div className="space-y-8 animate-fade-in">
      <header className="space-y-3">
        <h1 className="text-display text-foreground">{ui.cloudStorage.title}</h1>
        <p className="max-w-2xl text-body text-[var(--foreground-muted)]">
          {ui.cloudStorage.subtitle}
        </p>
      </header>

      <Tabs
        tabs={PROVIDER_TABS}
        activeId={provider}
        onChange={(id) => {
          if (id === "drive" || id === "dropbox") setProvider(id);
        }}
      />

      {provider === "drive" ? (
        <GoogleDrivePanel embedded />
      ) : (
        <DropboxFilesPanel embedded />
      )}
    </div>
  );
}
