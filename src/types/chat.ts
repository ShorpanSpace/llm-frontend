export type MessageRole = "user" | "assistant";
export type MessageStatus = "streaming" | "completed" | "failed";
export type ChatRunState =
  | "queued"
  | "running"
  | "streaming"
  | "completed"
  | "failed"
  | "cancelled";

export interface Conversation {
  id: number;
  project_id: number | null;
  title: string;
  created_at: string;
  updated_at: string;
}

export interface Project {
  id: number;
  user_id: string | null;
  title: string;
  description: string | null;
  created_at: string;
  updated_at: string;
}

export interface Message {
  id: number;
  conversation_id: number;
  role: MessageRole;
  content: string;
  created_at: string;
}

export interface ChatMessage {
  id: string;
  role: MessageRole;
  content: string;
  status: MessageStatus;
}

export interface ChatRunStatus {
  run_id: string;
  conversation_id: number;
  user_message_id: number;
  assistant_message_id: number | null;
  status: ChatRunState;
  error: string | null;
  retry_of_id: string | null;
  attempt: number;
  created_at: string;
  started_at: string | null;
  finished_at: string | null;
  updated_at: string;
}
