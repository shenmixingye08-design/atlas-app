import { suggestFormatsFromRequest } from "./formats";
import type { ArtifactFormat } from "./types";

export type FormatSuggestion = {
  primary: ArtifactFormat;
  secondary: ArtifactFormat[];
  confidence: number;
  reason: string;
  needsConfirmation: boolean;
  /** When true, UI/API may generate multiple formats after confirmation or high confidence. */
  multiGenerate: boolean;
};

export function suggestArtifactFormats(requestText: string): FormatSuggestion {
  const base = suggestFormatsFromRequest(requestText);
  return {
    ...base,
    multiGenerate: base.secondary.length > 0 && base.confidence >= 0.8,
  };
}
