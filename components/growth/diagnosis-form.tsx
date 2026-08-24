"use client";

import Link from "next/link";
import { useEffect, useState } from "react";

import { Button } from "@/components/ui/button";
import { DIAGNOSIS_QUESTIONS } from "@/lib/growth/acquisition/questions";
import type { DiagnosisAnswers, DiagnosisResult, DiagnosisSession } from "@/lib/growth/acquisition/types";

function readTracking() {
  if (typeof window === "undefined") {
    return { campaignId: null, contentId: null, source: null, medium: null };
  }
  const params = new URLSearchParams(window.location.search);
  return {
    campaignId: params.get("campaignId") ?? params.get("utm_campaign"),
    contentId: params.get("contentId") ?? params.get("utm_content"),
    source: params.get("utm_source"),
    medium: params.get("utm_medium"),
  };
}

export function DiagnosisForm() {
  const [session, setSession] = useState<DiagnosisSession | null>(null);
  const [answers, setAnswers] = useState<Partial<DiagnosisAnswers>>({});
  const [result, setResult] = useState<DiagnosisResult | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    void fetch("/api/growth/diagnosis", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      credentials: "same-origin",
      body: JSON.stringify({ action: "view", ...readTracking() }),
    }).catch(() => undefined);
    void fetch("/api/growth/diagnosis", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      credentials: "same-origin",
      body: JSON.stringify({ action: "start", ...readTracking() }),
    })
      .then(async (response) => {
        if (!response.ok) return;
        const body = (await response.json()) as { session?: DiagnosisSession };
        if (body.session) setSession(body.session);
      })
      .catch(() => undefined);
  }, []);

  const complete = async () => {
    if (!session) return;
    setError(null);
    const response = await fetch("/api/growth/diagnosis", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      credentials: "same-origin",
      body: JSON.stringify({
        action: "complete",
        sessionId: session.sessionId,
        answers,
        ...readTracking(),
      }),
    });
    const body = (await response.json()) as {
      error?: string;
      session?: DiagnosisSession;
    };
    if (!response.ok) {
      setError(body.error ?? "診断を完了できませんでした");
      return;
    }
    setResult(body.session?.result ?? null);
  };

  const tracking = readTracking();
  const signupParams = new URLSearchParams({
    redirect_url: "/projects?welcome=1",
    campaignId: session?.campaignId ?? tracking.campaignId ?? "",
    contentId: session?.contentId ?? tracking.contentId ?? "",
  });
  if (tracking.source) signupParams.set("utm_source", tracking.source);
  if (tracking.medium) signupParams.set("utm_medium", tracking.medium);
  if (session?.campaignId || tracking.campaignId) {
    signupParams.set("utm_campaign", session?.campaignId ?? tracking.campaignId ?? "");
  }
  if (session?.contentId || tracking.contentId) {
    signupParams.set("utm_content", session?.contentId ?? tracking.contentId ?? "");
  }
  const signupHref = `/sign-up?${signupParams.toString()}`;

  if (result) {
    return (
      <div className="space-y-4 text-sm">
        <h2 className="text-xl font-semibold">{result.label}</h2>
        <p>{result.burden}</p>
        <p>最初に自動化すべき1作業: {result.firstRequestExample}</p>
        <div>
          <p className="font-medium">利用できる実在機能</p>
          <ul className="list-disc pl-5">
            {result.availableFeatures.map((line) => (
              <li key={line}>{line}</li>
            ))}
          </ul>
        </div>
        <div>
          <p className="font-medium">利用できないこと</p>
          <ul className="list-disc pl-5">
            {result.unavailable.map((line) => (
              <li key={line}>{line}</li>
            ))}
          </ul>
        </div>
        <p>{result.planNote}</p>
        <div className="flex flex-wrap gap-2">
          <Link
            href={signupHref}
            onClick={() => {
              void fetch("/api/growth/diagnosis", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                  action: "signup_clicked",
                  sessionId: session?.sessionId,
                  ...readTracking(),
                }),
              }).catch(() => undefined);
            }}
          >
            <Button>無料登録する</Button>
          </Link>
          <Link
            href={signupHref}
            onClick={() => {
              void fetch("/api/growth/diagnosis", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                  action: "signup_clicked",
                  sessionId: session?.sessionId,
                  ...readTracking(),
                }),
              }).catch(() => undefined);
            }}
          >
            <Button variant="secondary">登録後、この依頼から始める</Button>
          </Link>
        </div>
      </div>
    );
  }

  return (
    <form
      className="space-y-6"
      onSubmit={(event) => {
        event.preventDefault();
        void complete();
      }}
    >
      {DIAGNOSIS_QUESTIONS.map((question) => (
        <fieldset key={question.id} className="space-y-2">
          <legend className="text-sm font-medium">{question.label}</legend>
          {question.options.map((option) => (
            <label key={option.id} className="flex items-center gap-2 text-sm">
              <input
                type="radio"
                name={question.id}
                required
                checked={answers[question.id] === option.id}
                onChange={() =>
                  setAnswers((current) => ({ ...current, [question.id]: option.id }))
                }
              />
              {option.label}
            </label>
          ))}
        </fieldset>
      ))}
      {error ? <p className="text-sm text-[var(--error)]">{error}</p> : null}
      <Button type="submit" disabled={!session}>
        結果を見る
      </Button>
      <p className="text-xs text-[var(--text-muted)]">
        氏名・会社名・メール・機密情報は入力しないでください。選択肢のみです。
      </p>
    </form>
  );
}
