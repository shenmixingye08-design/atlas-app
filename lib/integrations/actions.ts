import type { IntegrationAction, IntegrationActionKind } from "./types";

export const INTEGRATION_ACTION_LABELS: Record<IntegrationActionKind, string> = {
  upload_file: "ファイルをアップロード",
  send_message: "メッセージを送信",
  send_email: "メールを送信",
  create_document: "ドキュメントを作成",
  create_post: "投稿を作成",
  trigger_webhook: "Webhookを実行",
};

export function defineIntegrationAction(
  kind: IntegrationActionKind,
  label: string,
  description: string,
): IntegrationAction {
  return { kind, label, description };
}

/** Contract for provider-specific action executors (implemented when OAuth is ready). */
export interface IntegrationActionExecutor {
  readonly provider: string;
  readonly supportedActions: readonly IntegrationActionKind[];
  execute(
    action: IntegrationActionKind,
    payload: Readonly<Record<string, unknown>>,
  ): Promise<{ externalRef?: string; message: string }>;
}
