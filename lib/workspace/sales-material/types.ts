import type { DeliverableFormat } from "@/lib/deliverables/types";

/** User-facing format preset for sales materials. */
export type SalesFormatPreset =
  | "pptx"
  | "pdf"
  | "docx"
  | "md"
  | "txt"
  | "pptx_pdf"
  | "docx_pdf"
  | "all";

/** Cost / quality mode for sales material generation. */
export type SalesCostMode = "low" | "standard" | "high";

export type SalesMaterialOutlineSection = {
  heading: string;
  keyMessage: string;
  visualCandidates: string[];
};

/** Low-cost outline produced before full document generation. */
export type SalesMaterialOutline = {
  purpose: string;
  targetAudience: string;
  structure: string[];
  sections: SalesMaterialOutlineSection[];
  notes: string;
};

export type SalesMaterialUserPreferences = {
  preferred_output_formats: SalesFormatPreset;
  default_sales_material_style: "standard" | "executive" | "technical";
  ask_before_file_generation: boolean;
  last_selected_output_format: SalesFormatPreset;
  cost_saving_mode: SalesCostMode;
};

/** Passed through orchestration metadata for sales-material flows. */
export type SalesMaterialSessionConfig = {
  formatPreset: SalesFormatPreset;
  formats: DeliverableFormat[];
  costMode: SalesCostMode;
  skipFileGeneration: boolean;
  outlineApproved: boolean;
  outline?: SalesMaterialOutline;
};

export const DEFAULT_SALES_MATERIAL_PREFERENCES: SalesMaterialUserPreferences = {
  preferred_output_formats: "pptx_pdf",
  default_sales_material_style: "standard",
  ask_before_file_generation: true,
  last_selected_output_format: "pptx_pdf",
  cost_saving_mode: "standard",
};
