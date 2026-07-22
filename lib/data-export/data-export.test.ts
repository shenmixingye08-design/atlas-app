import { describe, expect, it } from "vitest";

import {
  bundleToCsv,
  bundleToJson,
  bundleToMarkdown,
  bundleToZip,
} from "./formatters";
import { createZipArchive } from "./zip";
import { EXPORT_SCHEMA_VERSION, type AtlasExportBundle } from "./types";

const sampleBundle: AtlasExportBundle = {
  schemaVersion: EXPORT_SCHEMA_VERSION,
  exportedAt: "2026-07-10T00:00:00.000Z",
  app: "MINERVOT",
  sections: {
    workHistory: {
      projects: [
        {
          id: "p1",
          title: "Test",
          workRequest: "Do something",
          status: "completed",
          createdAt: "2026-07-09T00:00:00.000Z",
          updatedAt: "2026-07-09T01:00:00.000Z",
          result: null,
          error: null,
        },
      ],
      activityMetadata: {},
    },
    chat: { messages: [], note: "not persisted" },
    memory: { memories: [] },
    notifications: { notifications: [], preferences: null },
    automations: { automations: [] },
    googleSettings: { services: [] },
    templates: {
      activityTemplates: [],
      companyTemplate: {
        templateId: "default",
        selectedAt: "2026-07-09T00:00:00.000Z",
      },
      installedPackages: [],
    },
    favorites: { items: [] },
    profile: {
      workProfile: {
        version: 1,
        updatedAt: "2026-07-09T00:00:00.000Z",
        frequentlyUsedJobs: [],
        preferredFormats: {},
        manualPreferences: [],
        onboarding: {
          completed: true,
          completedAt: "2026-07-09T00:00:00.000Z",
          skipped: false,
          currentStep: "done",
          answers: {},
        },
      },
      costOptimization: {
        sales_material: "balanced",
        blog: "balanced",
        sns_post: "balanced",
        video: "balanced",
        email: "balanced",
        file_organize: "balanced",
        generic: "balanced",
      },
    },
  },
};

describe("data-export formatters", () => {
  it("creates valid JSON export", () => {
    const json = bundleToJson(sampleBundle);
    const parsed = JSON.parse(json) as AtlasExportBundle;
    expect(parsed.app).toBe("MINERVOT");
    expect(parsed.sections.workHistory.projects).toHaveLength(1);
  });

  it("creates markdown export", () => {
    const markdown = bundleToMarkdown(sampleBundle);
    expect(markdown).toContain("# MINERVOT データエクスポート");
    expect(markdown).toContain("Test");
  });

  it("creates csv export", () => {
    const csv = bundleToCsv(sampleBundle);
    expect(csv).toContain("# projects");
    expect(csv).toContain("p1");
  });

  it("creates zip archive", () => {
    const zip = bundleToZip(sampleBundle);
    expect(zip.length).toBeGreaterThan(100);
    expect(zip[0]).toBe(0x50);
    expect(zip[1]).toBe(0x4b);
  });
});

describe("createZipArchive", () => {
  it("packages multiple files", () => {
    const encoder = new TextEncoder();
    const zip = createZipArchive([
      { name: "hello.txt", data: encoder.encode("hello") },
    ]);
    expect(zip.byteLength).toBeGreaterThan(30);
  });
});
