/**
 * MINERVOT Privacy Policy — structured content for /privacy.
 * Update version + lastUpdated when publishing revisions.
 */

import type { LegalArticle, LegalDocumentMeta } from "./types";

export const PRIVACY_META: LegalDocumentMeta & { contactPath: string } = {
  version: "1.0.0",
  lastUpdated: "2026-07-06",
  lastUpdatedDisplay: "2026年7月6日",
  effectiveDateDisplay: "2026年7月6日",
  contactPath: "/contact",
};

export const PRIVACY_ARTICLES: LegalArticle[] = [
  {
    id: "section-1",
    number: 1,
    sectionPrefix: "①",
    title: "基本方針",
    blocks: [
      {
        type: "paragraph",
        text: "MINERVOT（以下「当社」）は、本サービスをご利用いただくユーザーのプライバシーを尊重し、個人情報および関連データを適切に取り扱います。",
      },
      {
        type: "paragraph",
        text: "本プライバシーポリシー（以下「本ポリシー」）は、当社がどのような情報を取得し、どのように利用・保存・保護するかを説明するものです。",
      },
    ],
  },
  {
    id: "section-2",
    number: 2,
    sectionPrefix: "②",
    title: "取得する情報",
    blocks: [
      {
        type: "paragraph",
        text: "当社は、本サービスの提供および改善のために、以下の情報を取得する場合があります。",
      },
      {
        type: "bullets",
        items: [
          "氏名（表示名）",
          "メールアドレス",
          "プロフィール画像",
          "ログイン情報（Clerk による認証 ID、セッション情報等）",
          "利用プランおよびサブスクリプション状態",
          "AI 利用履歴（チャット、ワークフロー、成果物生成等）",
          "自動化履歴（習慣・自動化タスクの実行記録）",
          "通知設定および通知履歴",
          "MINERVOT Memory（長期学習データ、ユーザー設定に基づく記憶情報）",
          "仕事の記憶（Work Memory — 再利用可能な業務情報のみ。会話全体は保存しません）",
          "Google 連携情報（接続状態、OAuth トークン、連携スコープ）",
          "Stripe Customer ID および請求関連の識別子",
          "技術ログ（IP アドレス、ブラウザ種別、端末情報、アクセス日時、エラーログ等）",
        ],
      },
      {
        type: "paragraph",
        text: "ユーザーが任意で入力・アップロードするコンテンツ（依頼文、ファイル、プロンプト等）も、サービス提供のために処理・保存されます。",
      },
    ],
  },
  {
    id: "section-3",
    number: 3,
    sectionPrefix: "③",
    title: "Google 連携",
    blocks: [
      {
        type: "paragraph",
        text: "ユーザーが Google アカウントを連携した場合、許可されたスコープの範囲内で、以下の情報にアクセスする可能性があります。",
      },
      {
        type: "bullets",
        items: [
          "Gmail — メールの読み取り、下書き作成、送信支援に必要なメタデータおよび本文",
          "Calendar — 予定の参照、作成、更新に必要なイベント情報",
          "Drive — ファイルの参照、保存、共有に必要なファイルメタデータおよび内容",
        ],
      },
      {
        type: "subheading",
        text: "アクセストークンの取り扱い",
      },
      {
        type: "paragraph",
        text: "Google OAuth により取得したアクセストークンおよびリフレッシュトークンは、サーバー側の安全なストレージにのみ保存します。これらのトークンは、クライアントへの API レスポンス、ブラウザへの直接返却、ログへの平文出力には含めません。",
      },
      {
        type: "paragraph",
        text: "連携の解除、退会、またはスコープの変更に応じて、不要となったトークンは速やかに削除または無効化します。",
      },
    ],
  },
  {
    id: "section-4",
    number: 4,
    sectionPrefix: "④",
    title: "利用目的",
    blocks: [
      {
        type: "paragraph",
        text: "当社は、取得した情報を以下の目的で利用します。",
      },
      {
        type: "bullets",
        items: [
          "本サービスの提供（認証、プラン管理、機能の実行）",
          "AI 生成（チャット、AI 社員、資料・画像・動画生成等）",
          "自動化（スケジュール実行、連携サービスへの操作）",
          "ユーザー体験の改善（UI 改善、パーソナライズ、Memory による文脈保持）",
          "障害対応（エラー調査、復旧、サポート）",
          "不正利用の防止（アクセス監視、異常検知、アカウント保護）",
          "利用分析（機能利用状況、パフォーマンス、集計統計 ※個人を特定しない形式を含む）",
        ],
      },
    ],
  },
  {
    id: "section-5",
    number: 5,
    sectionPrefix: "⑤",
    title: "AI 生成について",
    blocks: [
      {
        type: "paragraph",
        text: "AI 機能の実行時には、リクエストの処理に必要な最小限のデータのみを利用します。不要な個人情報や機密情報を AI プロバイダーへ送信しないよう、設計および運用上の配慮を行います。",
      },
      {
        type: "paragraph",
        text: "OpenAI 等の外部 AI プロバイダーへは、生成処理に必要なプロンプト、コンテキスト、設定情報等のみを送信します。各プロバイダーのデータ取り扱いについては、当該事業者のポリシーにも従います。",
      },
      {
        type: "paragraph",
        text: "ユーザーは、機密性の高い情報を AI に入力する際は、自らの判断と責任において内容を確認してください。",
      },
    ],
  },
  {
    id: "section-6",
    number: 6,
    sectionPrefix: "⑥",
    title: "第三者提供",
    blocks: [
      {
        type: "paragraph",
        text: "当社は、以下の場合を除き、本人の同意なく個人情報を第三者に提供しません。",
      },
      {
        type: "bullets",
        items: [
          "法令に基づく場合（裁判所、行政機関等からの適法な要請）",
          "人の生命、身体または財産の保護のために必要で、本人の同意を得ることが困難な場合",
          "サービス提供に必要な業務委託先（クラウド、認証、決済、AI 等）への提供 ※委託先との契約により適切な管理を義務付け",
        ],
      },
    ],
  },
  {
    id: "section-7",
    number: 7,
    sectionPrefix: "⑦",
    title: "保存期間",
    blocks: [
      {
        type: "paragraph",
        text: "当社は、利用目的の達成に必要な期間、情報を保存します。退会または利用停止後の取り扱いは、以下を目安とします（法令によりより長い保存が求められる場合はその限りではありません）。",
      },
      {
        type: "subheading",
        text: "アカウントデータ",
      },
      {
        type: "paragraph",
        text: "退会申請後、原則 30 日以内に削除します。バックアップからの完全消去まで最大 90 日を要する場合があります。",
      },
      {
        type: "subheading",
        text: "MINERVOT Memory",
      },
      {
        type: "paragraph",
        text: "アカウント存続中は保持します。ユーザーによるリセット操作、退会、または当社による削除措置に従い削除します。",
      },
      {
        type: "subheading",
        text: "技術ログ",
      },
      {
        type: "paragraph",
        text: "障害対応・セキュリティ監査のため、原則 90 日間保存したのち、匿名化または削除します。",
      },
      {
        type: "subheading",
        text: "課金履歴",
      },
      {
        type: "paragraph",
        text: "法令および会計処理のため、Stripe 上の取引記録を含め、原則 7 年間保存します。",
      },
    ],
  },
  {
    id: "section-8",
    number: 8,
    sectionPrefix: "⑧",
    title: "Cookie",
    blocks: [
      {
        type: "paragraph",
        text: "本サービスでは、認証状態の維持、セキュリティ、基本機能の提供に必要な Cookie および類似技術を、必要最低限の範囲で利用します。",
      },
      {
        type: "paragraph",
        text: "将来的に、サービス改善のため Google Analytics 等の分析ツールを導入する場合があります。その際は、本ポリシーを更新し、必要に応じて同意取得の仕組みを設けます。",
      },
    ],
  },
  {
    id: "section-9",
    number: 9,
    sectionPrefix: "⑨",
    title: "セキュリティ",
    blocks: [
      {
        type: "paragraph",
        text: "当社は、個人情報および機密データの保護のため、以下の措置を講じます。",
      },
      {
        type: "bullets",
        items: [
          "HTTPS による通信の暗号化",
          "Clerk 等による認証およびセッション管理",
          "役割に基づく権限管理",
          "保存データの暗号化（インフラおよびストレージレベル）",
          "アクセス制御、監査ログ、最小権限の原則",
        ],
      },
      {
        type: "paragraph",
        text: "完全なセキュリティを保証するものではありませんが、合理的な技術的・組織的安全管理措置を継続的に見直します。",
      },
    ],
  },
  {
    id: "section-10",
    number: 10,
    sectionPrefix: "⑩",
    title: "ユーザーの権利",
    blocks: [
      {
        type: "paragraph",
        text: "ユーザーは、自己に関する情報について、以下の権利を有します（法令の範囲内）。",
      },
      {
        type: "bullets",
        items: [
          "閲覧 — 設定画面等からプロフィール、Memory、利用状況等を確認",
          "修正 — 表示名、通知設定等の更新",
          "削除 — Memory のリセット、連携解除、コンテンツの削除依頼",
          "退会 — アカウント削除の申請",
          "問い合わせ — 本ポリシーに関する質問、開示・訂正等の請求",
        ],
      },
      {
        type: "paragraph",
        text: "請求には、本人確認のための情報提供をお願いする場合があります。合理的な期間内に対応します。",
      },
    ],
  },
  {
    id: "section-11",
    number: 11,
    sectionPrefix: "⑪",
    title: "改定",
    blocks: [
      {
        type: "paragraph",
        text: "当社は、法令の改正、サービス内容の変更等に応じ、本ポリシーを必要に応じて更新します。重要な変更がある場合は、本サービス上への掲示、メール通知等の方法でお知らせします。",
      },
      {
        type: "paragraph",
        text: "改定後に本サービスを継続利用された場合、改定後のポリシーに同意したものとみなす場合があります。",
      },
    ],
  },
  {
    id: "section-12",
    number: 12,
    sectionPrefix: "⑫",
    title: "お問い合わせ",
    blocks: [
      {
        type: "paragraph",
        text: "本ポリシーに関するお問い合わせ、個人情報の取り扱いに関するご質問は、下記の問い合わせページよりご連絡ください。",
      },
      {
        type: "link",
        label: "お問い合わせページ",
        href: PRIVACY_META.contactPath,
        description: "プライバシーに関するご請求・ご質問を受け付けています。",
      },
    ],
  },
];
