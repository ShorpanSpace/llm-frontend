"use client";

import { useState } from "react";

import { sendChatMessage } from "@/lib/api";
import type { ChatMessage } from "@/types/chat";

import { ChatInput } from "./chat-input";
import { ChatMessage as ChatMessageView } from "./chat-message";

export function ChatPage() {
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [isLoading, setIsLoading] = useState(false);

  async function handleSend(content: string) {
    const userMessage: ChatMessage = {
      id: crypto.randomUUID(),
      role: "user",
      content,
    };

    setMessages((current) => [
      ...current,
      userMessage,
    ]);

    try {
      setIsLoading(true);

      const response = await sendChatMessage({
        message: content,
      });

      const assistantMessage: ChatMessage = {
        id: crypto.randomUUID(),
        role: "assistant",
        content: response.message,
      };

      setMessages((current) => [
        ...current,
        assistantMessage,
      ]);
    } catch {
      const errorMessage: ChatMessage = {
        id: crypto.randomUUID(),
        role: "assistant",
        content: "Request failed. Please try again.",
      };

      setMessages((current) => [
        ...current,
        errorMessage,
      ]);
    } finally {
      setIsLoading(false);
    }
  }

  return (
    <div className="flex h-screen flex-col">
      <header className="flex h-14 items-center border-b border-neutral-100 px-5">
        <span className="text-sm font-medium">
          Agent Workspace
        </span>
      </header>

      <div className="flex-1 overflow-y-auto">
        <div className="mx-auto flex w-full max-w-3xl flex-col gap-5 px-4 py-8">
          {messages.length === 0 ? (
            <div className="flex min-h-[55vh] items-center justify-center">
              <h1 className="text-2xl font-medium">
                What can I help with?
              </h1>
            </div>
          ) : (
            messages.map((message) => (
              <ChatMessageView
                key={message.id}
                message={message}
              />
            ))
          )}

          {isLoading && (
            <div className="text-sm text-neutral-400">
              Thinking...
            </div>
          )}
        </div>
      </div>

      <ChatInput
        disabled={isLoading}
        onSend={handleSend}
      />
    </div>
  );
}