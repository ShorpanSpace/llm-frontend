"use client";

import type { ReactNode } from "react";

import { ConversationProvider } from "../chat/conversation-context";
import { Sidebar } from "./sidebar";
import { ThemeProvider } from "./theme-context";

interface AppShellProps {
  children: ReactNode;
}

export function AppShell({ children }: AppShellProps) {
  return (
    <ThemeProvider>
      <ConversationProvider>
        <div className="app-shell flex h-screen">
          <Sidebar />

          <main className="min-w-0 flex-1">{children}</main>
        </div>
      </ConversationProvider>
    </ThemeProvider>
  );
}
