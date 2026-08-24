export type ActivationEmptySurface =
  | "requests"
  | "automations"
  | "deliverables"
  | "memory"
  | "x_posts"
  | "integrations"
  | "notifications";

export type ActivationEmptyCopy = {
  title: string;
  description: string;
  primaryLabel: string;
  primaryHref: string;
  secondaryLabel?: string;
  secondaryHref?: string;
};

export function activationEmptyCopy(
  surface: ActivationEmptySurface,
): ActivationEmptyCopy {
  switch (surface) {
    case "requests":
      return {
        title: "まだ依頼はありません",
        description: "任せたいことを一文書くと、MINERVOTが仕事を進めます。",
        primaryLabel: "最初の依頼を作る",
        primaryHref: "/workspace?preset=x-post&activation=1",
        secondaryLabel: "目的から選ぶ",
        secondaryHref: "/projects?onboarding=1",
      };
    case "automations":
      return {
        title: "自動化はまだありません",
        description: "毎週や毎日の仕事を1件だけ保存すると、次回から確認が減ります。",
        primaryLabel: "自動化を1件作る",
        primaryHref: "/automations?create=1",
      };
    case "deliverables":
      return {
        title: "まだ成果物はありません",
        description: "依頼が完了すると、ここで開いて確認できます。",
        primaryLabel: "資料を依頼する",
        primaryHref: "/workspace?preset=materials&activation=1",
      };
    case "memory":
      return {
        title: "まだ記憶はありません",
        description: "仕事の好みは、確認した内容だけ覚えます。勝手には保存しません。",
        primaryLabel: "記憶の設定を開く",
        primaryHref: "/settings/memory",
      };
    case "x_posts":
      return {
        title: "X投稿はまだありません",
        description: "まずは投稿案を作り、確認してから接続できます。",
        primaryLabel: "投稿案を作る",
        primaryHref: "/workspace?preset=x-post&activation=1",
        secondaryLabel: "X連携の説明",
        secondaryHref: "/workspace/x?onboarding=1",
      };
    case "integrations":
      return {
        title: "外部サービスは未接続です",
        description: "接続は、投稿や予定登録が必要になったタイミングで案内します。",
        primaryLabel: "X投稿から始める",
        primaryHref: "/workspace/x?onboarding=1",
      };
    case "notifications":
      return {
        title: "新しいお知らせはありません",
        description: "仕事が完了したときや、確認が必要なときだけここに出ます。",
        primaryLabel: "仕事を依頼する",
        primaryHref: "/workspace",
      };
    default:
      return {
        title: "まだありません",
        description: "最初の仕事から始められます。",
        primaryLabel: "依頼する",
        primaryHref: "/workspace",
      };
  }
}
