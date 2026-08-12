import "server-only";

import type { ExternalAdapter } from "@/lib/automation-platform/execution/adapters/types";
import {
  configMissingInput,
  configString,
  externalSuccess,
  mapProviderFailure,
  mapThrownProviderError,
} from "@/lib/automation-platform/execution/adapters/map-provider-status";
import { resolveAutomationFeatureContext } from "@/lib/automation-platform/execution/adapters/resolve-context";
import { uploadDropboxFileForUser } from "@/lib/integrations/dropbox/service";

export const invokeDropboxAdapter: ExternalAdapter = async (input) => {
  const folderPath = configString(input.step.configuration, [
    "saveTarget",
    "folderPath",
    "destination",
    "path",
  ]);
  if (!folderPath) {
    return configMissingInput("Dropboxの保存先フォルダを選択してください");
  }

  const content = configString(input.step.configuration, [
    "content",
    "body",
    "text",
    "message",
  ]);
  if (!content) {
    return configMissingInput(
      "Dropboxへ保存する本文が設定されていません（先行成果物の自動添付は未配線）",
    );
  }

  const pattern =
    configString(input.step.configuration, ["fileNamePattern", "fileName"]) ||
    `${input.automationName || "atlas"}-${input.runId.slice(0, 8)}.txt`;
  const safeName = pattern.replace(/[\\/]/g, "-");
  const fileName = safeName.endsWith(".txt") ? safeName : `${safeName}.txt`;

  try {
    const context = await resolveAutomationFeatureContext(input.userId);
    const result = await uploadDropboxFileForUser({
      userId: input.userId,
      context,
      fileName,
      buffer: Buffer.from(content, "utf8"),
      parentPath: folderPath,
      automationId: input.automationId,
      runId: input.runId,
      occurrenceKey: input.runId,
      discriminator: input.step.id,
    });

    if (result.status !== "ready") {
      return mapProviderFailure({
        service: "Dropbox",
        status: result.status,
        message: result.message,
      });
    }

    return externalSuccess({
      summary: "Dropboxへ保存しました",
      provider: "dropbox",
      operation: "upload",
      resourceId: result.file.id,
      url: result.file.pathDisplay ?? null,
      label: result.file.name,
    });
  } catch (error) {
    return mapThrownProviderError("Dropbox", error);
  }
};
