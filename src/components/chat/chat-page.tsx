"use client";

import { useEffect, useRef, useState } from "react";

import {
  getActiveChatRun,
  getChatRunStatus,
  getMessages,
  subscribeChatRun,
  streamMessage,
} from "@/lib/api";
import type { ChatMessage, ChatRunStatus } from "@/types/chat";

import { ChatInput } from "./chat-input";
import { ChatMessage as ChatMessageView } from "./chat-message";
import { useTheme } from "../layout/theme-context";
interface ChatPageProps {
  conversationId: number;
}

const ACTIVE_RUN_STATUSES = new Set([
  "queued",
  "running",
  "streaming",
]);

function isActiveRun(status: ChatRunStatus | null): boolean {
  return status !== null && ACTIVE_RUN_STATUSES.has(status.status);
}

function toChatMessages(data: Awaited<ReturnType<typeof getMessages>>): ChatMessage[] {
  return data.map((message) => ({
    id: String(message.id),
    role: message.role,
    content: message.content,
    status: "completed",
  }));
}

const runStorageKey = (conversationId: number) =>
  `chat-run:${conversationId}`;

export function ChatPage({ conversationId }: ChatPageProps) {
  const { theme, toggleTheme } = useTheme();
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [loadedConversationId, setLoadedConversationId] = useState<
    number | null
  >(null);
  const [isLoadingMessages, setIsLoadingMessages] = useState(true);
  const [isLoading, setIsLoading] = useState(false);
  const [activeRun, setActiveRun] = useState<ChatRunStatus | null>(null);
  const [resumeRunId, setResumeRunId] = useState<string | null>(null);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const activeRunId = activeRun?.run_id;
  const activeRunIsPending = ACTIVE_RUN_STATUSES.has(
    activeRun?.status ?? ""
  );

  useEffect(() => {
    let cancelled = false;

    async function loadMessages() {
      setIsLoadingMessages(true);
      setLoadedConversationId(null);
      setActiveRun(null);
      setResumeRunId(null);
      setIsLoading(false);

      try {
        const [data, run] = await Promise.all([
          getMessages(conversationId),
          getActiveChatRun(conversationId),
        ]);

        if (!cancelled) {
          const pendingRun = isActiveRun(run) ? run : null;
          setMessages(toChatMessages(data));
          setActiveRun(pendingRun);
          setResumeRunId(pendingRun?.run_id ?? null);
          setIsLoading(pendingRun !== null);
          setLoadedConversationId(conversationId);
        }
      } catch {
        if (!cancelled) {
          setMessages([]);
          setActiveRun(null);
          setResumeRunId(null);
          setIsLoading(false);
          setLoadedConversationId(conversationId);
        }
      } finally {
        if (!cancelled) {
          setIsLoadingMessages(false);
        }
      }
    }

    void loadMessages();

    return () => {
      cancelled = true;
    }
  }, [conversationId]);

  useEffect(() => {
    if (!resumeRunId) {
      return;
    }

    let cancelled = false;
    const runId = resumeRunId;
    const assistantMessageId = `resumed-assistant:${runId}`;

    async function resumeStream() {
      try {
        await subscribeChatRun(runId, (delta) => {
          if (cancelled) {
            return;
          }

          setMessages((current) => {
            const existing = current.find(
              (message) => message.id === assistantMessageId
            );

            if (existing) {
              return current.map((message) =>
                message.id === assistantMessageId
                  ? {
                      ...message,
                      content: message.content + delta,
                    }
                  : message
              );
            }

            return [
              ...current,
              {
                id: assistantMessageId,
                role: "assistant",
                content: delta,
                status: "streaming",
              },
            ];
          });
        });

        if (cancelled) {
          return;
        }

        const data = await getMessages(conversationId);
        setMessages(toChatMessages(data));
        setActiveRun(null);
        setResumeRunId(null);
        setIsLoading(false);
        window.localStorage.removeItem(runStorageKey(conversationId));
      } catch {
        if (!cancelled) {
          // Fall back to status polling if the reconnecting SSE fails.
          setResumeRunId(null);
        }
      }
    }

    void resumeStream();

    return () => {
      cancelled = true;
    };
  }, [conversationId, resumeRunId]);

  useEffect(() => {
    if (resumeRunId || !activeRunId || !activeRunIsPending) {
      return;
    }

    let cancelled = false;
    const runId = activeRunId;

    async function pollRun() {
      try {
        const next = await getChatRunStatus(runId);

        if (cancelled) {
          return;
        }

        if (isActiveRun(next)) {
          setActiveRun(next);
          return;
        }

        const data = await getMessages(conversationId);
        if (!cancelled) {
          setMessages(toChatMessages(data));
          setActiveRun(null);
          setIsLoading(false);
          window.localStorage.removeItem(runStorageKey(conversationId));
        }
      } catch {
        if (!cancelled) {
          setActiveRun(null);
          setIsLoading(false);
        }
      }
    }

    const interval = window.setInterval(() => {
      void pollRun();
    }, 1000);

    return () => {
      cancelled = true;
      window.clearInterval(interval);
    };
  }, [activeRunId, activeRunIsPending, conversationId, resumeRunId]);

  const visibleMessages =
    loadedConversationId === conversationId ? messages : [];

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({
      behavior: "auto",
      block: "end",
    });
  }, [conversationId, isLoadingMessages, isLoading, messages]);

  async function handleSend(content: string) {
    const userMessage: ChatMessage = {
      id: crypto.randomUUID(),
      role: "user",
      content,
      status: "completed",
    };

    const assistantMessage: ChatMessage = {
      id: crypto.randomUUID(),
      role: "assistant",
      content: "",
      status: "streaming",
    };

    setMessages((current) => [
      ...current,
      userMessage,
      assistantMessage,
    ]);

    setIsLoading(true);

    try {
      await streamMessage(
        conversationId,
        content,
        (delta) => {
          setMessages((current) =>
            current.map((message) =>
              message.id === assistantMessage.id
                ? { ...message, content: message.content + delta }
                : message
            )
          );
        },
        (runId) => {
          window.localStorage.setItem(
            runStorageKey(conversationId),
            runId
          );
          setActiveRun({
            run_id: runId,
            conversation_id: conversationId,
            status: "queued",
            updated_at: Date.now() / 1000,
            error: null,
          });
        }
      );

      setMessages((current) =>
        current.map((message) =>
          message.id === assistantMessage.id
            ? { ...message, status: "completed" }
            : message
        )
      );
      setActiveRun(null);
      window.localStorage.removeItem(runStorageKey(conversationId));
    } catch {
      setMessages((current) =>
        current.map((message) =>
          message.id === assistantMessage.id
            ? {
                ...message,
                content: "Request failed. Please try again.",
                status: "failed",
              }
            : message
        )
      );
      setActiveRun(null);
      window.localStorage.removeItem(runStorageKey(conversationId));
    } finally {
      setIsLoading(false);
    }
  }

  return (
    <div className="theme-page relative flex h-screen flex-col">
      <button
        type="button"
        onClick={toggleTheme}
        className="theme-toggle absolute right-5 top-5 z-10"
        aria-label={`Switch to ${theme === "light" ? "dark" : "light"} mode`}
        title={`Switch to ${theme === "light" ? "dark" : "light"} mode`}
      >
        {theme === "light" ? "☾" : "☼"}
      </button>

      <div className="theme-message-scroll h-full overflow-y-auto">
        <div className="theme-message-list mx-auto flex w-full max-w-3xl flex-col gap-5 px-4 pb-40 pt-8">
          {isLoadingMessages ? (
            <div className="theme-muted flex min-h-[55vh] items-center justify-center text-sm">
              Loading conversation...
            </div>
          ) : visibleMessages.length === 0 ? (
            <div className="flex min-h-[55vh] items-center justify-center">
              <h1 className="text-2xl font-medium">
                What can I help with?
              </h1>
            </div>
          ) : (
            visibleMessages.map((message) => (
              <ChatMessageView
                key={message.id}
                message={message}
              />
            ))
          )}

          {isLoading && (
            <div className="theme-muted text-sm">
              Thinking...
            </div>
          )}
          <div ref={messagesEndRef} aria-hidden="true" />
        </div>
      </div>

      <div className="theme-composer-overlay pointer-events-none absolute inset-x-0 bottom-0 z-20">
        <div className="pointer-events-auto mx-auto w-full max-w-3xl">
          <ChatInput
            disabled={isLoading || isLoadingMessages}
            onSend={handleSend}
          />
        </div>
      </div>
    </div>
  );
}
