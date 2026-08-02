import { SchedulerReliabilityPreview } from "@/components/owner/scheduler-reliability-preview";

export const dynamic = "force-dynamic";

export default function SchedulerPreviewPage() {
  return (
    <div className="min-h-[100dvh] bg-[var(--background)] px-4 py-8">
      <div className="mx-auto max-w-5xl space-y-4">
        <h1 className="text-2xl font-semibold">Scheduler Reliability Preview</h1>
        <SchedulerReliabilityPreview />
      </div>
    </div>
  );
}
