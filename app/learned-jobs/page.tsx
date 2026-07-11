import { AtlasAppShell } from "@/components/layout/atlas-app-shell";
import { LearnedJobsDashboard } from "@/components/learned-jobs/learned-jobs-dashboard";

export default function LearnedJobsPage() {
  return (
    <AtlasAppShell active="work-memory" width="wide">
      <LearnedJobsDashboard />
    </AtlasAppShell>
  );
}
