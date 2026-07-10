export const MEMORY_CATEGORIES = [
  "writing",
  "sns",
  "sales",
  "email",
  "blog",
  "image",
  "video",
  "schedule",
  "google",
  "automation",
  "other",
] as const;

export type MemoryCategory = (typeof MEMORY_CATEGORIES)[number];

export const LEARNING_KEYS = [
  "sentence_ending",
  "text_length",
  "honorific",
  "emoji",
  "color",
  "font",
  "layout",
  "post_time",
  "post_day",
  "blog_length",
  "email_reply_speed",
  "preferred_ai_employee",
  "preferred_service",
  "bookkeeping",
  "vehicle",
  "recurring_work",
] as const;

export type LearningKey = (typeof LEARNING_KEYS)[number];

export type UserMemory = {
  memoryId: string;
  userId: string;
  category: MemoryCategory;
  title: string;
  content: string;
  confidence: number;
  pinned: boolean;
  learningKey?: LearningKey;
  lastUsedAt: string;
  createdAt: string;
  updatedAt: string;
};

export type MemorySuggestion = {
  id: string;
  message: string;
  category?: MemoryCategory;
  confidence: number;
};

export type CreateMemoryInput = {
  category: MemoryCategory;
  title: string;
  content: string;
  confidence?: number;
  pinned?: boolean;
  learningKey?: LearningKey;
};

export type UpdateMemoryInput = Partial<
  Pick<UserMemory, "title" | "content" | "category" | "confidence" | "pinned">
>;

export type MemoryListResponse = {
  memories: UserMemory[];
  suggestions: MemorySuggestion[];
  sections: {
    recent: UserMemory[];
    workStyle: UserMemory[];
    preferredAi: UserMemory[];
    usageTrends: UserMemory[];
    automationTrends: UserMemory[];
    pinned: UserMemory[];
  };
};

export type MemoryResetInput = {
  category?: MemoryCategory;
  all?: boolean;
};

export const MAX_MEMORIES_PER_USER = 200;
