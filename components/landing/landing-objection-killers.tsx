import Link from "next/link";

import { Button } from "@/components/ui/button";

const OBJECTIONS = [
  {
    fear: "難しそう",
    kill: "覚える操作はありません。「毎朝10時に投稿して」と一度頼むだけです。",
  },
  {
    fear: "時間かかりそう",
    kill: "登録後は、最初の1件を完成させる流れだけ。説明ツアーは廃止しました。",
  },
  {
    fear: "設定が面倒",
    kill: "初回にWord/Excel形式や連携設定は出しません。必要になったら後から出ます。",
  },
  {
    fear: "本当に動く？",
    kill: "ホームページ上に、実ファイルの完成見本（Word / Excel / PowerPoint / PDF）があります。開いて確認できます。",
  },
] as const;

/**
 * Kill "reasons not to start" on the LP alone.
 */
export function LandingObjectionKillers() {
  return (
    <section
      id="objections"
      className="border-t border-[#74172A]/8 bg-[#FAF6F5] px-4 py-16 sm:px-8 sm:py-24"
    >
      <div className="mx-auto max-w-[980px]">
        <p className="text-xs font-semibold tracking-[0.16em] text-[#9A7137]">
          使わない理由を消す
        </p>
        <h2 className="mt-3 text-3xl font-semibold tracking-[-0.04em] text-[#26191C] sm:text-4xl">
          「あとで」になる理由を、先に潰す。
        </h2>

        <ul className="mt-10 space-y-3">
          {OBJECTIONS.map((item) => (
            <li
              key={item.fear}
              className="grid gap-2 rounded-[20px] border border-[#74172A]/10 bg-white p-5 sm:grid-cols-[160px_1fr] sm:gap-6"
            >
              <p className="text-sm font-semibold text-[#9A8D90]">
                「{item.fear}」
              </p>
              <p className="text-sm leading-7 text-[#281A1E]">{item.kill}</p>
            </li>
          ))}
        </ul>

        <p className="mt-6 text-sm text-[#75686B]">
          証拠は
          <a href="#proof" className="mx-1 font-medium text-[#74172A] underline-offset-2 hover:underline">
            完成見本
          </a>
          、流れは
          <a href="#finish-story" className="mx-1 font-medium text-[#74172A] underline-offset-2 hover:underline">
            仕事が終わる瞬間
          </a>
          を見てください。
        </p>

        <div className="mt-8">
          <Link href="/sign-up">
            <Button
              size="lg"
              className="min-h-13 rounded-full bg-[#74172A] px-7 text-sm font-semibold text-white hover:bg-[#5D1020]"
            >
              不安が消えたら、今すぐ1件
            </Button>
          </Link>
        </div>
      </div>
    </section>
  );
}
