"use client";

import { useState } from "react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";

import type { ChatMessage as ChatMessageType } from "@/types/chat";

interface ChatMessageProps {
  message: ChatMessageType;
  anchorId?: string;
}

export function ChatMessage({ message, anchorId }: ChatMessageProps) {
  const isUser = message.role === "user";
  const [copied, setCopied] = useState(false);

  async function copyMessage() {
    try {
      await navigator.clipboard.writeText(message.content);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1600);
    } catch {
      setCopied(false);
    }
  }

  return (
    <div
      id={anchorId}
      className={`group/message flex ${
        isUser ? "justify-end" : "justify-start"
      }`}
    >
      <div className="max-w-[75%]">
        <div
          className={
            isUser
              ? "theme-user-bubble rounded-2xl px-4 py-3 text-sm"
              : "theme-assistant-bubble markdown-body px-1 py-3 text-sm"
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
        {message.content && (
          <div
            className={`theme-message-actions mt-1 flex h-6 items-center gap-1 opacity-0 transition-opacity duration-150 group-hover/message:opacity-100 focus-within:opacity-100 ${
              isUser ? "justify-end" : "justify-start"
            }`}
          >
            <button
              type="button"
              onClick={() => void copyMessage()}
              className="theme-message-action flex h-6 items-center gap-1 rounded-md px-1.5 text-[11px]"
              aria-label={copied ? "Copied" : "Copy message"}
              title={copied ? "Copied" : "Copy message"}
            >
              {copied ? (
                <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                  <path d="m5 12 4 4L19 6" />
                </svg>
              ) : (
                <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                  <rect x="9" y="9" width="11" height="11" rx="2" />
                  <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1" />
                </svg>
              )}
              {copied && <span>Copied</span>}
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
