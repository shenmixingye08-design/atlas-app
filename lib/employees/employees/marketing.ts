import {
  CONTENT_STRATEGIST_SYSTEM_PROMPT,
  MARKETING_DIRECTOR_SYSTEM_PROMPT,
} from "@/lib/prompts/system/marketing";

import { defineEmployee } from "../define";

export const marketingDirector = defineEmployee({
  id: "marketing-director",
  name: "マーケティングディレクター",
  department: "marketing",
  role: "マーケティングディレクター",
  avatar: "📣",
  color: "orange",
  specialties: ["campaign_strategy", "content_marketing", "growth"] as const,
  systemPrompt: MARKETING_DIRECTOR_SYSTEM_PROMPT,
});

export const contentStrategist = defineEmployee({
  id: "marketing-content-strategist",
  name: "コンテンツストラテジスト",
  department: "marketing",
  role: "コンテンツストラテジスト",
  avatar: "✍️",
  color: "orange",
  specialties: ["copywriting", "seo", "social_media"] as const,
  systemPrompt: CONTENT_STRATEGIST_SYSTEM_PROMPT,
});

export const marketingEmployees = [marketingDirector, contentStrategist] as const;
