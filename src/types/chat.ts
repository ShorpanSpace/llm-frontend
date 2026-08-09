export type MessageRole = "user" | "assistant";

export interface ChatMessage {
  id: string;
  role: MessageRole;
  content: string;
}

export interface ChatRequest {
  message: string;
}

export interface ChatResponse {
  message: string;
}