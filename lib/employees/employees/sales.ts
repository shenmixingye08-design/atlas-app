import {
  ACCOUNT_EXECUTIVE_SYSTEM_PROMPT,
  SALES_DIRECTOR_SYSTEM_PROMPT,
} from "@/lib/prompts/system/sales";

import { defineEmployee } from "../define";

export const salesDirector = defineEmployee({
  id: "sales-director",
  name: "営業ディレクター",
  department: "sales",
  role: "営業ディレクター",
  avatar: "🤝",
  color: "rose",
  specialties: [
    "pipeline_strategy",
    "client_acquisition",
    "revenue_forecasting",
  ] as const,
  systemPrompt: SALES_DIRECTOR_SYSTEM_PROMPT,
});

export const accountExecutive = defineEmployee({
  id: "sales-account-exec",
  name: "アカウントエグゼクティブ",
  department: "sales",
  role: "アカウントエグゼクティブ",
  avatar: "💼",
  color: "rose",
  specialties: ["demos", "negotiation", "crm_updates"] as const,
  systemPrompt: ACCOUNT_EXECUTIVE_SYSTEM_PROMPT,
});

export const salesEmployees = [salesDirector, accountExecutive] as const;
