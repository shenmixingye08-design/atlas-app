import type { Metadata } from "next";
import { Suspense } from "react";

import { AtlasAppShell } from "@/components/layout/atlas-app-shell";
import { ChatInterface } from "@/components/chat/chat-interface";
import { LoadingState } from "@/components/ui/loading-state";
import { ui } from "@/lib/i18n";

export const metadata: Metadata = {
  title: ui.metadata.chat,
  description:
    "専属AI秘書への追加依頼。繰り返しの仕事は習慣・自動化で時間を節約できます。",
};

export default function ChatPage() {
  return (
    <AtlasAppShell active="chat" width="default">
      <Suspense fallback={<LoadingState />}>
        <ChatInterface />
      </Suspense>
    </AtlasAppShell>
  );
}
