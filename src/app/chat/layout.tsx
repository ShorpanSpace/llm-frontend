import type { ReactNode } from "react";

import { AppShell } from "@/components/layout/app-shell";

export default function ChatLayout({
  children,
}: {
  children: ReactNode;
}) {
  return <AppShell>{children}</AppShell>;
}
