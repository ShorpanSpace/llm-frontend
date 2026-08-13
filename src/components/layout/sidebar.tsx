"use client";

import {
  useEffect,
  useRef,
  useState,
  type DragEvent,
  type MouseEvent as ReactMouseEvent,
} from "react";
import { usePathname, useRouter } from "next/navigation";

import { useConversations } from "../chat/conversation-context";

type MenuTarget = `conversation:${number}` | `project:${number}` | null;

type IconName =
  | "dots"
  | "edit"
  | "folder"
  | "plus"
  | "search"
  | "sidebar"
  | "trash";

function Icon({ name, size = 17 }: { name: IconName; size?: number }) {
  const props = {
    width: size,
    height: size,
    viewBox: "0 0 24 24",
    fill: "none",
    stroke: "currentColor",
    strokeWidth: 1.8,
    strokeLinecap: "round" as const,
    strokeLinejoin: "round" as const,
    "aria-hidden": true,
  };

  switch (name) {
    case "folder":
      return <svg {...props}><path d="M3.5 6.5h6l2 2h9v9a2 2 0 0 1-2 2h-13a2 2 0 0 1-2-2v-9a2 2 0 0 1 2-2Z" /><path d="M3.5 8.5h17" /></svg>;
    case "plus":
      return <svg {...props}><path d="M12 5v14M5 12h14" /></svg>;
    case "sidebar":
      return <svg {...props}><rect x="3" y="4" width="18" height="16" rx="2" /><path d="M9 4v16M15 10l-2 2 2 2" /></svg>;
    case "trash":
      return <svg {...props}><path d="M4 7h16M10 11v5M14 11v5M6 7l1 13h10l1-13M9 7V4h6v3" /></svg>;
    case "edit":
      return <svg {...props}><path d="m5 16-.8 3.8L8 19l10.5-10.5a2.1 2.1 0 0 0-3-3L5 16Z" /></svg>;
    case "search":
      return <svg {...props}><circle cx="10.8" cy="10.8" r="6.3" /><path d="m16 16 4.5 4.5" /></svg>;
    case "dots":
      return <svg {...props}><circle cx="5" cy="12" r="1" fill="currentColor" stroke="none" /><circle cx="12" cy="12" r="1" fill="currentColor" stroke="none" /><circle cx="19" cy="12" r="1" fill="currentColor" stroke="none" /></svg>;
  }
}

export function Sidebar() {
  const [isCollapsed, setIsCollapsed] = useState(false);
  const [width, setWidth] = useState(272);
  const [isResizing, setIsResizing] = useState(false);
  const [expandedProjects, setExpandedProjects] = useState<Set<number>>(
    new Set()
  );
  const [menu, setMenu] = useState<MenuTarget>(null);
  const [searchQuery, setSearchQuery] = useState("");
  const [editingId, setEditingId] = useState<number | null>(null);
  const [editingTitle, setEditingTitle] = useState("");
  const pathname = usePathname();
  const router = useRouter();
  const resizeStart = useRef({ x: 0, width: 272 });
  const {
    conversations,
    projects,
    isLoading,
    error,
    createNewConversation,
    renameExistingConversation,
    removeConversation,
    removeProject,
    moveExistingConversation,
  } = useConversations();

  const activeConversationId = pathname.match(/^\/chat\/(\d+)$/)?.[1];
  const normalizedQuery = searchQuery.trim().toLowerCase();
  const filteredConversations = normalizedQuery
    ? conversations.filter((conversation) =>
        conversation.title.toLowerCase().includes(normalizedQuery)
      )
    : conversations;

  useEffect(() => {
    if (!isResizing) return;

    function handleMove(event: MouseEvent) {
      const next = resizeStart.current.width + event.clientX - resizeStart.current.x;
      setWidth(Math.min(420, Math.max(220, next)));
    }

    function handleStop() {
      setIsResizing(false);
      document.body.style.cursor = "";
      document.body.style.userSelect = "";
    }

    window.addEventListener("mousemove", handleMove);
    window.addEventListener("mouseup", handleStop);
    return () => {
      window.removeEventListener("mousemove", handleMove);
      window.removeEventListener("mouseup", handleStop);
    };
  }, [isResizing]);

  function startResize(event: ReactMouseEvent) {
    resizeStart.current = { x: event.clientX, width };
    setIsResizing(true);
    document.body.style.cursor = "col-resize";
    document.body.style.userSelect = "none";
  }

  async function createConversation(projectId?: number) {
    const conversation = await createNewConversation(projectId);
    router.push(`/chat/${conversation.id}`);
  }

  function toggleProject(projectId: number) {
    setExpandedProjects((current) => {
      const next = new Set(current);
      if (next.has(projectId)) next.delete(projectId);
      else next.add(projectId);
      return next;
    });
  }

  async function deleteConversation(conversationId: number) {
    if (!window.confirm("Delete this conversation?")) return;
    await removeConversation(conversationId);
    setMenu(null);
    if (String(conversationId) === activeConversationId) router.push("/chat");
  }

  async function deleteProject(projectId: number) {
    if (!window.confirm("Delete this project and all of its conversations?")) return;
    await removeProject(projectId);
    setMenu(null);
  }

  function dropConversation(event: DragEvent, projectId: number | null) {
    event.preventDefault();
    const conversationId = Number(
      event.dataTransfer.getData("conversation-id")
    );
    if (conversationId) void moveExistingConversation(conversationId, projectId);
  }

  async function renameConversation(conversationId: number) {
    const title = editingTitle.trim();
    if (!title) return;
    await renameExistingConversation(conversationId, title);
    setEditingId(null);
    setEditingTitle("");
  }

  function conversationRow(item: (typeof conversations)[number]) {
    const target: MenuTarget = `conversation:${item.id}`;
    const isActive = String(item.id) === activeConversationId;

    return (
      <div
        key={item.id}
        draggable
        data-active={isActive}
        onDragStart={(event) =>
          event.dataTransfer.setData("conversation-id", String(item.id))
        }
        className="conversation-row group relative flex min-w-0 items-center rounded-xl text-sm"
      >
        {editingId === item.id ? (
          <form
            className="min-w-0 flex-1 px-2 py-1"
            onSubmit={(event) => {
              event.preventDefault();
              void renameConversation(item.id);
            }}
          >
            <input
              autoFocus
              value={editingTitle}
              onChange={(event) => setEditingTitle(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === "Escape") setEditingId(null);
              }}
              className="w-full rounded-lg border px-2 py-1 text-sm outline-none"
            />
          </form>
        ) : (
          <>
            <button
              type="button"
              onClick={() => router.push(`/chat/${item.id}`)}
              className="min-w-0 flex-1 truncate px-3 py-2.5 text-left"
            >
              {item.title}
            </button>
            <button
              type="button"
              onClick={() => setMenu(menu === target ? null : target)}
              className="sidebar-icon-button mr-1 rounded-lg p-1.5 opacity-0 focus:opacity-100 group-hover:opacity-100"
              aria-label={`Actions for ${item.title}`}
            >
              <Icon name="dots" size={16} />
            </button>
            {menu === target && (
              <div className="sidebar-popover absolute right-1 top-10 z-30 min-w-40 rounded-xl border p-1.5 text-xs">
                <button
                  className="sidebar-menu-item flex w-full items-center gap-2 rounded-lg px-2.5 py-2 text-left"
                  onClick={() => {
                    setEditingId(item.id);
                    setEditingTitle(item.title);
                    setMenu(null);
                  }}
                >
                  <Icon name="edit" size={14} /> Rename
                </button>
                <label className="sidebar-menu-item relative flex cursor-pointer items-center gap-2 rounded-lg px-2.5 py-2">
                  <Icon name="folder" size={14} /> Move to…
                  <select
                    aria-label="Move conversation to project"
                    value={item.project_id ?? ""}
                    onChange={(event) => {
                      void moveExistingConversation(
                        item.id,
                        event.target.value ? Number(event.target.value) : null
                      );
                      setMenu(null);
                    }}
                    className="absolute inset-0 cursor-pointer opacity-0"
                  >
                    <option value="">Chats</option>
                    {projects.map((project) => (
                      <option key={project.id} value={project.id}>
                        {project.title}
                      </option>
                    ))}
                  </select>
                </label>
                <button
                  data-danger="true"
                  className="sidebar-menu-item flex w-full items-center gap-2 rounded-lg px-2.5 py-2 text-left"
                  onClick={() => void deleteConversation(item.id)}
                >
                  <Icon name="trash" size={14} /> Delete
                </button>
              </div>
            )}
          </>
        )}
      </div>
    );
  }

  if (isCollapsed) {
    return (
      <aside className="app-sidebar flex w-[68px] shrink-0 flex-col items-center border-r py-4">
        <button
          type="button"
          onClick={() => setIsCollapsed(false)}
          className="sidebar-icon-button rounded-xl p-2"
          aria-label="Expand sidebar"
        >
          <Icon name="sidebar" />
        </button>
        <div className="mt-4 font-serif text-xl font-semibold tracking-[-.08em]">
          XP
        </div>
        <div className="profile-avatar mt-auto flex h-9 w-9 items-center justify-center rounded-full text-xs font-semibold">
          JD
        </div>
      </aside>
    );
  }

  return (
    <aside
      style={{ width }}
      className="app-sidebar relative flex h-full shrink-0 flex-col border-r transition-[width] duration-300 ease-out"
    >
      <div className="sidebar-header flex h-[72px] items-center justify-between border-b px-5">
        <div className="flex items-center gap-2.5">
          <div className="brand-mark flex h-8 w-8 items-center justify-center rounded-[10px] font-serif text-sm font-bold tracking-[-.12em]">
            XP
          </div>
          <span className="font-serif text-[22px] font-semibold tracking-[-.06em]">
            XPChat
          </span>
        </div>
        <button
          type="button"
          onClick={() => setIsCollapsed(true)}
          className="sidebar-icon-button rounded-lg p-2"
          aria-label="Collapse sidebar"
        >
          <Icon name="sidebar" size={18} />
        </button>
      </div>

      <div className="px-4 py-5">
        <label className="sidebar-search flex items-center gap-2.5 rounded-xl px-3.5 py-3 text-sm">
          <Icon name="search" size={17} />
          <input
            value={searchQuery}
            onChange={(event) => setSearchQuery(event.target.value)}
            placeholder="Search chats"
            aria-label="Search chats"
            className="min-w-0 flex-1 bg-transparent text-sm outline-none"
          />
          {searchQuery && (
            <button
              type="button"
              onClick={() => setSearchQuery("")}
              className="sidebar-icon-button rounded-md px-1"
              aria-label="Clear chat search"
            >
              ×
            </button>
          )}
        </label>
      </div>

      <div
        className="min-h-0 flex-1 overflow-y-auto px-3 pb-4"
        onDragOver={(event) => event.preventDefault()}
      >
        <div className="sidebar-section-label mb-2 px-2 text-[10px] font-semibold uppercase tracking-[.19em]">
          Projects
        </div>
        {isLoading && <div className="theme-muted px-2 py-3 text-sm">Loading workspace…</div>}
        {error && <div className="px-2 py-3 text-sm text-red-600">{error}</div>}

        <div className="space-y-1.5">
          {projects.map((project) => {
            const target: MenuTarget = `project:${project.id}`;
            const isOpen = expandedProjects.has(project.id);
            const projectConversations = filteredConversations.filter(
              (conversation) => conversation.project_id === project.id
            );

            if (normalizedQuery && projectConversations.length === 0) return null;

            return (
              <section
                key={project.id}
                onDrop={(event) => dropConversation(event, project.id)}
                className="sidebar-project group/project rounded-2xl p-1"
              >
                <div className="project-bar relative flex items-center rounded-xl px-2 py-2">
                  <button
                    type="button"
                    onClick={() => toggleProject(project.id)}
                    className="flex min-w-0 flex-1 items-center gap-2 text-left"
                  >
                    <span className="project-folder"><Icon name="folder" size={17} /></span>
                    <span className="truncate text-sm font-semibold">{project.title}</span>
                  </button>
                  <div className="flex items-center gap-0.5 opacity-0 transition-opacity group-hover/project:opacity-100 focus-within:opacity-100">
                    <button
                      type="button"
                      onClick={() => void createConversation(project.id)}
                      className="sidebar-icon-button rounded-lg p-1.5"
                      aria-label={`New conversation in ${project.title}`}
                    >
                      <Icon name="plus" size={15} />
                    </button>
                    <button
                      type="button"
                      onClick={() => setMenu(menu === target ? null : target)}
                      className="sidebar-icon-button rounded-lg p-1.5"
                      aria-label={`Project settings for ${project.title}`}
                    >
                      <Icon name="dots" size={16} />
                    </button>
                  </div>
                  {menu === target && (
                    <div className="sidebar-popover absolute right-0 top-10 z-30 min-w-40 rounded-xl border p-1.5 text-xs">
                      <button
                        className="sidebar-menu-item flex w-full items-center gap-2 rounded-lg px-2.5 py-2 text-left"
                        onClick={() => void createConversation(project.id)}
                      >
                        <Icon name="plus" size={14} /> New conversation
                      </button>
                      <button
                        data-danger="true"
                        className="sidebar-menu-item flex w-full items-center gap-2 rounded-lg px-2.5 py-2 text-left"
                        onClick={() => void deleteProject(project.id)}
                      >
                        <Icon name="trash" size={14} /> Delete project
                      </button>
                    </div>
                  )}
                </div>

                {isOpen && (
                  <div className="project-tree ml-5 mt-1 space-y-0.5 border-l pl-2 animate-[fade-in_.2s_ease-out]">
                    {projectConversations.map(conversationRow)}
                    {projectConversations.length === 0 && (
                      <button
                        type="button"
                        onClick={() => void createConversation(project.id)}
                        className="sidebar-empty w-full rounded-lg px-3 py-2 text-left text-xs"
                      >
                        No conversations yet · add one
                      </button>
                    )}
                  </div>
                )}
              </section>
            );
          })}

          <div
            onDrop={(event) => dropConversation(event, null)}
            className="sidebar-project group/chats mt-4 rounded-xl p-1"
          >
            <div className="project-bar flex items-center rounded-xl px-2 py-1.5">
              <span className="sidebar-section-label px-2 text-[10px] font-semibold uppercase tracking-[.16em]">
                Chats
              </span>
              <button
                type="button"
                onClick={() => void createConversation()}
                className="sidebar-icon-button ml-auto rounded-lg p-1.5 opacity-0 focus:opacity-100 group-hover/chats:opacity-100"
                aria-label="New conversation"
              >
                <Icon name="plus" size={15} />
              </button>
            </div>
            {filteredConversations
              .filter((conversation) => conversation.project_id === null)
              .map(conversationRow)}
            {normalizedQuery &&
              filteredConversations.filter(
                (conversation) => conversation.project_id === null
              ).length === 0 && (
                <div className="theme-muted px-2 py-3 text-xs">No chats found</div>
              )}
          </div>
        </div>
      </div>

      <div className="sidebar-footer border-t px-4 py-4">
        <button type="button" className="profile-button flex w-full items-center gap-3 rounded-2xl p-2 text-left">
          <div className="profile-avatar flex h-9 w-9 shrink-0 items-center justify-center rounded-full text-[11px] font-semibold">
            JD
          </div>
          <div className="min-w-0 flex-1">
            <div className="truncate text-sm font-semibold">Jason Doe</div>
            <div className="theme-muted mt-0.5 text-[11px]">Free plan</div>
          </div>
          <Icon name="dots" size={16} />
        </button>
      </div>

      <div
        onMouseDown={startResize}
        data-active={isResizing}
        className="resize-handle absolute -right-1 top-0 h-full w-2 cursor-col-resize transition"
        aria-hidden="true"
      />
    </aside>
  );
}
