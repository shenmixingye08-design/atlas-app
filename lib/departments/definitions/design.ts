import { DESIGN_DEPARTMENT_SYSTEM_PROMPT } from "@/lib/prompts/system/design";

import { defineDepartmentDefinition } from "../define";

export const designDepartment = defineDepartmentDefinition({
  id: "design",
  name: "デザイン",
  description: "ビジュアルとUX",
  color: "fuchsia",
  icon: "🎨",
  systemPrompt: DESIGN_DEPARTMENT_SYSTEM_PROMPT,
  defaultResponsibilities: [
    "Define visual and UX direction",
    "Produce layouts and design specifications",
    "Maintain brand and design system consistency",
    "Review creative quality",
  ],
  taskKeywords: [
    "design",
    "designer",
    "ui",
    "ux",
    "wireframe",
    "mockup",
    "prototype",
    "visual",
    "creative",
    "figma",
    "brand",
    "layout",
    "デザイン",
    "UI",
    "UX",
  ],
  workerEligible: true,
});
