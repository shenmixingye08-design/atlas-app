import { defineIntegrationAction } from "./actions";
import type {
  IntegrationProviderDefinition,
  IntegrationProviderId,
  IntegrationProviderView,
  Integration,
} from "./types";

const uploadFile = defineIntegrationAction(
  "upload_file",
  "ファイルをアップロード",
  "生成した成果物を外部ストレージへ送信します。",
);

const sendMessage = defineIntegrationAction(
  "send_message",
  "メッセージを送信",
  "要約やリンクをチャンネルに投稿します。",
);

const sendEmail = defineIntegrationAction(
  "send_email",
  "メールを送信",
  "完了した成果物を関係者へ配信します。",
);

const createDocument = defineIntegrationAction(
  "create_document",
  "ドキュメントを作成",
  "生成コンテンツからドキュメントを作成します。",
);

const createPost = defineIntegrationAction(
  "create_post",
  "投稿を作成",
  "ブログやリポジトリに公開します。",
);

const triggerWebhook = defineIntegrationAction(
  "trigger_webhook",
  "Webhookを実行",
  "成果物のメタデータとURLをWebhookへ送信します。",
);

export const integrationProviders: readonly IntegrationProviderDefinition[] = [
  {
    id: "google_drive",
    displayName: "Google Drive",
    description: "成果物をDriveフォルダに保存して共有・保管します。",
    icon: "📁",
    authType: "oauth2",
    requiredScopes: [
      "https://www.googleapis.com/auth/drive.file",
      "openid",
      "email",
      "profile",
    ],
    supportedActions: [uploadFile, createDocument],
  },
  {
    id: "gmail",
    displayName: "Gmail",
    description: "完了した成果物とプロジェクト概要をメールで送信します。",
    icon: "✉️",
    authType: "oauth2",
    requiredScopes: [
      "https://www.googleapis.com/auth/gmail.send",
    ],
    supportedActions: [sendEmail],
  },
  {
    id: "slack",
    displayName: "Slack",
    description: "仕事完了時にチャンネルへ通知し、リンクを共有します。",
    icon: "💬",
    authType: "oauth2",
    requiredScopes: ["channels:read", "chat:write", "files:write"],
    supportedActions: [sendMessage, uploadFile],
  },
  {
    id: "discord",
    displayName: "Discord",
    description: "完了通知とファイルをDiscordチャンネルへ投稿します。",
    icon: "🎮",
    authType: "bot_token",
    requiredScopes: ["bot", "messages.write"],
    supportedActions: [sendMessage],
  },
  {
    id: "notion",
    displayName: "Notion",
    description: "成果物や調査レポートからNotionページを作成します。",
    icon: "📝",
    authType: "oauth2",
    requiredScopes: ["read_content", "insert_content"],
    supportedActions: [createDocument],
  },
  {
    id: "wordpress",
    displayName: "WordPress",
    description: "執筆成果物からブログ記事やページを公開します。",
    icon: "🌐",
    authType: "api_key",
    requiredScopes: ["posts:create"],
    supportedActions: [createPost],
  },
  {
    id: "github",
    displayName: "GitHub",
    description: "ファイルのコミット、Issue、リリースノートを公開します。",
    icon: "🐙",
    authType: "oauth2",
    requiredScopes: ["repo", "write:discussion"],
    supportedActions: [uploadFile, createPost],
  },
  {
    id: "webhooks",
    displayName: "Webhooks",
    description: "成果物完成時に任意のHTTPSエンドポイントへJSONを送信します。",
    icon: "🔗",
    authType: "webhook_url",
    requiredScopes: [],
    supportedActions: [triggerWebhook],
  },
] as const;

export type IntegrationProviderRegistry = Readonly<
  Record<IntegrationProviderId, IntegrationProviderDefinition>
>;

function buildRegistry(
  providers: readonly IntegrationProviderDefinition[],
): IntegrationProviderRegistry {
  return providers.reduce<Record<IntegrationProviderId, IntegrationProviderDefinition>>(
    (registry, provider) => {
      registry[provider.id] = provider;
      return registry;
    },
    {} as Record<IntegrationProviderId, IntegrationProviderDefinition>,
  );
}

export const integrationProviderRegistry: IntegrationProviderRegistry =
  buildRegistry(integrationProviders);

export function getIntegrationProvider(
  id: IntegrationProviderId,
): IntegrationProviderDefinition {
  const provider = integrationProviderRegistry[id];
  if (!provider) {
    throw new Error(`Integration provider not found: ${id}`);
  }
  return provider;
}

export function findIntegrationProvider(
  id: string,
): IntegrationProviderDefinition | undefined {
  return integrationProviderRegistry[id as IntegrationProviderId];
}

export function listIntegrationProviderIds(): IntegrationProviderId[] {
  return integrationProviders.map((provider) => provider.id);
}

export function mergeProviderWithConnection(
  provider: IntegrationProviderDefinition,
  connection: Integration | null,
): IntegrationProviderView {
  return {
    ...provider,
    connection,
    connectionStatus: connection?.status ?? "disconnected",
  };
}
