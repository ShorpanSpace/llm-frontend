import type {
  ChatRunStatus,
  ChatRunTimingReport,
  Conversation,
  Message,
  Project,
} from "@/types/chat";

const API_BASE_URL =
  process.env.NEXT_PUBLIC_API_BASE_URL ?? "http://localhost:8000";

type ClientTelemetryEvent =
  | "client_response_headers"
  | "client_first_delta_received"
  | "client_stream_completed";

type StreamTransport = "initial" | "resume";

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const response = await fetch(`${API_BASE_URL}${path}`, {
    headers: {
      "Content-Type": "application/json",
    },
    ...init,
  });

  if (!response.ok) {
    throw new Error(`Request failed with status ${response.status}`);
  }

  if (response.status === 204) {
    return undefined as T;
  }

  return response.json();
}

export function createConversation(
  title?: string,
  projectId?: number | null
): Promise<Conversation> {
  return request("/api/v1/conversations", {
    method: "POST",
    body: JSON.stringify({ title, project_id: projectId ?? null }),
  });
}

export function createProject(
  title: string,
  description?: string
): Promise<Project> {
  return request("/api/v1/projects", {
    method: "POST",
    body: JSON.stringify({ title, description }),
  });
}

export function listProjects(): Promise<Project[]> {
  return request("/api/v1/projects");
}

export function deleteProject(projectId: number): Promise<void> {
  return request(`/api/v1/projects/${projectId}`, {
    method: "DELETE",
  });
}

export function deleteConversation(conversationId: number): Promise<void> {
  return request(`/api/v1/conversations/${conversationId}`, {
    method: "DELETE",
  });
}

export function moveConversation(
  conversationId: number,
  projectId: number | null
): Promise<Conversation> {
  const query = projectId === null ? "" : `?project_id=${projectId}`;
  return request(
    `/api/v1/conversations/${conversationId}/project${query}`,
    { method: "PATCH" }
  );
}

export function listConversations(): Promise<Conversation[]> {
  return request("/api/v1/conversations");
}

export function getConversation(
  conversationId: number
): Promise<Conversation> {
  return request(`/api/v1/conversations/${conversationId}`);
}

export function renameConversation(
  conversationId: number,
  title: string
): Promise<Conversation> {
  return request(`/api/v1/conversations/${conversationId}/rename`, {
    method: "PATCH",
    body: JSON.stringify({ title }),
  });
}

export function getMessages(conversationId: number): Promise<Message[]> {
  return request(`/api/v1/conversations/${conversationId}/messages`);
}

export function getActiveChatRun(
  conversationId: number
): Promise<ChatRunStatus | null> {
  return request(
    `/api/v1/conversations/${conversationId}/chat-runs/active`
  );
}

export function getChatRunStatus(runId: string): Promise<ChatRunStatus> {
  return request(`/api/v1/chat-runs/${runId}`);
}

export function getChatRunTimings(
  runId: string
): Promise<ChatRunTimingReport> {
  return request(`/api/v1/chat-runs/${runId}/timings`);
}

export function getLatestChatRun(
  conversationId: number
): Promise<ChatRunStatus | null> {
  return request(`/api/v1/conversations/${conversationId}/chat-runs/latest`);
}

export function cancelChatRun(runId: string): Promise<ChatRunStatus> {
  return request(`/api/v1/chat-runs/${runId}/cancel`, {
    method: "POST",
  });
}

export function retryChatRun(runId: string): Promise<ChatRunStatus> {
  return request(`/api/v1/chat-runs/${runId}/retry`, {
    method: "POST",
  });
}

export async function sendMessage(
  conversationId: number,
  message: string
): Promise<Message> {
  const response = await fetch(
    `${API_BASE_URL}/api/v1/conversations/${conversationId}/messages`,
    {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ message }),
    }
  );

  if (!response.ok) {
    throw new Error(`Request failed with status ${response.status}`);
  }

  return response.json();
}

export async function streamMessage(
  conversationId: number,
  message: string,
  onDelta: (delta: string) => void,
  onRunId?: (runId: string) => void
): Promise<string | null> {
  const startedAt = performance.now();
  const response = await fetch(
    `${API_BASE_URL}/api/v1/conversations/${conversationId}/messages/stream`,
    {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ message }),
    }
  );

  if (!response.ok) {
    throw new Error(`Request failed with status ${response.status}`);
  }

  const runId = response.headers.get("X-Chat-Run-Id");
  if (runId) {
    onRunId?.(runId);
    reportChatRunTelemetry(
      runId,
      "client_response_headers",
      performance.now() - startedAt,
      "initial"
    );
  }

  await consumeSse(response, onDelta, {
    onFirstDelta: () => {
      if (runId) {
        reportChatRunTelemetry(
          runId,
          "client_first_delta_received",
          performance.now() - startedAt,
          "initial"
        );
      }
    },
  });
  if (runId) {
    reportChatRunTelemetry(
      runId,
      "client_stream_completed",
      performance.now() - startedAt,
      "initial"
    );
  }
  return runId;
}

export async function subscribeChatRun(
  runId: string,
  onDelta: (delta: string) => void,
  lastEventId = "0-0"
): Promise<void> {
  const startedAt = performance.now();
  const params = new URLSearchParams({
    last_event_id: lastEventId,
  });
  const response = await fetch(
    `${API_BASE_URL}/api/v1/chat-runs/${runId}/stream?${params}`,
    {
      headers: {
        Accept: "text/event-stream",
      },
    }
  );

  if (!response.ok) {
    throw new Error(`Request failed with status ${response.status}`);
  }

  reportChatRunTelemetry(
    runId,
    "client_response_headers",
    performance.now() - startedAt,
    "resume"
  );
  await consumeSse(response, onDelta, {
    onFirstDelta: () => {
      reportChatRunTelemetry(
        runId,
        "client_first_delta_received",
        performance.now() - startedAt,
        "resume"
      );
    },
  });
  reportChatRunTelemetry(
    runId,
    "client_stream_completed",
    performance.now() - startedAt,
    "resume"
  );
}

async function consumeSse(
  response: Response,
  onDelta: (delta: string) => void,
  callbacks?: { onFirstDelta?: () => void }
): Promise<void> {
  if (!response.body) {
    throw new Error("The streaming response has no body.");
  }

  const reader = response.body!.getReader();
  const decoder = new TextDecoder();
  let buffer = "";
  let receivedFirstDelta = false;

  while (true) {
    const { done, value } = await reader.read();
    if (done) {
      break;
    }

    buffer += decoder.decode(value, { stream: true });
    const lines = buffer.split("\n");
    buffer = lines.pop() ?? "";

    for (const line of lines) {
      const trimmed = line.trim();
      if (!trimmed.startsWith("data:")) {
        continue;
      }

      const data = trimmed.slice(5).trim();
      if (data === "[DONE]") {
        await reader.cancel();
        return;
      }

      const event = JSON.parse(data) as {
        delta?: string;
        error?: string;
      };

      if (event.error) {
        throw new Error(event.error);
      }

      if (event.delta) {
        if (!receivedFirstDelta) {
          receivedFirstDelta = true;
          callbacks?.onFirstDelta?.();
        }
        onDelta(event.delta);
      }
    }
  }
}

function reportChatRunTelemetry(
  runId: string,
  eventType: ClientTelemetryEvent,
  elapsedMs: number,
  transport: StreamTransport
): void {
  void fetch(`${API_BASE_URL}/api/v1/chat-runs/${runId}/telemetry`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      event_type: eventType,
      elapsed_ms: elapsedMs,
      transport,
    }),
    keepalive: true,
  }).catch(() => {
    // Timing reporting is intentionally best-effort and never affects chat UI.
  });
}
