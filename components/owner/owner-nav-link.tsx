"use client";

import { useEffect, useState } from "react";
import Link from "next/link";

import { ui } from "@/lib/i18n";

/** Owner-only nav link — hidden unless /api/auth/owner-status returns true. */
export function OwnerNavLink({ className }: { className?: string }) {
  const [isOwner, setIsOwner] = useState(false);

  useEffect(() => {
    void fetch("/api/auth/owner-status", { cache: "no-store" })
      .then((response) => (response.ok ? response.json() : null))
      .then((body: { isOwner?: boolean } | null) => {
        setIsOwner(Boolean(body?.isOwner));
      })
      .catch(() => setIsOwner(false));
  }, []);

  if (!isOwner) return null;

  return (
    <Link
      href="/owner"
      className={
        className ??
        "block px-4 py-2 text-sm text-amber-700 hover:bg-amber-50 hover:text-amber-900"
      }
    >
      {ui.owner.navLink}
    </Link>
  );
}
