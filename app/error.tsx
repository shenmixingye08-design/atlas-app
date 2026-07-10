"use client";

import { useEffect } from "react";

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

  const errorId =
    error.digest ??
    `ERR-${Date.now().toString(36).toUpperCase()}`;

  return <InternalErrorPageContent errorId={errorId} onReload={reset} />;
}
