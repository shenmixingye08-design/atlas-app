import { requireAtlasOwner } from "@/lib/auth/require-atlas-owner";
import { LiveAdaptersPanel } from "@/components/owner/live-adapters-panel";
import { OwnerNav } from "@/components/owner/owner-nav";

export const dynamic = "force-dynamic";

export default async function OwnerLiveAdaptersPage() {
  await requireAtlasOwner();

  return (
    <div className="mx-auto w-full max-w-6xl space-y-8 px-4 py-8">
      <OwnerNav active="liveAdapters" />
      <header className="space-y-2">
        <h1 className="text-display text-foreground">Live Adapters</h1>
        <p className="text-body text-[var(--text-secondary)]">
          Production Registry・設定・成功率・Latency。sandbox成功は表示しません。
        </p>
      </header>
      <LiveAdaptersPanel />
    </div>
  );
}
