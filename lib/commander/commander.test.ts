import { describe, expect, it, beforeEach } from "vitest";

import { classifyCommanderWork, inferRequiredExternalServices } from "./classify";
import { evaluateCommanderConfirmation } from "./confirmation";
import { buildCommanderPlan } from "./plan";
import { parseCommanderRequest } from "./service";
import {
  createCommanderRun,
  getCommanderRun,
  listCommanderRunsForUser,
  requestCommanderCancel,
  resetCommanderRunStoreForTests,
} from "./run-store";

describe("commander classify", () => {
  it("classifies a single research request", () => {
    const result = classifyCommanderWork("市場の競合をリサーチしてまとめて");
    expect(result.deliverableType).toBe("research");
    expect(result.keywords).toContain("research");
  });

  it("infers multiple external services for a composite request", () => {
    const classification = classifyCommanderWork(
      "Gmailを確認してDropboxに保存しLINEで通知",
    );
    const services = inferRequiredExternalServices(
      "Gmailを確認してDropboxに保存しLINEで通知",
      classification.templateId,
    );
    const ids = services.map((service) => service.serviceId);
    expect(ids).toContain("google");
    expect(ids).toContain("dropbox");
    expect(ids).toContain("line");
  });
});

describe("commander confirmation", () => {
  it("requires confirmation for email send / SNS / delete style requests", () => {
    const plan = buildCommanderPlan({
      assignment: "完成した文面をメール送信して",
      userId: null,
    });
    const decision = evaluateCommanderConfirmation(
      "完成した文面をメール送信して",
      plan,
    );
    expect(decision.required).toBe(true);
    expect(decision.reasons.length).toBeGreaterThan(0);
  });

  it("requires confirmation for habit remember requests", () => {
    const assignment =
      "毎週月曜日に先週の仕事をまとめる作業として覚えてください";
    const plan = buildCommanderPlan({ assignment, userId: null });
    const decision = evaluateCommanderConfirmation(assignment, plan);
    expect(decision.required).toBe(true);
    expect(decision.reasons.some((reason) => reason.includes("習慣"))).toBe(
      true,
    );
  });

  it("does not require confirmation for a simple draft request", () => {
    const assignment = "週次レポートの下書きを作って";
    const plan = buildCommanderPlan({ assignment, userId: null });
    const decision = evaluateCommanderConfirmation(assignment, plan);
    expect(decision.required).toBe(false);
  });
});

describe("commander run store isolation", () => {
  beforeEach(() => {
    resetCommanderRunStoreForTests();
  });

  it("keeps runs isolated per user", () => {
    const planA = buildCommanderPlan({
      assignment: "ユーザーAの仕事",
      userId: "user_a",
    });
    const planB = buildCommanderPlan({
      assignment: "ユーザーBの仕事",
      userId: "user_b",
    });

    const runA = createCommanderRun({
      userId: "user_a",
      assignment: "ユーザーAの仕事",
      plan: planA,
      status: "planning",
    });
    createCommanderRun({
      userId: "user_b",
      assignment: "ユーザーBの仕事",
      plan: planB,
      status: "planning",
    });

    expect(getCommanderRun(runA.id, "user_b")).toBeNull();
    expect(getCommanderRun(runA.id, "user_a")?.id).toBe(runA.id);
    expect(listCommanderRunsForUser("user_a")).toHaveLength(1);
    expect(listCommanderRunsForUser("user_b")).toHaveLength(1);
  });

  it("supports cancel from awaiting confirmation", () => {
    const plan = buildCommanderPlan({
      assignment: "メール送信して",
      userId: "user_a",
    });
    const run = createCommanderRun({
      userId: "user_a",
      assignment: "メール送信して",
      plan,
      status: "awaiting_confirmation",
    });
    const cancelled = requestCommanderCancel(run.id, "user_a");
    expect(cancelled?.status).toBe("cancelled");
    expect(cancelled?.cancelRequested).toBe(true);
  });
});

describe("parseCommanderRequest", () => {
  it("parses plan / execute / confirm / cancel modes", () => {
    expect(parseCommanderRequest({ assignment: "hello", mode: "plan" })).toMatchObject({
      mode: "plan",
      assignment: "hello",
    });
    expect(
      parseCommanderRequest({ assignment: "hello", mode: "execute" }),
    ).toMatchObject({ mode: "execute" });
    expect(
      parseCommanderRequest({ mode: "confirm", runId: "run_1" }),
    ).toMatchObject({ mode: "confirm", runId: "run_1", confirmed: true });
    expect(
      parseCommanderRequest({ mode: "cancel", runId: "run_1" }),
    ).toMatchObject({ mode: "cancel", runId: "run_1" });
  });
});
