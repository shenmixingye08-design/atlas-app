import type { Metadata } from "next";

import { ArtifactPlatformPanel } from "@/components/artifacts/artifact-platform-panel";
import { AtlasAppShell } from "@/components/layout/atlas-app-shell";

export const metadata: Metadata = {
  title: "成果物 | MINERVOT",
  description: "すべての成果物を履歴・変換・プレビュー・ダウンロードまで一元管理",
};

export default function ArtifactsPage() {
  return (
    <AtlasAppShell active="history" width="wide">
      <ArtifactPlatformPanel />
    </AtlasAppShell>
  );
}
