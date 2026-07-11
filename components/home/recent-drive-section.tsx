"use client";

import Link from "next/link";
import { useEffect, useState } from "react";

import {
  fetchRecentGoogleDriveFilesClient,
  formatDriveKindLabel,
  formatDriveModifiedAt,
} from "@/lib/integrations/google/drive/client";
import type { DriveFileItem } from "@/lib/integrations/google/drive/types";
import { ui } from "@/lib/i18n";

type LoadState =
  | { status: "loading" }
  | { status: "ready"; files: DriveFileItem[] }
  | { status: "unavailable"; message: string };

/** Home section: recently viewed Drive files (live API, no dummy data). */
export function RecentDriveSection() {
  const [state, setState] = useState<LoadState>({ status: "loading" });

  useEffect(() => {
    let cancelled = false;

    void (async () => {
      try {
        const result = await fetchRecentGoogleDriveFilesClient({ limit: 6 });
        if (cancelled) return;

        if (result.status === "ready" && "files" in result) {
          setState({
            status: "ready",
            files: [...result.files],
          });
          return;
        }

        setState({
          status: "unavailable",
          message: "message" in result ? result.message : ui.drive.recentUnavailable,
        });
      } catch {
        if (!cancelled) {
          setState({
            status: "unavailable",
            message: ui.drive.recentUnavailable,
          });
        }
      }
    })();

    return () => {
      cancelled = true;
    };
  }, []);

  return (
    <section aria-labelledby="recent-drive-heading" className="space-y-4">
      <div className="flex items-end justify-between gap-3">
        <h2
          id="recent-drive-heading"
          className="text-lg font-semibold tracking-tight text-foreground sm:text-xl"
        >
          {ui.drive.recentTitle}
        </h2>
        <Link
          href="/workspace/drive"
          className="text-sm text-accent transition-opacity hover:opacity-80"
        >
          {ui.drive.openWorkspace}
        </Link>
      </div>

      {state.status === "loading" ? (
        <p className="text-sm text-[var(--foreground-muted)]">{ui.drive.loading}</p>
      ) : state.status === "unavailable" ? (
        <div className="rounded-[24px] border border-dashed border-[var(--border-subtle)] bg-[var(--background-subtle)]/40 px-6 py-6">
          <p className="text-sm text-[var(--foreground-muted)]">{state.message}</p>
          <Link
            href="/settings/google/drive"
            className="mt-3 inline-flex text-sm text-accent hover:underline"
          >
            {ui.drive.openSettings}
          </Link>
        </div>
      ) : state.files.length === 0 ? (
        <div className="rounded-[24px] border border-dashed border-[var(--border-subtle)] bg-[var(--background-subtle)]/40 px-6 py-6 text-center">
          <p className="text-sm text-[var(--foreground-muted)]">
            {ui.drive.recentEmpty}
          </p>
        </div>
      ) : (
        <ul className="space-y-3">
          {state.files.map((file) => (
            <li key={file.id}>
              <Link
                href={file.webViewLink ?? "/workspace/drive"}
                target={file.webViewLink ? "_blank" : undefined}
                rel={file.webViewLink ? "noopener noreferrer" : undefined}
                className="flex flex-col gap-1 rounded-[22px] border border-[var(--border-subtle)] bg-[var(--card)] px-5 py-4 shadow-[var(--shadow-sm)] transition-all hover:-translate-y-0.5 hover:shadow-[var(--shadow-md)]"
              >
                <p className="truncate text-sm font-medium text-foreground">
                  {file.name}
                </p>
                <p className="text-xs text-[var(--foreground-muted)]">
                  {formatDriveKindLabel(file.kind)} ·{" "}
                  {formatDriveModifiedAt(file.modifiedAt)}
                </p>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
