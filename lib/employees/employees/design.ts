import {
  CREATIVE_DIRECTOR_SYSTEM_PROMPT,
  UI_DESIGNER_SYSTEM_PROMPT,
} from "@/lib/prompts/system/design";

import { defineEmployee } from "../define";

export const creativeDirector = defineEmployee({
  id: "design-creative-director",
  name: "クリエイティブディレクター",
  department: "design",
  role: "クリエイティブディレクター",
  avatar: "🎨",
  color: "fuchsia",
  specialties: ["visual_direction", "brand_identity", "creative_strategy"] as const,
  systemPrompt: CREATIVE_DIRECTOR_SYSTEM_PROMPT,
});

export const uiDesigner = defineEmployee({
  id: "design-ui-designer",
  name: "UIデザイナー",
  department: "design",
  role: "UIデザイナー",
  avatar: "✨",
  color: "fuchsia",
  specialties: ["ui_design", "prototyping", "design_specs"] as const,
  systemPrompt: UI_DESIGNER_SYSTEM_PROMPT,
});

export const designEmployees = [creativeDirector, uiDesigner] as const;
