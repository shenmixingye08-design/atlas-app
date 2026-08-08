"use client";

import { useEffect, useId } from "react";

import { InternalErrorPageContent } from "@/components/system-pages/internal-error-page";

export default function RootError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    // P0-04: log digest/name only — never full Error (may embed request data).
    console.error("[ATLAS error]", {
      name: error.name,
      digest: error.digest ?? null,
    });
  }, [error]);

  const fallbackId = useId();
  const errorId = error.digest ?? `ERR-${fallbackId.replace(/:/g, "").toUpperCase()}`;

  return <InternalErrorPageContent errorId={errorId} onReload={reset} />;
}
