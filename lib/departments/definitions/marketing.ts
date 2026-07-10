import { MARKETING_DEPARTMENT_SYSTEM_PROMPT } from "@/lib/prompts/system/marketing";

import { defineDepartmentDefinition } from "../define";

export const marketingDepartment = defineDepartmentDefinition({
  id: "marketing",
  name: "マーケティング",
  description: "キャンペーンとコンテンツ",
  color: "orange",
  icon: "📣",
  systemPrompt: MARKETING_DEPARTMENT_SYSTEM_PROMPT,
  defaultResponsibilities: [
    "Plan campaigns and go-to-market motions",
    "Create content and messaging",
    "Define channels, KPIs, and launch calendars",
    "Grow brand awareness and demand",
  ],
  taskKeywords: [
    "marketing",
    "campaign",
    "brand",
    "content",
    "seo",
    "social",
    "advertising",
    "ads",
    "launch",
    "growth",
    "copy",
    "copywriting",
    "マーケ",
    "マーケティング",
    "キャンペーン",
  ],
  workerEligible: true,
});
