import { describe, expect, it } from "vitest";

import {
  buildExecutionFlowContext,
  createDefaultExecutionFlow,
  formatExecutionFlowSummary,
  inferWorkflowTemplate,
  normalizeExecutionFlow,
  toggleExecutionFlowStep,
} from "./execution-flow";
import { buildCreateInputFromForm, defaultAutomationFormState } from "./form-utils";
import { WORKFLOW_TEMPLATES } from "./workflow-templates";

describe("execution flow", () => {
  it("defines preset templates for common job types", () => {
    expect(WORKFLOW_TEMPLATES.sns_post.steps).toHaveLength(5);
    expect(WORKFLOW_TEMPLATES.blog.steps).toHaveLength(5);
    expect(WORKFLOW_TEMPLATES.sales_material.steps).toHaveLength(5);
    expect(WORKFLOW_TEMPLATES.video.steps).toHaveLength(6);
  });

  it("infers template from job text", () => {
    expect(inferWorkflowTemplate("SNS投稿")).toBe("sns_post");
    expect(inferWorkflowTemplate("毎週ブログを書く")).toBe("blog");
    expect(inferWorkflowTemplate("営業資料を作る")).toBe("sales_material");
    expect(inferWorkflowTemplate("YouTube動画")).toBe("video");
  });

  it("defaults external integrations to off", () => {
    const flow = createDefaultExecutionFlow("sns_post");
    const publish = flow.steps.find((step) => step.id === "publish");
    const copywriting = flow.steps.find((step) => step.id === "copywriting");

    expect(publish?.enabled).toBe(false);
    expect(copywriting?.enabled).toBe(true);
  });

  it("toggles steps and builds run context", () => {
    const flow = toggleExecutionFlowStep(
      createDefaultExecutionFlow("blog"),
      "wordpress_publish",
      true,
    );

    const context = buildExecutionFlowContext(flow);
    expect(context).toContain("WordPress投稿");
    expect(formatExecutionFlowSummary(flow)).toContain("WordPress投稿");
  });

  it("round-trips through create input", () => {
    const input = buildCreateInputFromForm(
      defaultAutomationFormState({
        title: "SNS投稿",
        executionFlow: createDefaultExecutionFlow("sns_post"),
      }),
    );

    expect(input.executionFlow?.templateId).toBe("sns_post");
    expect(normalizeExecutionFlow(input.executionFlow).steps).toHaveLength(5);
  });
});
