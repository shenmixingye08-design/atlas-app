import type {
  ConnectorProviderDefinition,
  ConnectorServiceDefinition,
} from "./types";

const oauthStub = (scopes: string[] = []) => ({
  enabled: false as const,
  authorizationUrl: null,
  tokenUrl: null,
  scopes,
});

function svc(
  id: string,
  name: string,
  description: string,
  permissions: string[],
  status: ConnectorServiceDefinition["status"] = "available",
): ConnectorServiceDefinition {
  return { id, name, description, permissions, status };
}

export const connectorProviders: readonly ConnectorProviderDefinition[] = [
  {
    id: "google",
    name: "Google",
    icon: "G",
    description: "Drive、Docs、Gmail など Google ワークスペース連携。",
    permissions: ["drive.file", "documents", "spreadsheets", "calendar", "gmail.send"],
    defaultStatus: "available",
    oauth: oauthStub([
      "https://www.googleapis.com/auth/drive.file",
      "https://www.googleapis.com/auth/gmail.send",
    ]),
    services: [
      svc("google_drive", "Google Drive", "ファイルの保存と共有", ["drive.file"]),
      svc("google_docs", "Google Docs", "ドキュメント作成", ["documents"]),
      svc("google_sheets", "Google Sheets", "スプレッドシート連携", ["spreadsheets"]),
      svc("google_calendar", "Calendar", "予定とリマインダー", ["calendar"]),
      svc("gmail", "Gmail", "メール送信", ["gmail.send"]),
      svc("google_business", "Business Profile", "ビジネスプロフィール更新", ["business.manage"], "coming_soon"),
      svc("google_maps", "Maps", "位置情報連携", ["maps.read"], "coming_soon"),
    ],
  },
  {
    id: "microsoft",
    name: "Microsoft",
    icon: "M",
    description: "Outlook、OneDrive、Teams など Microsoft 365 連携。",
    permissions: ["mail.send", "files.readwrite", "teamchat"],
    defaultStatus: "coming_soon",
    oauth: oauthStub(["Mail.Send", "Files.ReadWrite", "Team.ReadBasic.All"]),
    services: [
      svc("outlook", "Outlook", "メールと予定", ["mail.send"], "coming_soon"),
      svc("onedrive", "OneDrive", "ファイル保存", ["files.readwrite"], "coming_soon"),
      svc("excel", "Excel", "スプレッドシート連携", ["files.readwrite"], "coming_soon"),
      svc("teams", "Teams", "チーム通知", ["teamchat"], "coming_soon"),
    ],
  },
  {
    id: "meta",
    name: "Meta",
    icon: "◎",
    description: "Instagram、Facebook、Threads のソーシャル連携。",
    permissions: ["pages_manage_posts", "instagram_content_publish"],
    defaultStatus: "coming_soon",
    oauth: oauthStub(["pages_manage_posts", "instagram_basic"]),
    services: [
      svc("instagram", "Instagram", "投稿とストーリー", ["instagram_content_publish"], "coming_soon"),
      svc("facebook", "Facebook", "ページ投稿", ["pages_manage_posts"], "coming_soon"),
      svc("threads", "Threads", "テキスト投稿", ["threads.publish"], "coming_soon"),
    ],
  },
  {
    id: "openai",
    name: "OpenAI",
    icon: "AI",
    description: "GPT モデルと画像生成 API。",
    permissions: ["chat.completions", "images.generate"],
    defaultStatus: "available",
    oauth: oauthStub(),
    services: [
      svc("chat", "Chat Completions", "テキスト生成", ["chat.completions"]),
      svc("images", "Images", "画像生成", ["images.generate"]),
    ],
  },
  {
    id: "openrouter",
    name: "OpenRouter",
    icon: "OR",
    description: "複数 LLM モデルへのルーティング。",
    permissions: ["models.read", "chat.completions"],
    defaultStatus: "available",
    oauth: oauthStub(),
    services: [
      svc("models", "Models", "モデル一覧", ["models.read"]),
      svc("chat", "Chat", "マルチモデル推論", ["chat.completions"]),
    ],
  },
  {
    id: "anthropic",
    name: "Anthropic",
    icon: "A",
    description: "Claude モデル API。",
    permissions: ["messages.create"],
    defaultStatus: "available",
    oauth: oauthStub(),
    services: [svc("messages", "Messages", "Claude 推論", ["messages.create"])],
  },
  {
    id: "wordpress",
    name: "WordPress",
    icon: "W",
    description: "ブログとページの公開。",
    permissions: ["posts.publish", "media.upload"],
    defaultStatus: "available",
    oauth: oauthStub(),
    services: [
      svc("posts", "Posts", "記事公開", ["posts.publish", "media.upload"]),
      svc("pages", "Pages", "固定ページ", ["pages.publish"], "coming_soon"),
    ],
  },
  {
    id: "notion",
    name: "Notion",
    icon: "N",
    description: "ページとデータベース連携。",
    permissions: ["pages.write", "databases.read"],
    defaultStatus: "available",
    oauth: oauthStub(["insert_content", "read_content"]),
    services: [
      svc("pages", "Pages", "ページ作成", ["pages.write"]),
      svc("databases", "Databases", "DBレコード追加", ["databases.read"]),
    ],
  },
  {
    id: "slack",
    name: "Slack",
    icon: "S",
    description: "チャンネル通知とファイル共有。",
    permissions: ["chat:write", "files:write"],
    defaultStatus: "available",
    oauth: oauthStub(["chat:write", "channels:read"]),
    services: [
      svc("messages", "Messages", "チャンネル投稿", ["chat:write"]),
      svc("files", "Files", "ファイル共有", ["files:write"]),
    ],
  },
  {
    id: "discord",
    name: "Discord",
    icon: "D",
    description: "Discord チャンネル連携。",
    permissions: ["messages.write"],
    defaultStatus: "available",
    oauth: oauthStub(["bot"]),
    services: [svc("messages", "Messages", "チャンネル投稿", ["messages.write"])],
  },
  {
    id: "stripe",
    name: "Stripe",
    icon: "$",
    description: "決済と顧客管理。",
    permissions: ["charges.create", "customers.read"],
    defaultStatus: "available",
    oauth: oauthStub(),
    services: [
      svc("payments", "Payments", "決済処理", ["charges.create"]),
      svc("customers", "Customers", "顧客管理", ["customers.read"]),
    ],
  },
  {
    id: "shopify",
    name: "Shopify",
    icon: "🛍",
    description: "EC 商品と注文連携。",
    permissions: ["products.write", "orders.read"],
    defaultStatus: "coming_soon",
    oauth: oauthStub(["write_products", "read_orders"]),
    services: [
      svc("products", "Products", "商品管理", ["products.write"], "coming_soon"),
      svc("orders", "Orders", "注文参照", ["orders.read"], "coming_soon"),
    ],
  },
  {
    id: "base",
    name: "BASE",
    icon: "B",
    description: "BASE ショップ連携。",
    permissions: ["items.write", "orders.read"],
    defaultStatus: "coming_soon",
    oauth: oauthStub(),
    services: [
      svc("products", "Products", "商品更新", ["items.write"], "coming_soon"),
      svc("orders", "Orders", "注文管理", ["orders.read"], "coming_soon"),
    ],
  },
  {
    id: "coconala",
    name: "ココナラ",
    icon: "🎨",
    description: "ココナラ出品と受注連携。",
    permissions: ["services.manage", "orders.read"],
    defaultStatus: "coming_soon",
    oauth: oauthStub(),
    services: [
      svc("services", "Services", "出品管理", ["services.manage"], "coming_soon"),
      svc("orders", "Orders", "受注管理", ["orders.read"], "coming_soon"),
    ],
  },
] as const;

export function getConnectorProvider(
  id: ConnectorProviderDefinition["id"],
) {
  return connectorProviders.find((provider) => provider.id === id);
}

export function listConnectorProviders() {
  return connectorProviders;
}

export function getConnectorService(
  providerId: ConnectorProviderDefinition["id"],
  serviceId: string,
) {
  return getConnectorProvider(providerId)?.services.find(
    (service) => service.id === serviceId,
  );
}
