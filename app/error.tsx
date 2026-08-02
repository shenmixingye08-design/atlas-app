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
    console.error("[ATLAS error]", error);
  }, [error]);

  const fallbackId = useId();
  const errorId = error.digest ?? `ERR-${fallbackId.replace(/:/g, "").toUpperCase()}`;

  return <InternalErrorPageContent errorId={errorId} onReload={reset} />;
}
