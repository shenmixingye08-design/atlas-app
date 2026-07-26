"use client";

import { useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";

import type { OwnerManagedUserRow } from "@/lib/owner/user-admin";
import { formatOwnerDate, formatOwnerUsd } from "@/lib/owner/format";

export function OwnerUsersPanel({ users }: { users: OwnerManagedUserRow[] }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [query, setQuery] = useState("");
  const [plan, setPlan] = useState("all");
  const [status, setStatus] = useState("all");
  const [sort, setSort] = useState<"apiCostUsd" | "usageCount" | "lastLoginAt" | "registeredAt">(
    "apiCostUsd",
  );

  const filtered = useMemo(() => {
    let rows = [...users];
    const q = query.trim().toLowerCase();
    if (q) {
      rows = rows.filter(
        (row) =>
          row.userId.toLowerCase().includes(q) ||
          row.displayName.toLowerCase().includes(q) ||
          row.planName.toLowerCase().includes(q),
      );
    }
    if (plan !== "all") rows = rows.filter((row) => row.planId === plan);
    if (status !== "all") rows = rows.filter((row) => row.status === status);
    rows.sort((a, b) => {
      const av = a[sort];
      const bv = b[sort];
      const an = typeof av === "number" ? av : av ? new Date(av).getTime() : 0;
      const bn = typeof bv === "number" ? bv : bv ? new Date(bv).getTime() : 0;
      return bn - an;
    });
    return rows;
  }, [users, query, plan, status, sort]);

  function toggleSuspend(userId: string, suspended: boolean) {
    startTransition(async () => {
      await fetch("/api/owner/users", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ userId, suspended: !suspended }),
      });
      router.refresh();
    });
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-col gap-3 lg:flex-row lg:items-center">
        <input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="検索（ユーザーID / プラン）"
          className="w-full rounded-xl border border-[var(--border)] bg-[var(--card)] px-3 py-2 text-sm lg:max-w-xs"
        />
        <select
          value={plan}
          onChange={(e) => setPlan(e.target.value)}
          className="rounded-xl border border-[var(--border)] bg-[var(--card)] px-3 py-2 text-sm"
        >
          <option value="all">すべてのプラン</option>
          <option value="free">free</option>
          <option value="light">light</option>
          <option value="standard">standard</option>
          <option value="premium">premium</option>
        </select>
        <select
          value={status}
          onChange={(e) => setStatus(e.target.value)}
          className="rounded-xl border border-[var(--border)] bg-[var(--card)] px-3 py-2 text-sm"
        >
          <option value="all">すべての状態</option>
          <option value="active">active</option>
          <option value="suspended">suspended</option>
          <option value="canceled">canceled</option>
          <option value="past_due">past_due</option>
        </select>
        <select
          value={sort}
          onChange={(e) =>
            setSort(e.target.value as typeof sort)
          }
          className="rounded-xl border border-[var(--border)] bg-[var(--card)] px-3 py-2 text-sm"
        >
          <option value="apiCostUsd">API利用量順</option>
          <option value="usageCount">利用回数順</option>
          <option value="lastLoginAt">最終ログイン順</option>
          <option value="registeredAt">登録日順</option>
        </select>
      </div>

      <div className="overflow-x-auto rounded-2xl border border-[var(--border)] bg-[var(--card)]">
        <table className="min-w-full text-left text-sm">
          <thead className="border-b border-[var(--border)] text-[var(--text-muted)]">
            <tr>
              <th className="px-4 py-3 font-medium">ユーザー</th>
              <th className="px-4 py-3 font-medium">登録日</th>
              <th className="px-4 py-3 font-medium">契約プラン</th>
              <th className="px-4 py-3 font-medium">利用回数</th>
              <th className="px-4 py-3 font-medium">最終ログイン</th>
              <th className="px-4 py-3 font-medium">API利用量</th>
              <th className="px-4 py-3 font-medium">状態</th>
              <th className="px-4 py-3 font-medium">操作</th>
            </tr>
          </thead>
          <tbody>
            {filtered.length === 0 ? (
              <tr>
                <td colSpan={8} className="px-4 py-8 text-[var(--text-muted)]">
                  該当ユーザーなし
                </td>
              </tr>
            ) : (
              filtered.map((row) => (
                <tr key={row.userId} className="border-b border-[var(--border)] last:border-0">
                  <td className="px-4 py-3 font-medium">{row.displayName}</td>
                  <td className="px-4 py-3 text-[var(--text-muted)]">
                    {row.registeredAt ? formatOwnerDate(row.registeredAt) : "—"}
                  </td>
                  <td className="px-4 py-3">{row.planName}</td>
                  <td className="px-4 py-3 tabular-nums">{row.usageCount}</td>
                  <td className="px-4 py-3 text-[var(--text-muted)]">
                    {row.lastLoginAt ? formatOwnerDate(row.lastLoginAt) : "—"}
                  </td>
                  <td className="px-4 py-3 tabular-nums">
                    {formatOwnerUsd(row.apiCostUsd, true)}
                  </td>
                  <td className="px-4 py-3">{row.status}</td>
                  <td className="px-4 py-3">
                    <button
                      type="button"
                      disabled={pending}
                      onClick={() => toggleSuspend(row.userId, row.suspended)}
                      className="rounded-full border border-[var(--border)] px-3 py-1 text-xs font-medium hover:bg-[var(--surface-muted)] disabled:opacity-50"
                    >
                      {row.suspended ? "再開" : "停止"}
                    </button>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
