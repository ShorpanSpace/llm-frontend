"use client";

import { useCallback, useEffect, useRef, useState } from "react";

import {
  cancelChatRun,
  getActiveChatRun,
  getLatestChatRun,
  getMessages,
  retryChatRun,
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

const ACTIVE_RUN_STATUSES = new Set(["queued", "running", "streaming"]);

function isActiveRun(run: ChatRunStatus | null): boolean {
  return run !== null && ACTIVE_RUN_STATUSES.has(run.status);
}

function toChatMessages(
  data: Awaited<ReturnType<typeof getMessages>>
): ChatMessage[] {
  return data.map((message) => ({
    id: String(message.id),
    role: message.role,
    content: message.content,
    status: "completed",
  }));
}

function pendingRun(runId: string, conversationId: number): ChatRunStatus {
  const now = new Date().toISOString();
  return {
    run_id: runId,
    conversation_id: conversationId,
    user_message_id: 0,
    assistant_message_id: null,
    status: "queued",
    error: null,
    retry_of_id: null,
    attempt: 1,
    created_at: now,
    started_at: null,
    finished_at: null,
    updated_at: now,
  };
}

function runLabel(run: ChatRunStatus): string {
  if (run.status === "queued") return "Queued for generation";
  if (run.status === "running") return "Preparing response";
  return "Generating response";
}

export function ChatPage({ conversationId }: ChatPageProps) {
  const { theme, toggleTheme } = useTheme();
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [loadedConversationId, setLoadedConversationId] = useState<number | null>(null);
  const [isLoadingMessages, setIsLoadingMessages] = useState(true);
  const [isLoading, setIsLoading] = useState(false);
  const [activeRun, setActiveRun] = useState<ChatRunStatus | null>(null);
  const [latestRun, setLatestRun] = useState<ChatRunStatus | null>(null);
  const [resumeRunId, setResumeRunId] = useState<string | null>(null);
  const messagesEndRef = useRef<HTMLDivElement>(null);

  const visibleMessages = loadedConversationId === conversationId ? messages : [];
  const activeRunId = activeRun?.run_id;
  const hasActiveRun = isActiveRun(activeRun);
  const canRetry = latestRun?.status === "failed" || latestRun?.status === "cancelled";

  const refreshRunResult = useCallback(async () => {
    const [data, latest] = await Promise.all([
      getMessages(conversationId),
      getLatestChatRun(conversationId),
    ]);
    setMessages(toChatMessages(data));
    setLatestRun(latest);
    setActiveRun(isActiveRun(latest) ? latest : null);
    setIsLoading(isActiveRun(latest));
    setResumeRunId(latest && isActiveRun(latest) ? latest.run_id : null);
  }, [conversationId]);

  useEffect(() => {
    let cancelled = false;

    async function loadConversation() {
      setIsLoadingMessages(true);
      setLoadedConversationId(null);
      setMessages([]);
      setActiveRun(null);
      setLatestRun(null);
      setResumeRunId(null);
      setIsLoading(false);

      try {
        const [data, active, latest] = await Promise.all([
          getMessages(conversationId),
          getActiveChatRun(conversationId),
          getLatestChatRun(conversationId),
        ]);
        if (cancelled) return;

        setMessages(toChatMessages(data));
        setActiveRun(active);
        setLatestRun(latest);
        setResumeRunId(active?.run_id ?? null);
        setIsLoading(active !== null);
      } catch {
        if (!cancelled) {
          setMessages([]);
          setActiveRun(null);
          setLatestRun(null);
          setIsLoading(false);
        }
      } finally {
        if (!cancelled) {
          setLoadedConversationId(conversationId);
          setIsLoadingMessages(false);
        }
      }
    }

    void loadConversation();
    return () => {
      cancelled = true;
    };
  }, [conversationId]);

  useEffect(() => {
    if (!resumeRunId) return;

    let cancelled = false;
    const runId = resumeRunId;
    const assistantMessageId = `streaming:${runId}`;

    async function resumeStream() {
      try {
        await subscribeChatRun(runId, (delta) => {
          if (cancelled) return;
          setActiveRun((current) =>
            current ? { ...current, status: "streaming" } : current
          );
          setMessages((current) => {
            const existing = current.find((message) => message.id === assistantMessageId);
            if (existing) {
              return current.map((message) =>
                message.id === assistantMessageId
                  ? { ...message, content: message.content + delta }
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
        if (!cancelled) await refreshRunResult();
      } catch {
        if (!cancelled) setResumeRunId(null);
      }
    }

    void resumeStream();
    return () => {
      cancelled = true;
    };
  }, [conversationId, refreshRunResult, resumeRunId]);

  useEffect(() => {
    if (resumeRunId || !activeRunId || !hasActiveRun) return;

    const interval = window.setInterval(() => {
      void refreshRunResult().catch(() => undefined);
    }, 1_500);
    return () => window.clearInterval(interval);
  }, [activeRunId, hasActiveRun, refreshRunResult, resumeRunId]);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "auto", block: "end" });
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
    let createdRunId: string | null = null;

    setMessages((current) => [...current, userMessage, assistantMessage]);
    setIsLoading(true);

    try {
      await streamMessage(
        conversationId,
        content,
        (delta) => {
          setActiveRun((current) =>
            current ? { ...current, status: "streaming" } : current
          );
          setMessages((current) =>
            current.map((message) =>
              message.id === assistantMessage.id
                ? { ...message, content: message.content + delta }
                : message
            )
          );
        },
        (runId) => {
          createdRunId = runId;
          const run = pendingRun(runId, conversationId);
          setActiveRun(run);
          setLatestRun(run);
        }
      );
      await refreshRunResult();
    } catch {
      if (createdRunId) {
        await refreshRunResult().catch(() => undefined);
      } else {
        setMessages((current) =>
          current.filter(
            (message) =>
              message.id !== userMessage.id && message.id !== assistantMessage.id
          )
        );
        setIsLoading(false);
      }
    }
  }

  async function handleCancel() {
    if (!activeRun) return;
    const cancelled = await cancelChatRun(activeRun.run_id);
    setActiveRun(null);
    setLatestRun(cancelled);
    setResumeRunId(null);
    setIsLoading(false);
    await refreshRunResult();
  }

  async function handleRetry() {
    if (!latestRun) return;
    const run = await retryChatRun(latestRun.run_id);
    setLatestRun(run);
    setActiveRun(run);
    setIsLoading(true);
    setResumeRunId(run.run_id);
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
              <h1 className="text-2xl font-medium">What can I help with?</h1>
            </div>
          ) : (
            visibleMessages.map((message) => (
              <ChatMessageView key={message.id} message={message} />
            ))
          )}

          {hasActiveRun && activeRun && (
            <div className="theme-run-notice flex items-center gap-3 rounded-xl px-3 py-2 text-xs">
              <span className="theme-run-pulse h-1.5 w-1.5 rounded-full" aria-hidden="true" />
              <span className="flex-1">{runLabel(activeRun)}</span>
              <button type="button" onClick={() => void handleCancel()} className="theme-run-action rounded-md px-2 py-1">
                Stop
              </button>
            </div>
          )}

          {!hasActiveRun && canRetry && latestRun && (
            <div className="theme-run-notice theme-run-failed flex items-center gap-3 rounded-xl px-3 py-2 text-xs">
              <span className="flex-1">
                {latestRun.status === "cancelled" ? "Generation stopped" : latestRun.error ?? "Generation failed"}
              </span>
              <button type="button" onClick={() => void handleRetry()} className="theme-run-action rounded-md px-2 py-1">
                Retry
              </button>
            </div>
          )}
          <div ref={messagesEndRef} aria-hidden="true" />
        </div>
      </div>

      <div className="theme-composer-overlay pointer-events-none absolute inset-x-0 bottom-0 z-20">
        <div className="pointer-events-auto mx-auto w-full max-w-3xl">
          <ChatInput disabled={isLoading || isLoadingMessages} onSend={handleSend} />
        </div>
      </div>
    </div>
  );
}
