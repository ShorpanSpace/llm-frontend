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
import { TracePanel } from "./trace-panel";
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

export function ChatPage({ conversationId }: ChatPageProps) {
  const { theme, toggleTheme } = useTheme();
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [loadedConversationId, setLoadedConversationId] = useState<number | null>(null);
  const [isLoadingMessages, setIsLoadingMessages] = useState(true);
  const [isLoading, setIsLoading] = useState(false);
  const [activeRun, setActiveRun] = useState<ChatRunStatus | null>(null);
  const [latestRun, setLatestRun] = useState<ChatRunStatus | null>(null);
  const [resumeRunId, setResumeRunId] = useState<string | null>(null);
  const [pendingAssistantId, setPendingAssistantId] = useState<string | null>(null);
  const focusQuestionIdRef = useRef<string | null>(null);
  const scrollToLatestOnLoadRef = useRef(true);
  const followGenerationRef = useRef(false);
  const messageScrollRef = useRef<HTMLDivElement>(null);
  const composerRef = useRef<HTMLDivElement>(null);

  const visibleMessages = loadedConversationId === conversationId ? messages : [];
  const activeRunId = activeRun?.run_id;
  const hasActiveRun = isActiveRun(activeRun);
  const generatingAssistantId = resumeRunId
    ? `streaming:${resumeRunId}`
    : pendingAssistantId;
  const isThinking = isLoading && activeRun?.status !== "streaming";
  const canRetry = latestRun?.status === "failed" || latestRun?.status === "cancelled";
  const questionMessages = visibleMessages.filter(
    (message) => message.role === "user"
  );

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
    if (!isActiveRun(latest)) setPendingAssistantId(null);
  }, [conversationId]);

  useEffect(() => {
    let cancelled = false;

    async function loadConversation() {
      scrollToLatestOnLoadRef.current = true;
      focusQuestionIdRef.current = null;
      followGenerationRef.current = false;
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
    if (
      !scrollToLatestOnLoadRef.current ||
      isLoadingMessages ||
      loadedConversationId !== conversationId
    ) {
      return;
    }

    const frame = window.requestAnimationFrame(() => {
      const container = messageScrollRef.current;
      if (!container) return;

      container.scrollTo({
        top: container.scrollHeight,
        behavior: "smooth",
      });
      scrollToLatestOnLoadRef.current = false;
      followGenerationRef.current = hasActiveRun;
    });

    return () => window.cancelAnimationFrame(frame);
  }, [conversationId, hasActiveRun, isLoadingMessages, loadedConversationId, messages]);

  useEffect(() => {
    const questionId = focusQuestionIdRef.current;
    if (!questionId) return;

    const container = messageScrollRef.current;
    const question = document.getElementById(`question-${questionId}`);
    if (!container || !question) return;

    const containerRect = container.getBoundingClientRect();
    const questionRect = question.getBoundingClientRect();
    const targetTop = container.scrollTop + questionRect.top - containerRect.top - container.clientHeight * 0.24;
    container.scrollTo({ top: Math.max(0, targetTop), behavior: "smooth" });
    focusQuestionIdRef.current = null;
    window.requestAnimationFrame(() => {
      followGenerationRef.current = true;
    });
  }, [messages]);

  useEffect(() => {
    const assistantId = generatingAssistantId;
    const container = messageScrollRef.current;
    const composer = composerRef.current;
    if (!hasActiveRun || !followGenerationRef.current || !assistantId || !container || !composer) {
      return;
    }

    const response = document.getElementById(`response-${assistantId}`);
    if (!response) return;

    const containerRect = container.getBoundingClientRect();
    const composerRect = composer.getBoundingClientRect();
    const responseBottom = response.getBoundingClientRect().bottom;
    const readableBottom = Math.min(
      containerRect.bottom - 20,
      composerRect.top - 20
    );

    if (responseBottom > readableBottom) {
      container.scrollBy({ top: responseBottom - readableBottom, behavior: "auto" });
    }
  }, [generatingAssistantId, hasActiveRun, messages]);

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
    focusQuestionIdRef.current = userMessage.id;
    setPendingAssistantId(assistantMessage.id);
    followGenerationRef.current = false;
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
    setPendingAssistantId(null);
    followGenerationRef.current = false;
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

  function scrollToQuestion(messageId: string) {
    document.getElementById(`question-${messageId}`)?.scrollIntoView({
      behavior: "smooth",
      block: "center",
    });
  }

  return (
    <div className="theme-page relative flex h-screen flex-col">
      <div className="absolute right-14 top-5 z-30">
        <TracePanel run={latestRun} isRunning={hasActiveRun} />
      </div>
      <button
        type="button"
        onClick={toggleTheme}
        className="theme-toggle absolute right-5 top-5 z-10"
        aria-label={`Switch to ${theme === "light" ? "dark" : "light"} mode`}
        title={`Switch to ${theme === "light" ? "dark" : "light"} mode`}
      >
        {theme === "light" ? "☾" : "☼"}
      </button>

      <div ref={messageScrollRef} className="theme-message-scroll h-full overflow-y-auto">
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
              <ChatMessageView
                key={message.id}
                message={message}
                anchorId={
                  message.role === "user"
                    ? `question-${message.id}`
                    : message.id === generatingAssistantId
                      ? `response-${message.id}`
                      : undefined
                }
              />
            ))
          )}

          {isThinking && (
            <div className="theme-thinking flex items-center gap-2 text-sm" role="status">
              <span className="theme-thinking-spinner h-4 w-4 rounded-full" aria-hidden="true" />
              <span>Thinking...</span>
            </div>
          )}

          {!hasActiveRun && canRetry && latestRun && (
            <div className="theme-run-retry flex items-center gap-2 text-xs">
              <span className="flex-1">
                {latestRun.status === "cancelled" ? "Generation stopped" : latestRun.error ?? "Generation failed"}
              </span>
              <button type="button" onClick={() => void handleRetry()} className="theme-thinking-stop rounded-md px-1.5 py-0.5">
                Retry
              </button>
            </div>
          )}
        </div>
      </div>

      {questionMessages.length > 0 && (
        <aside
          className="chat-outline hidden lg:block"
          aria-label="Conversation questions"
        >
          <div className="chat-outline-handle" aria-hidden="true">
            <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
              <path d="M8 6h12M8 12h12M8 18h12" />
              <path d="M4 6h.01M4 12h.01M4 18h.01" />
            </svg>
          </div>
          <div className="chat-outline-panel">
            <div className="chat-outline-title">In this chat</div>
            <div className="chat-outline-list">
              {questionMessages.map((message, index) => (
                <button
                  key={message.id}
                  type="button"
                  onClick={() => scrollToQuestion(message.id)}
                  className="chat-outline-item w-full rounded-lg px-2.5 py-2 text-left text-xs"
                  title={message.content}
                >
                  <span className="chat-outline-index">{index + 1}</span>
                  <span className="min-w-0 flex-1 truncate">{message.content}</span>
                </button>
              ))}
            </div>
          </div>
        </aside>
      )}

      <div ref={composerRef} className="theme-composer-overlay pointer-events-none absolute inset-x-0 bottom-0 z-20">
        <div className="pointer-events-auto mx-auto w-full max-w-3xl">
          <ChatInput
            disabled={isLoadingMessages}
            isGenerating={isLoading}
            onSend={handleSend}
            onStop={activeRun ? () => void handleCancel() : undefined}
          />
        </div>
      </div>
    </div>
  );
}
