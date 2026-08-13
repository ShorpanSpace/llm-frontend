"use client";

import {
  FormEvent,
  KeyboardEvent,
  useLayoutEffect,
  useRef,
  useState,
} from "react";

interface ChatInputProps {
  disabled?: boolean;
  onSend: (message: string) => Promise<void>;
}

export function ChatInput({
  disabled = false,
  onSend,
}: ChatInputProps) {
  const [value, setValue] = useState("");
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  useLayoutEffect(() => {
    const textarea = textareaRef.current;
    if (!textarea) return;

    const maximumHeight = 128;
    textarea.style.height = "auto";
    textarea.style.height = `${Math.min(textarea.scrollHeight, maximumHeight)}px`;
    textarea.style.overflowY =
      textarea.scrollHeight > maximumHeight ? "auto" : "hidden";
  }, [value]);

  async function handleSubmit(event: FormEvent) {
    event.preventDefault();

    const message = value.trim();

    if (!message || disabled) {
      return;
    }

    setValue("");

    await onSend(message);
  }

  function handleKeyDown(event: KeyboardEvent<HTMLTextAreaElement>) {
    if (event.key === "Enter" && !event.shiftKey) {
      event.preventDefault();
      event.currentTarget.form?.requestSubmit();
    }
  }

  return (
    <form onSubmit={handleSubmit} className="theme-composer w-full px-4 pb-8">
      <div className="theme-composer-box flex items-end gap-2 rounded-3xl border p-2 shadow-sm">
        <textarea
          ref={textareaRef}
          value={value}
          onChange={(event) => setValue(event.target.value)}
          onKeyDown={handleKeyDown}
          placeholder="Message Agent Workspace"
          rows={1}
          className="theme-textarea box-border min-w-0 flex-1 resize-none bg-transparent px-2 py-1 text-sm outline-none"
        />

        <button
          disabled={disabled || !value.trim()}
          type="submit"
          className="theme-send flex h-8 w-8 shrink-0 items-center justify-center rounded-full disabled:opacity-30"
          aria-label="Send message"
          title="Send message"
        >
          <svg
            width="16"
            height="16"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
            aria-hidden="true"
          >
            <path d="M12 19V5" />
            <path d="m6 11 6-6 6 6" />
          </svg>
        </button>
      </div>
    </form>
  );
}
