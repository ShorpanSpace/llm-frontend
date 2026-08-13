"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";

import { useConversations } from "./conversation-context";

export function ChatEntryPage() {
  const router = useRouter();
  const {
    conversations,
    isLoading,
    error,
    createNewConversation,
  } = useConversations();

  useEffect(() => {
    if (isLoading || error) {
      return;
    }

    if (conversations.length > 0) {
      router.replace(`/chat/${conversations[0].id}`);
      return;
    }

    void createNewConversation()
      .then((conversation) => {
        router.replace(`/chat/${conversation.id}`);
      })
      .catch(() => undefined);
  }, [
    conversations,
    createNewConversation,
    error,
    isLoading,
    router,
  ]);

  return (
    <div className="flex h-full items-center justify-center text-sm text-neutral-400">
      {error ?? "Opening conversation..."}
    </div>
  );
}
