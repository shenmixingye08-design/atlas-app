import type { JobCategoryId } from "@/lib/user-profile/types";
import type { OnboardingTaskId } from "@/lib/user-profile/types";

export type FirstExperienceTaskId =
  | "sns"
  | "blog"
  | "sales_material"
  | "email"
  | "ai_chat"
  | "files"
  | "custom";

export type FirstExperienceEmployeeStep = {
  icon: string;
  role: string;
  status: string;
};

export type FirstExperienceDeliverable = {
  title: string;
  preview: string;
  format: string;
};

export type FirstExperienceTaskDefinition = {
  id: FirstExperienceTaskId;
  icon: string;
  label: string;
  jobCategory: JobCategoryId;
  assignment: string;
  leadEmployee: string;
  saveLocation: string;
  deliverable: FirstExperienceDeliverable;
  employeeSteps: FirstExperienceEmployeeStep[];
  nextIntegration: {
    label: string;
    href: string;
  };
  onboardingTaskId: OnboardingTaskId;
};

export type FirstExperienceResult = {
  taskId: FirstExperienceTaskId;
  jobCategory: JobCategoryId;
  durationSec: number;
  deliverable: FirstExperienceDeliverable;
  leadEmployee: string;
  saveLocation: string;
  nextIntegration: FirstExperienceTaskDefinition["nextIntegration"];
  usedRealOrchestration: boolean;
};
