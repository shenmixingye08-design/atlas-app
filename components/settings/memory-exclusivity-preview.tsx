"use client";

/** Visual preview for screenshots — seeded exclusivity dashboard. */
export function MemoryExclusivityPreview() {
  const stats = [
    { label: "Memory数", value: "18" },
    { label: "正式", value: "11" },
    { label: "候補", value: "4" },
    { label: "推定指示削減", value: "72%" },
    { label: "Memory Score", value: "84" },
    { label: "一致率", value: "81%" },
    { label: "Diff率", value: "22%" },
    { label: "修正率", value: "18%" },
  ];

  return (
    <div className="space-y-6" data-testid="memory-exclusivity-preview">
      <header className="space-y-2">
        <p className="text-sm font-semibold tracking-wide text-[var(--brand)]">
          MINERVOT
        </p>
        <h1 className="text-2xl font-semibold">専属Memory</h1>
        <p className="text-sm text-[var(--text-secondary)]">
          使えば使うほど、説明しなくても思い通りの成果物が出ます。
        </p>
      </header>

      <section className="rounded-[var(--radius-md)] border border-[var(--brand)] bg-[var(--brand-muted)] p-4">
        <p className="text-xs font-semibold uppercase text-[var(--brand)]">
          今回適用します
        </p>
        <p className="mt-2 text-sm font-medium">
          営業資料テンプレート / PowerPoint青系 / WordはA4 / PDF同時生成 /
          Dropbox保存 / 短文 / 箇条書き
        </p>
        <p className="mt-2 text-xs text-[var(--text-muted)]">
          衝突時は今回の指示が優先されます
        </p>
      </section>

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        {stats.map((stat) => (
          <div
            key={stat.label}
            className="rounded-[var(--radius-md)] border border-[var(--border)] bg-[var(--surface-elevated)] p-4"
          >
            <p className="text-xs text-[var(--text-muted)]">{stat.label}</p>
            <p className="mt-1 text-2xl font-semibold">{stat.value}</p>
          </div>
        ))}
      </div>

      <section className="space-y-2">
        <h2 className="font-semibold">学習速度</h2>
        <ul className="space-y-1 text-sm text-[var(--text-secondary)]">
          <li>word: 4回で安定</li>
          <li>ppt: 6回で安定</li>
          <li>excel: 5回で安定</li>
          <li>automation: 3回で安定</li>
        </ul>
      </section>

      <section className="space-y-2">
        <h2 className="font-semibold">Confidence</h2>
        <div className="flex flex-wrap gap-2 text-sm">
          <span className="rounded border border-[var(--border)] px-2 py-1">
            正式 ≥90%
          </span>
          <span className="rounded border border-[var(--border)] px-2 py-1">
            候補 70–89%
          </span>
          <span className="rounded border border-[var(--border)] px-2 py-1">
            提案のみ &lt;70%
          </span>
        </div>
      </section>
    </div>
  );
}
