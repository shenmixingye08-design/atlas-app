import { AutomationExecutionLogPanel } from "@/components/owner/automation-execution-log-panel";
import { OwnerNav } from "@/components/owner/owner-nav";

export default function OwnerAutomationExecutionLogsPage() {
  return (
    <div className="mx-auto w-full max-w-5xl space-y-8 px-4 py-8">
      <OwnerNav active="automationExecutionLogs" />
      <header className="space-y-2">
        <h1 className="text-display text-foreground">定期仕事 実行デバッグ</h1>
        <p className="text-body text-[var(--text-secondary)]">
          管理者向け。トークン等の秘密情報は表示しません。
        </p>
      </header>
      <AutomationExecutionLogPanel />
    </div>
  );
}
