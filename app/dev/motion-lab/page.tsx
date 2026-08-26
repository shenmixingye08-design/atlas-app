"use client";

import { notFound } from "next/navigation";
import { useMemo, useState } from "react";

import { CompletionMoment } from "@/components/motion/completion-moment";
import { ExpandPanel } from "@/components/motion/expand-panel";
import { MotionList, MotionListItem } from "@/components/motion/list-item";
import { ModalBackdrop, ModalChrome } from "@/components/motion/modal-chrome";
import { MotionProvider } from "@/components/motion/motion-provider";
import { BottomNavGroup, BottomNavTab } from "@/components/motion/nav-indicator";
import { PageReveal } from "@/components/motion/page-reveal";
import { RevealStagger } from "@/components/motion/reveal-stagger";
import { SubmitMorph, type SubmitPhase } from "@/components/motion/submit-morph";
import { Button } from "@/components/ui/button";
import { resetMotionPlayState } from "@/lib/motion/play-once";
import { MOTION_PLAY_KEYS } from "@/lib/motion/tokens";

/**
 * DEV-ONLY lab for logged-in motion strength. 404 in production.
 * Replay: ?motionReplay=1  Debug chip: ?motion=debug
 */
export default function DevMotionLabPage() {
  if (process.env.NODE_ENV === "production") {
    notFound();
  }

  return (
    <MotionProvider>
      <PageReveal>
        <MotionLabBody />
      </PageReveal>
    </MotionProvider>
  );
}

function MotionLabBody() {
  const [nav, setNav] = useState(0);
  const [cards, setCards] = useState(["依頼メモ", "週次レポート"]);
  const [openCard, setOpenCard] = useState(false);
  const [sheet, setSheet] = useState(false);
  const [phase, setPhase] = useState<SubmitPhase>("idle");
  const [completeId, setCompleteId] = useState("lab-complete-1");
  const [introKey, setIntroKey] = useState<string>(MOTION_PLAY_KEYS.homeIntro);

  const items = useMemo(
    () =>
      [
        { id: "today", label: "今日", icon: "⌂" },
        { id: "work", label: "仕事", icon: "☰" },
        { id: "auto", label: "自動化", icon: "↻" },
      ] as const,
    [],
  );

  return (
    <div className="min-h-screen bg-[var(--background)] px-4 pb-28 pt-6 text-foreground">
      <RevealStagger playKey={introKey} className="mx-auto max-w-md space-y-6">
        <header className="space-y-1">
          <p className="text-[length:var(--text-label)] font-semibold tracking-[0.08em] text-[var(--brand)]">
            MINERVOT
          </p>
          <h1 className="text-2xl font-semibold tracking-tight">モーション確認</h1>
          <p className="text-sm text-[var(--text-secondary)]">
            画面遷移・ナビ・ボタン・カード・完成演出を、目で分かる強さで確認します。
          </p>
        </header>

        <section className="space-y-3">
          <h2 className="text-sm font-semibold">ボタン</h2>
          <SubmitMorph
            phase={phase}
            onClick={() => {
              if (phase !== "idle") return;
              setPhase("processing");
              window.setTimeout(() => setPhase("accepted"), 180);
              window.setTimeout(() => setPhase("idle"), 900);
            }}
          >
            お願いする
          </SubmitMorph>
          <Button type="button" variant="secondary" className="w-full">
            押すと沈みます
          </Button>
        </section>

        <section className="space-y-3">
          <div className="flex items-center justify-between">
            <h2 className="text-sm font-semibold">カード</h2>
            <Button
              type="button"
              size="sm"
              variant="secondary"
              onClick={() =>
                setCards((prev) => [
                  ...prev,
                  `新しい仕事 ${prev.length + 1}`,
                ])
              }
            >
              追加
            </Button>
          </div>
          <MotionList className="space-y-2">
            {cards.map((card, index) => (
              <MotionListItem
                key={card}
                index={index}
                className="rounded-[var(--radius-lg)] border border-[var(--border-subtle)] bg-[var(--card)]"
              >
                <button
                  type="button"
                  className="flex w-full items-center justify-between px-4 py-3 text-left"
                  onClick={() => setOpenCard((value) => !value)}
                >
                  <span className="text-sm font-medium">{card}</span>
                  <span aria-hidden>{openCard ? "▲" : "▼"}</span>
                </button>
                <ExpandPanel open={openCard && index === 0}>
                  <p className="px-4 pb-3 text-sm text-[var(--text-secondary)]">
                    展開すると矢印と中身が一緒に動きます。
                  </p>
                </ExpandPanel>
                <div className="px-4 pb-3">
                  <button
                    type="button"
                    className="text-xs text-[var(--text-muted)]"
                    onClick={() =>
                      setCards((prev) => prev.filter((item) => item !== card))
                    }
                  >
                    削除
                  </button>
                </div>
              </MotionListItem>
            ))}
          </MotionList>
        </section>

        <section className="space-y-3">
          <h2 className="text-sm font-semibold">完成演出</h2>
          <CompletionMoment
            id={completeId}
            liveMessage="成果物をご用意しました。"
            actions={
              <div className="mt-4 flex gap-2">
                <Button type="button" size="sm">
                  確認する
                </Button>
                <Button type="button" size="sm" variant="secondary">
                  ダウンロード
                </Button>
              </div>
            }
          >
            <div className="rounded-[var(--radius-xl)] border border-[var(--border-subtle)] bg-[var(--card)] p-5 shadow-[var(--shadow-sm)]">
              <p className="text-sm font-semibold">週次レポート</p>
              <p className="mt-1 text-sm text-[var(--text-secondary)]">
                ご確認とダウンロードの準備ができました。
              </p>
            </div>
          </CompletionMoment>
        </section>
      </RevealStagger>

      <div className="mx-auto mt-6 flex max-w-md flex-wrap gap-2">
        <Button
          type="button"
          size="sm"
          variant="secondary"
          onClick={() => setSheet(true)}
        >
          シートを開く
        </Button>
        <Button
          type="button"
          size="sm"
          variant="secondary"
          onClick={() => {
            resetMotionPlayState();
            setIntroKey(`${MOTION_PLAY_KEYS.homeIntro}:${Date.now()}`);
            setCompleteId(`lab-complete-${Date.now()}`);
            setPhase("idle");
          }}
        >
          再生をリセット
        </Button>
      </div>

      <ModalBackdrop open={sheet} className="fixed inset-0 z-[70]">
        <button
          type="button"
          className="absolute inset-0 bg-black/40"
          aria-label="閉じる"
          onClick={() => setSheet(false)}
        />
        <ModalChrome
          open={sheet}
          placement="sheet"
          className="absolute inset-x-0 bottom-0 rounded-t-[var(--radius-xl)] bg-[var(--surface-elevated)] p-5"
        >
          <p className="text-sm font-semibold">確認</p>
          <p className="mt-2 text-sm text-[var(--text-secondary)]">
            パネルは下から現れ、閉じるときも下がります。
          </p>
          <Button
            type="button"
            className="mt-4 w-full"
            onClick={() => setSheet(false)}
          >
            閉じる
          </Button>
        </ModalChrome>
      </ModalBackdrop>

      <nav
        aria-label="モーション確認メニュー"
        className="fixed inset-x-0 bottom-0 border-t border-[var(--border-subtle)] bg-[var(--surface-raised)]"
      >
        <BottomNavGroup className="relative mx-auto flex max-w-md items-stretch justify-around px-0.5 pt-1 pb-[env(safe-area-inset-bottom)]">
          {items.map((item, index) => (
            <BottomNavTab
              key={item.id}
              label={item.label}
              icon={<span className="text-lg leading-none">{item.icon}</span>}
              active={nav === index}
              pillId="lab-bottom-nav-pill"
              onClick={() => setNav(index)}
              className={
                nav === index
                  ? "text-[var(--brand)]"
                  : "text-[var(--text-muted)]"
              }
            />
          ))}
        </BottomNavGroup>
      </nav>
    </div>
  );
}
