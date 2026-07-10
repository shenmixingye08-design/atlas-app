export type ChatMessage = {
  id: string;
  role: "user" | "assistant";
  content: string;
};

export type StreamEvent = {
  type: string;
  delta?: string;
};
