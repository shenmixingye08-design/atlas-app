"use client";

import { useCallback, useEffect, useState } from "react";

import { Button } from "@/components/ui/button";

type Snapshot = {
  releaseReady: boolean;
  note: string;
  criticalOpen: number;
  findings: Array<{
    id: string;
    severity: string;
    title: string;
    evidence: string;
    status: string;
  }>;
  publishScope: Array<{ id: string; scope: string; reason: string }>;
  capabilityFlags: Array<{
    id: string;
    state: string;
    reason: string | null;
    updatedBy: string | null;
  }>;
  killSwitches: Array<{
    id: string;
    engaged: boolean;
    reason: string | null;
    updatedBy: string | null;
  }>;
  statusComponents: Array<{
    id: string;
    label: string;
    status: string;
    detail: string | null;
  }>;
  runbooks: Array<{ id: string; title: string; detect: string }>;
  search: {
    result: { matched: boolean; message: string } | null;
  };
};

export function ReleaseGatePanel() {
  const [data, setData] = useState<Snapshot | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [q, setQ] = useState({
    requestId: "",
    jobId: "",
    artifactId: "",
    userId: "",
    externalActionId: "",
  });
  const [reason, setReason] = useState("");

  const load = useCallback(async () => {
    setError(null);
    const params = new URLSearchParams();
    for (const [k, v] of Object.entries(q)) {
      if (v.trim()) params.set(k, v.trim());
    }
    const res = await fetch(`/api/owner/release-gate?${params}`, {
      cache: "no-store",
    });
    if (!res.ok) {
      setError(`load failed: ${res.status}`);
      return;
    }
    setData((await res.json()) as Snapshot);
  }, [q]);

  useEffect(() => {
    queueMicrotask(() => {
      void load();
    });
  }, [load]);

  async function patch(body: Record<string, unknown>) {
    if (!reason.trim()) {
      setError("変更理由を入力してください");
      return;
    }
    setBusy(true);
    setError(null);
    try {
      const res = await fetch("/api/owner/release-gate", {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ ...body, reason }),
      });
      const json = (await res.json()) as { error?: string; message?: string };
      if (!res.ok) {
        setError(json.message ?? json.error ?? `patch ${res.status}`);
        return;
      }
      await load();
    } finally {
      setBusy(false);
    }
  }

  if (!data) {
    return (
      <p className="text-sm text-[var(--text-secondary)]">
        {error ?? "読み込み中…"}
      </p>
    );
  }

  const criticals = data.findings.filter((f) => f.severity === "Critical");

  return (
    <div className="space-y-8">
      <header className="space-y-2">
        <h1 className="text-2xl font-semibold tracking-tight">
          Release Gate / 障害対応
        </h1>
        <p className="text-sm text-[var(--text-secondary)]">{data.note}</p>
        <p className="text-sm">
          Release Ready:{" "}
          <span className="font-semibold text-[var(--error)]">
            {data.releaseReady ? "YES" : "NO"}
          </span>
          {" · "}
          Critical open: {data.criticalOpen}
        </p>
      </header>

      {error ? (
        <p className="rounded-lg bg-[var(--error-bg)] px-3 py-2 text-sm text-[var(--error)]">
          {error}
        </p>
      ) : null}

      <section className="space-y-2">
        <h2 className="text-lg font-medium">検索（本文なし）</h2>
        <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
          {(
            [
              ["requestId", "request_id"],
              ["jobId", "jobId"],
              ["artifactId", "artifactId"],
              ["userId", "userId"],
              ["externalActionId", "externalActionId"],
            ] as const
          ).map(([key, label]) => (
            <input
              key={key}
              className="rounded-md border border-[var(--border)] bg-transparent px-3 py-2 text-sm"
              placeholder={label}
              value={q[key]}
              onChange={(e) => setQ((prev) => ({ ...prev, [key]: e.target.value }))}
            />
          ))}
        </div>
        <Button type="button" variant="secondary" onClick={() => void load()}>
          検索
        </Button>
        {data.search.result ? (
          <p className="text-xs text-[var(--text-secondary)]">
            {data.search.result.message}
          </p>
        ) : null}
      </section>

      <section className="space-y-2">
        <h2 className="text-lg font-medium">Critical</h2>
        <ul className="space-y-1 text-sm">
          {criticals.map((f) => (
            <li key={f.id}>
              [{f.status}] {f.title} — {f.evidence}
            </li>
          ))}
        </ul>
      </section>

      <section className="space-y-2">
        <h2 className="text-lg font-medium">公開ステータス（ユーザー向け）</h2>
        <ul className="text-sm">
          {data.statusComponents.map((c) => (
            <li key={c.id}>
              {c.label}: {c.status}
              {c.detail ? ` — ${c.detail}` : ""}
            </li>
          ))}
        </ul>
      </section>

      <section className="space-y-3">
        <h2 className="text-lg font-medium">変更理由（必須）</h2>
        <input
          className="w-full rounded-md border border-[var(--border)] bg-transparent px-3 py-2 text-sm"
          placeholder="なぜ変更するか"
          value={reason}
          onChange={(e) => setReason(e.target.value)}
        />
      </section>

      <section className="space-y-3">
        <h2 className="text-lg font-medium">Kill Switch</h2>
        <div className="space-y-2">
          {data.killSwitches.map((k) => (
            <div
              key={k.id}
              className="flex flex-wrap items-center justify-between gap-2 border-b border-[var(--border-subtle)] py-2 text-sm"
            >
              <div>
                <p className="font-medium">{k.id}</p>
                <p className="text-xs text-[var(--text-secondary)]">
                  {k.engaged ? "ENGAGED" : "off"}
                  {k.reason ? ` — ${k.reason}` : ""}
                </p>
              </div>
              <Button
                type="button"
                size="sm"
                variant={k.engaged ? "secondary" : "danger"}
                disabled={busy}
                onClick={() =>
                  void patch({
                    action: "set_kill_switch",
                    id: k.id,
                    engaged: !k.engaged,
                    confirm: !k.engaged ? "ENGAGE" : undefined,
                  })
                }
              >
                {k.engaged ? "解除" : "緊急停止"}
              </Button>
            </div>
          ))}
        </div>
      </section>

      <section className="space-y-3">
        <h2 className="text-lg font-medium">Capability Flags</h2>
        <div className="space-y-2">
          {data.capabilityFlags.map((f) => (
            <div
              key={f.id}
              className="flex flex-wrap items-center justify-between gap-2 border-b border-[var(--border-subtle)] py-2 text-sm"
            >
              <div>
                <p className="font-medium">{f.id}</p>
                <p className="text-xs text-[var(--text-secondary)]">
                  {f.state}
                  {f.reason ? ` — ${f.reason}` : ""}
                </p>
              </div>
              <div className="flex gap-1">
                {(["off", "invite", "beta", "on"] as const).map((state) => (
                  <Button
                    key={state}
                    type="button"
                    size="sm"
                    variant={f.state === state ? "primary" : "ghost"}
                    disabled={busy}
                    onClick={() =>
                      void patch({
                        action: "set_capability",
                        id: f.id,
                        state,
                      })
                    }
                  >
                    {state}
                  </Button>
                ))}
              </div>
            </div>
          ))}
        </div>
      </section>

      <section className="space-y-2">
        <h2 className="text-lg font-medium">公開範囲</h2>
        <ul className="text-sm">
          {data.publishScope.map((p) => (
            <li key={p.id}>
              {p.id}: {p.scope} — {p.reason}
            </li>
          ))}
        </ul>
      </section>

      <section className="space-y-2">
        <h2 className="text-lg font-medium">Runbooks</h2>
        <ul className="text-sm">
          {data.runbooks.map((r) => (
            <li key={r.id}>
              <span className="font-medium">{r.title}</span> — {r.detect}
            </li>
          ))}
        </ul>
      </section>
    </div>
  );
}
