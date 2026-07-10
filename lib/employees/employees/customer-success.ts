import {
  CS_DIRECTOR_SYSTEM_PROMPT,
  SUPPORT_LEAD_SYSTEM_PROMPT,
} from "@/lib/prompts/system/customer-success";

import { defineEmployee } from "../define";

export const csDirector = defineEmployee({
  id: "cs-director",
  name: "CSディレクター",
  department: "customer-success",
  role: "CSディレクター",
  avatar: "💬",
  color: "teal",
  specialties: ["retention", "qbr", "success_plans"] as const,
  systemPrompt: CS_DIRECTOR_SYSTEM_PROMPT,
});

export const supportLead = defineEmployee({
  id: "cs-support-lead",
  name: "サポートリード",
  department: "customer-success",
  role: "サポートリード",
  avatar: "🎧",
  color: "teal",
  specialties: ["support", "faq", "troubleshooting"] as const,
  systemPrompt: SUPPORT_LEAD_SYSTEM_PROMPT,
});

export const customerSuccessEmployees = [csDirector, supportLead] as const;
