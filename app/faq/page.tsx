import type { Metadata } from "next";
import Link from "next/link";

export const metadata: Metadata = {
  title: "よくある質問 — MINERVOT",
  description:
    "不具合時の再試行、request_id、外部連携の再接続、課金・データ削除の案内",
};

const FAQ_ITEMS: Array<{ q: string; a: string }> = [
  {
    q: "処理が失敗しました。どうすればよいですか？",
    a: "まずは同じ内容で再試行してください。画像解析の場合は再解析、外部連携の場合は設定から再接続を試してください。それでも解決しない場合はエラー画面のエラーIDまたは request_id を控えてお問い合わせください。",
  },
  {
    q: "request_id / diagnosticId はどこにありますか？",
    a: "エラー画面・完了画面・サポート向け診断表示に出ます。問い合わせ時に必ず添えてください。対応が早くなります。",
  },
  {
    q: "外部連携（X / Gmail など）が動きません",
    a: "現在、外部投稿・送信は公開対象外のため停止している場合があります。ステータスページをご確認のうえ、再開後は設定から再接続してください。",
  },
  {
    q: "課金・解約・返金について",
    a: "設定のBillingから契約状態を確認できます。解約手続きは同画面から行えます。返金方針の最終判断は利用規約および運営対応に従います。課金専用のお問い合わせは contact フォームで「課金」を選んでください。",
  },
  {
    q: "データ削除・アカウント削除",
    a: "データ削除依頼・アカウント削除はお問い合わせから受け付けます。本人確認のうえ対応します。返信目安は営業日2〜3日です。",
  },
  {
    q: "障害情報はどこで見られますか？",
    a: "ステータスページ（/status）で Webアプリ・AI・Vision・成果物・Storage・通知・外部連携・課金の状態を確認できます。",
  },
  {
    q: "返信目安は？",
    a: "通常、営業日2〜3日以内にご返信します。重大障害時はステータスページを優先して更新します。",
  },
];

export default function FaqPage() {
  return (
    <div className="terms-page min-h-screen bg-[var(--terms-bg)] text-[var(--terms-heading)]">
      <header className="border-b border-[var(--border-subtle)]">
        <div className="mx-auto flex max-w-3xl items-center justify-between gap-4 px-4 py-4 sm:px-8">
          <Link href="/" className="text-base font-semibold">
            MINERVOT
          </Link>
          <div className="flex gap-4 text-sm">
            <Link href="/status" className="text-[var(--terms-accent)]">
              ステータス
            </Link>
            <Link href="/contact" className="text-[var(--terms-accent)]">
              お問い合わせ
            </Link>
          </div>
        </div>
      </header>
      <main className="mx-auto max-w-3xl px-4 py-10 sm:px-8">
        <h1 className="text-3xl font-semibold tracking-tight">よくある質問</h1>
        <p className="mt-3 text-[var(--terms-muted)]">
          まずご自身で復旧できる操作を試してから、必要ならエラーID付きでお問い合わせください。
        </p>
        <div className="mt-8 space-y-6">
          {FAQ_ITEMS.map((item) => (
            <section key={item.q}>
              <h2 className="text-lg font-medium">{item.q}</h2>
              <p className="mt-2 text-sm leading-relaxed text-[var(--terms-muted)]">
                {item.a}
              </p>
            </section>
          ))}
        </div>
      </main>
    </div>
  );
}
