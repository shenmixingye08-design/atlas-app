export type PresentationKind =
  | "sales_pitch"
  | "company_intro"
  | "business_plan"
  | "investor"
  | "product"
  | "internal_meeting"
  | "training"
  | "seminar"
  | "school"
  | "monthly_report"
  | "proposal"
  | "service_intro"
  | "generic";

export type ThemeId =
  | "business"
  | "sales"
  | "corporate"
  | "modern"
  | "simple"
  | "startup"
  | "education"
  | "training"
  | "report"
  | "proposal";

export type AspectRatio = "16:9" | "4:3";

export type SlideType =
  | "title"
  | "agenda"
  | "section"
  | "bullets"
  | "two_column"
  | "comparison"
  | "process"
  | "timeline"
  | "quadrant"
  | "kpi_cards"
  | "chart"
  | "table"
  | "image"
  | "faq"
  | "cta"
  | "closing"
  | "notes_heavy";

export type ChartType =
  | "bar"
  | "bar_horizontal"
  | "line"
  | "pie"
  | "stacked_bar"
  | "scatter"
  | "area"
  | "waterfall"
  | "kpi";

export type VisualType =
  | "process"
  | "comparison"
  | "quadrant"
  | "timeline"
  | "roadmap"
  | "before_after"
  | "funnel"
  | "flow"
  | "org"
  | "placeholder";

export type BrandConfig = {
  companyName?: string;
  primaryColor?: string;
  accentColor?: string;
  logoBase64?: string;
  logoMimeType?: string;
  footer?: string;
  contact?: string;
  fontFamily?: string;
};

export type SlideBullet = { text: string; level?: 0 | 1 };

export type SlideChart = {
  type: ChartType;
  title?: string;
  categories: string[];
  series: Array<{ name: string; values: number[] }>;
  unit?: string;
  showLegend?: boolean;
  showValue?: boolean;
};

export type SlideVisual = {
  type: VisualType;
  title?: string;
  items: string[];
  labels?: string[];
};

export type SlideImage = {
  bytesBase64?: string;
  mimeType?: string;
  caption?: string;
  isAiGenerated?: boolean;
  source?: string;
};

export type SlideModel = {
  slide_number: number;
  type: SlideType;
  title: string;
  subtitle?: string;
  content: SlideBullet[];
  visuals: SlideVisual[];
  charts: SlideChart[];
  images?: SlideImage[];
  table?: { headers: string[]; rows: string[][] };
  speaker_notes: string;
  source_references: string[];
  layout: string;
  estimated_seconds?: number;
};

export type PresentationTheme = {
  style: ThemeId;
  font_family: string;
  tone: string;
  brand: BrandConfig;
  colors: {
    primary: string;
    accent: string;
    text: string;
    muted: string;
    surface: string;
    light: string;
  };
};

export type PresentationModel = {
  presentation_title: string;
  purpose: string;
  audience: string;
  language: "ja-JP" | "en-US";
  aspect_ratio: AspectRatio;
  kind: PresentationKind;
  duration_minutes: number;
  theme: PresentationTheme;
  slides: SlideModel[];
  warnings: string[];
  assumptions: string[];
};

export type PptxPreviewPayload = {
  title: string;
  kind: PresentationKind;
  aspectRatio: AspectRatio;
  themeId: ThemeId;
  slideCount: number;
  slides: Array<{
    slideNumber: number;
    type: SlideType;
    title: string;
    previewText: string;
    hasChart: boolean;
    hasVisual: boolean;
    hasNotes: boolean;
    estimatedSeconds: number;
  }>;
  warnings: string[];
  assumptions: string[];
  scaleGuidance: string;
};

export type PptxEditOperation =
  | { op: "delete_slides"; slides: number[] }
  | { op: "reorder_slides"; order: number[] }
  | { op: "shorten_text" }
  | { op: "change_theme"; theme: ThemeId }
  | { op: "set_duration"; minutes: number }
  | { op: "add_cta"; text: string }
  | { op: "translate"; language: "ja-JP" | "en-US" }
  | { op: "regenerate_notes" };

export type PptxSecretaryResult = {
  ok: boolean;
  presentation: PresentationModel | null;
  buffer: Buffer | null;
  fileName: string;
  slideCount: number;
  errors: Array<{
    stage: string;
    code: string;
    message: string;
    retriable: boolean;
    diagnosticId?: string;
  }>;
  warnings: string[];
  preview: PptxPreviewPayload | null;
  revisionNote?: string;
};

export type PptxPipelineStage =
  | "validating"
  | "intent"
  | "outlining"
  | "content"
  | "design"
  | "visuals"
  | "pptx_build"
  | "validating_output"
  | "preview"
  | "pdf"
  | "saving"
  | "edit";
