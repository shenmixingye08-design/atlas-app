import { CUSTOMER_SUCCESS_DEPARTMENT_SYSTEM_PROMPT } from "@/lib/prompts/system/customer-success";

import { defineDepartmentDefinition } from "../define";

export const customerSuccessDepartment = defineDepartmentDefinition({
  id: "customer-success",
  name: "カスタマーサクセス",
  description: "オンボーディングとサポート",
  color: "teal",
  icon: "💬",
  systemPrompt: CUSTOMER_SUCCESS_DEPARTMENT_SYSTEM_PROMPT,
  defaultResponsibilities: [
    "Customer onboarding and adoption",
    "Support playbooks and help content",
    "Health scoring and QBR preparation",
    "Churn prevention and escalation",
  ],
  taskKeywords: [
    "customer success",
    "customer support",
    "support",
    "onboarding",
    "retention",
    "churn",
    "qbr",
    "help center",
    "faq",
    "ticket",
    "cs",
    "カスタマーサクセス",
    "サポート",
    "オンボーディング",
  ],
  workerEligible: true,
});
