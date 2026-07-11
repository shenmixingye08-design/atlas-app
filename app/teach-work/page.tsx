import { AtlasAppShell } from "@/components/layout/atlas-app-shell";
import { TeachWorkForm } from "@/components/teach-work/teach-work-form";

export default function TeachWorkPage() {
  return (
    <AtlasAppShell active="work-memory" width="default">
      <TeachWorkForm />
    </AtlasAppShell>
  );
}
