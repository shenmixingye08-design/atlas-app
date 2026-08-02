import { MemoryExclusivityPreview } from "@/components/settings/memory-exclusivity-preview";

export const dynamic = "force-dynamic";

export default function MemoryPreviewPage() {
  return (
    <div className="min-h-[100dvh] bg-[var(--background)] px-4 py-8">
      <div className="mx-auto max-w-3xl">
        <MemoryExclusivityPreview />
      </div>
    </div>
  );
}
