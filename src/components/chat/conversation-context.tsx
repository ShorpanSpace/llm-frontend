"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useRef,
  useState,
  type ReactNode,
} from "react";

import {
  createConversation,
  createProject,
  deleteConversation,
  deleteProject,
  listConversations,
  listProjects,
  moveConversation,
  renameConversation,
} from "@/lib/api";
import type { Conversation, Project } from "@/types/chat";

interface ConversationContextValue {
  conversations: Conversation[];
  projects: Project[];
  isLoading: boolean;
  error: string | null;
  createNewConversation: (projectId?: number | null) => Promise<Conversation>;
  renameExistingConversation: (
    conversationId: number,
    title: string
  ) => Promise<Conversation>;
  createNewProject: (title: string) => Promise<Project>;
  removeConversation: (conversationId: number) => Promise<void>;
  removeProject: (projectId: number) => Promise<void>;
  moveExistingConversation: (
    conversationId: number,
    projectId: number | null
  ) => Promise<Conversation>;
}

const ConversationContext = createContext<
  ConversationContextValue | undefined
>(undefined);

export function ConversationProvider({ children }: { children: ReactNode }) {
  const [conversations, setConversations] = useState<Conversation[]>([]);
  const [projects, setProjects] = useState<Project[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const creatingConversation = useRef<Promise<Conversation> | null>(null);

  useEffect(() => {
    let cancelled = false;

    async function loadConversations() {
      try {
        const [data, projectData] = await Promise.all([
          listConversations(),
          listProjects(),
        ]);

        if (!cancelled) {
          setConversations(data);
          setProjects(projectData);
          setError(null);
        }
      } catch {
        if (!cancelled) {
          setError("Unable to load conversations.");
        }
      } finally {
        if (!cancelled) {
          setIsLoading(false);
        }
      }
    }

    void loadConversations();

    return () => {
      cancelled = true;
    };
  }, []);

  const createNewConversation = useCallback((projectId?: number | null) => {
    if (creatingConversation.current) {
      return creatingConversation.current;
    }

    const request = createConversation(undefined, projectId);
    creatingConversation.current = request;

    void request.then(
      (conversation) => {
        setConversations((current) => [conversation, ...current]);
      },
      () => undefined
    ).then(() => {
      if (creatingConversation.current === request) {
        creatingConversation.current = null;
      }
    });

    return request;
  }, []);

  const renameExistingConversation = useCallback(
    async (conversationId: number, title: string) => {
      const updated = await renameConversation(conversationId, title);

      setConversations((current) =>
        current.map((conversation) =>
          conversation.id === updated.id ? updated : conversation
        )
      );

      return updated;
    },
    []
  );

  const createNewProject = useCallback(async (title: string) => {
    const project = await createProject(title);
    setProjects((current) => [project, ...current]);
    return project;
  }, []);

  const removeConversation = useCallback(async (conversationId: number) => {
    await deleteConversation(conversationId);
    setConversations((current) =>
      current.filter((conversation) => conversation.id !== conversationId)
    );
  }, []);

  const removeProject = useCallback(async (projectId: number) => {
    await deleteProject(projectId);
    setProjects((current) =>
      current.filter((project) => project.id !== projectId)
    );
    setConversations((current) =>
      current.filter((conversation) => conversation.project_id !== projectId)
    );
  }, []);

  const moveExistingConversation = useCallback(
    async (conversationId: number, projectId: number | null) => {
      const updated = await moveConversation(conversationId, projectId);
      setConversations((current) =>
        current.map((conversation) =>
          conversation.id === updated.id ? updated : conversation
        )
      );
      return updated;
    },
    []
  );

  return (
    <ConversationContext.Provider
      value={{
        conversations,
        projects,
        isLoading,
        error,
        createNewConversation,
        renameExistingConversation,
        createNewProject,
        removeConversation,
        removeProject,
        moveExistingConversation,
      }}
    >
      {children}
    </ConversationContext.Provider>
  );
}

export function useConversations() {
  const context = useContext(ConversationContext);

  if (!context) {
    throw new Error(
      "useConversations must be used inside ConversationProvider"
    );
  }

  return context;
}
