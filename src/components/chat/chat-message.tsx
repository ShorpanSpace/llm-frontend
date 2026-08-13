import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";

import type { ChatMessage as ChatMessageType } from "@/types/chat";

interface ChatMessageProps {
  message: ChatMessageType;
}

export function ChatMessage({ message }: ChatMessageProps) {
  const isUser = message.role === "user";

  return (
    <div
      className={`flex ${
        isUser ? "justify-end" : "justify-start"
      }`}
    >
      <div
        className={
          isUser
            ? "theme-user-bubble max-w-[75%] rounded-2xl px-4 py-3 text-sm"
            : "theme-assistant-bubble markdown-body max-w-[75%] px-1 py-3 text-sm"
        }
      >
        {isUser ? (
          <span className="whitespace-pre-wrap">{message.content}</span>
        ) : (
          <ReactMarkdown remarkPlugins={[remarkGfm]}>
            {message.content}
          </ReactMarkdown>
        )}
      </div>
    </div>
  );
}
