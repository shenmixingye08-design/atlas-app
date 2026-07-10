import { DEVELOPMENT_DEPARTMENT_SYSTEM_PROMPT } from "@/lib/prompts/system/development";

import { defineDepartmentDefinition } from "../define";

export const developmentDepartment = defineDepartmentDefinition({
  id: "development",
  name: "開発",
  description: "技術実装と制作",
  color: "blue",
  icon: "⚙️",
  systemPrompt: DEVELOPMENT_DEPARTMENT_SYSTEM_PROMPT,
  defaultResponsibilities: [
    "Implement features and technical deliverables",
    "Write and document code",
    "Debug issues and propose fixes",
    "Translate plans into working outputs",
  ],
  taskKeywords: [
    "development",
    "develop",
    "engineer",
    "engineering",
    "code",
    "coding",
    "implement",
    "implementation",
    "api",
    "backend",
    "frontend",
    "full-stack",
    "bug",
    "fix",
    "technical",
    "software",
    "programming",
    "開発",
    "実装",
    "コード",
  ],
  workerEligible: true,
});
