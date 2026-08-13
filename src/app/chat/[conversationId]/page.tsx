import { notFound } from "next/navigation";

import { ChatPage } from "@/components/chat/chat-page";

interface PageProps {
  params: Promise<{
    conversationId: string;
  }>;
}

export default async function ConversationPage({ params }: PageProps) {
  const { conversationId } = await params;
  const id = Number(conversationId);

  if (!Number.isInteger(id) || id <= 0) {
    notFound();
  }

  return <ChatPage conversationId={id} />;
}
