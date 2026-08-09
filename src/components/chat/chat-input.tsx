"use client";

import { FormEvent, useState } from "react";

interface ChatInputProps {
  disabled?: boolean;
  onSend: (message: string) => Promise<void>;
}

export function ChatInput({
  disabled = false,
  onSend,
}: ChatInputProps) {
  const [value, setValue] = useState("");

  async function handleSubmit(event: FormEvent) {
    event.preventDefault();

    const message = value.trim();

    if (!message || disabled) {
      return;
    }

    setValue("");

    await onSend(message);
  }

  return (
    <form
      onSubmit={handleSubmit}
      className="mx-auto w-full max-w-3xl px-4 pb-5"
    >
      <div className="rounded-3xl border border-neutral-200 bg-white p-3 shadow-sm">
        <textarea
          value={value}
          onChange={(event) => setValue(event.target.value)}
          placeholder="Message Agent Workspace"
          rows={2}
          className="max-h-40 w-full resize-none bg-transparent px-2 py-1 text-sm outline-none"
        />

        <div className="flex justify-end">
          <button
            disabled={disabled}
            type="submit"
            className="rounded-full bg-black px-4 py-2 text-sm text-white disabled:opacity-40"
          >
            Send
          </button>
        </div>
      </div>
    </form>
  );
}