"use client";

import { useEffect, useId } from "react";

import { InternalErrorPageContent } from "@/components/system-pages/internal-error-page";

export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error("[ATLAS global error]", error);
  }, [error]);

  const fallbackId = useId();
  const errorId = error.digest ?? `ERR-${fallbackId.replace(/:/g, "").toUpperCase()}`;

  return (
    <html lang="ja">
      <body>
        <InternalErrorPageContent errorId={errorId} onReload={reset} />
      </body>
    </html>
  );
}
