import { jaJP } from "@clerk/localizations";

const APP = "MINERVOT";

/**
 * Japanese Clerk copy for MINERVOT. Overrides dashboard `applicationName`
 * (often still "ATLAS") so user-facing auth never shows ATLAS branding.
 */
export const minervotClerkLocalization = {
  ...jaJP,
  socialButtonsBlockButton: "{{provider|titleize}}でログイン",
  socialButtonsBlockButtonManyInView: "{{provider|titleize}}",
  signIn: {
    ...jaJP.signIn,
    start: {
      ...jaJP.signIn?.start,
      title: `${APP}にログイン`,
      titleCombined: `${APP}にログイン`,
      subtitle: "Googleまたはメールアドレスで、MINERVOTアカウントにサインインしてください",
      subtitleCombined: "おかえりなさい",
      actionText: "アカウントをお持ちでない方は",
      actionLink: "新規登録",
    },
    emailCode: {
      ...jaJP.signIn?.emailCode,
      subtitle: `${APP}へ進む`,
    },
    emailCodeMfa: {
      ...jaJP.signIn?.emailCodeMfa,
      subtitle: `${APP}へ進む`,
    },
    emailLink: {
      ...jaJP.signIn?.emailLink,
      subtitle: `${APP}へ進む`,
    },
    emailLinkMfa: {
      ...jaJP.signIn?.emailLinkMfa,
      subtitle: `${APP}へ進む`,
    },
    forgotPassword: {
      ...jaJP.signIn?.forgotPassword,
      title: "パスワードをお忘れですか？",
      subtitle: "メールアドレスを入力すると、リセット用のコードをお送りします",
    },
  },
  signUp: {
    ...jaJP.signUp,
    start: {
      ...jaJP.signUp?.start,
      title: "新規登録",
      titleCombined: "新規登録",
      subtitle: "Googleまたはメールアドレスで、無料でMINERVOTアカウントを作成できます",
      subtitleCombined:
        "Googleまたはメールアドレスで、無料でMINERVOTアカウントを作成できます",
      actionText: "アカウントをお持ちの方は",
      actionLink: "ログイン",
    },
    emailCode: {
      ...jaJP.signUp?.emailCode,
      subtitle: `${APP}へ進む`,
    },
    emailLink: {
      ...jaJP.signUp?.emailLink,
      subtitle: `${APP}へ進む`,
    },
    phoneCode: {
      ...jaJP.signUp?.phoneCode,
      subtitle: `${APP}へ進む`,
    },
  },
};
