import {
  COMPLIANCE_OFFICER_SYSTEM_PROMPT,
  GENERAL_COUNSEL_SYSTEM_PROMPT,
} from "@/lib/prompts/system/legal";

import { defineEmployee } from "../define";

export const generalCounsel = defineEmployee({
  id: "legal-general-counsel",
  name: "法務責任者",
  department: "legal",
  role: "法務責任者",
  avatar: "⚖️",
  color: "slate",
  specialties: ["compliance", "contracts", "risk_assessment"] as const,
  systemPrompt: GENERAL_COUNSEL_SYSTEM_PROMPT,
});

export const complianceOfficer = defineEmployee({
  id: "legal-compliance-officer",
  name: "コンプライアンス担当",
  department: "legal",
  role: "コンプライアンス担当",
  avatar: "📜",
  color: "slate",
  specialties: ["policy_review", "gdpr", "audit_prep"] as const,
  systemPrompt: COMPLIANCE_OFFICER_SYSTEM_PROMPT,
});

export const legalEmployees = [generalCounsel, complianceOfficer] as const;
