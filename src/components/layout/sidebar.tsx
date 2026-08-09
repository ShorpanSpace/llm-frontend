export function Sidebar() {
  return (
    <aside className="flex w-64 flex-col border-r border-neutral-200 bg-neutral-50">
      <div className="p-3">
        <button className="w-full rounded-lg border border-neutral-200 bg-white px-3 py-2 text-left text-sm hover:bg-neutral-100">
          + New chat
        </button>
      </div>

      <div className="flex-1 overflow-y-auto px-3">
        <p className="mb-2 text-xs text-neutral-500">
          Conversations
        </p>

        <div className="space-y-1">
          <button className="w-full rounded-lg px-3 py-2 text-left text-sm hover:bg-neutral-200">
            First conversation
          </button>
        </div>
      </div>

      <div className="border-t border-neutral-200 p-3">
        <div className="text-sm">Agent Workspace</div>
      </div>
    </aside>
  );
}