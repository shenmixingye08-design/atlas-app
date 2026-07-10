import {
  HR_DIRECTOR_SYSTEM_PROMPT,
  TALENT_PARTNER_SYSTEM_PROMPT,
} from "@/lib/prompts/system/hr";

import { defineEmployee } from "../define";

export const hrDirector = defineEmployee({
  id: "hr-director",
  name: "人事ディレクター",
  department: "hr",
  role: "人事ディレクター",
  avatar: "👥",
  color: "amber",
  specialties: ["policy", "org_design", "hiring_strategy"] as const,
  systemPrompt: HR_DIRECTOR_SYSTEM_PROMPT,
});

export const talentPartner = defineEmployee({
  id: "hr-talent-partner",
  name: "タレントパートナー",
  department: "hr",
  role: "タレントパートナー",
  avatar: "🎯",
  color: "amber",
  specialties: ["recruiting", "interviews", "onboarding"] as const,
  systemPrompt: TALENT_PARTNER_SYSTEM_PROMPT,
});

export const hrEmployees = [hrDirector, talentPartner] as const;
