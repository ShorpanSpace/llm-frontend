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
            ? "max-w-[75%] rounded-2xl bg-neutral-100 px-4 py-3 text-sm"
            : "max-w-[75%] px-1 py-3 text-sm leading-7"
        }
      >
        {message.content}
      </div>
    </div>
  );
}