"use client";

import { useEffect, useMemo, useState } from "react";

import { getChatRunTimings } from "@/lib/api";
import type { ChatRunStatus, ChatRunTimingReport } from "@/types/chat";

interface TracePanelProps {
  run: ChatRunStatus | null;
  isRunning: boolean;
}

const EVENT_LABELS: Record<string, string> = {
  api_run_created: "Run created",
  queue_enqueued: "Queued in Redis",
  api_stream_response_ready: "SSE response ready",
  worker_dequeued: "Worker dequeued",
  worker_processing_started: "Worker started",
  context_built: "Context built",
  model_request_started: "Model request started",
  model_first_token_received: "First model token",
  stream_first_delta_published: "First delta published",
  sse_first_delta_emitted: "First SSE delta emitted",
  worker_completed: "Worker completed",
  worker_failed: "Worker failed",
  run_cancelled: "Run cancelled",
  client_response_headers: "Browser received headers",
  client_first_delta_received: "Browser received first delta",
  client_stream_completed: "Browser stream completed",
};

const SUMMARY_METRICS = [
  ["API", "api_stream_response_ready_duration_ms"],
  ["Queue", "queue_wait_ms"],
  ["First token", "model_time_to_first_token_ms"],
  ["Redis → SSE", "redis_to_sse_ms"],
  ["Worker", "worker_total_ms"],
] as const;

function formatDuration(value: number | undefined): string {
  if (value === undefined) return "—";
  if (value < 1_000) return `${Math.round(value)} ms`;
  return `${(value / 1_000).toFixed(value >= 10_000 ? 1 : 2)} s`;
}

function eventDuration(attributes: Record<string, unknown> | null): number | undefined {
  if (!attributes) return undefined;
  for (const key of ["elapsed_ms", "duration_ms", "worker_duration_ms"]) {
    const value = attributes[key];
    if (typeof value === "number") return value;
  }
  return undefined;
}

export function TracePanel({ run, isRunning }: TracePanelProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [report, setReport] = useState<ChatRunTimingReport | null>(null);
  const [hasError, setHasError] = useState(false);

  useEffect(() => {
    if (!isOpen || !run) return;

    let cancelled = false;
    const load = async () => {
      try {
        const next = await getChatRunTimings(run.run_id);
        if (!cancelled) {
          setReport(next);
          setHasError(false);
        }
      } catch {
        if (!cancelled) setHasError(true);
      }
    };

    void load();
    if (!isRunning) return () => {
      cancelled = true;
    };

    const interval = window.setInterval(() => void load(), 1_000);
    return () => {
      cancelled = true;
      window.clearInterval(interval);
    };
  }, [isOpen, isRunning, run?.run_id]);

  const summary = useMemo(
    () => SUMMARY_METRICS.map(([label, key]) => ({ label, value: report?.durations_ms[key] })),
    [report]
  );

  return (
    <div className="trace-panel-control">
      <button
        type="button"
        className="trace-toggle"
        onClick={() => setIsOpen((current) => !current)}
        aria-expanded={isOpen}
        aria-controls="chat-run-trace-panel"
        title="Toggle chat trace"
      >
        <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
          <path d="M4 17V7m5 10V4m5 13v-7m5 7V6" />
          <path d="M2.5 17.5h19" />
        </svg>
        <span className="sr-only">Toggle chat trace</span>
      </button>

      <aside id="chat-run-trace-panel" className="trace-panel" data-open={isOpen} aria-hidden={!isOpen}>
        <div className="trace-panel-header">
          <div>
            <div className="trace-eyebrow">Execution trace</div>
            <div className="trace-run-id" title={run?.run_id}>
              {run ? `Run · ${run.run_id.slice(0, 8)}` : "No chat run yet"}
            </div>
          </div>
          <div className="flex items-center gap-2">
            {run && <span className="trace-status">{run.status}</span>}
            <button type="button" className="trace-close" onClick={() => setIsOpen(false)} aria-label="Close chat trace">×</button>
          </div>
        </div>

        {!run ? (
          <div className="trace-empty">Send a message to inspect its timing trace.</div>
        ) : hasError ? (
          <div className="trace-empty">Trace data is not available yet.</div>
        ) : (
          <>
            <section className="trace-summary" aria-label="Timing summary">
              {summary.map((metric) => (
                <div key={metric.label} className="trace-metric">
                  <span>{metric.label}</span>
                  <strong>{formatDuration(metric.value)}</strong>
                </div>
              ))}
            </section>

            <section className="trace-timeline" aria-label="Trace timeline">
              <div className="trace-section-title">Milestones</div>
              {report?.events.length ? report.events.map((event) => (
                <div key={event.event_type} className="trace-event">
                  <span className="trace-event-dot" aria-hidden="true" />
                  <div className="min-w-0 flex-1">
                    <div className="trace-event-name">{EVENT_LABELS[event.event_type] ?? event.event_type}</div>
                    <time className="trace-event-time">
                      {new Date(event.occurred_at).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit", second: "2-digit" })}
                    </time>
                  </div>
                  <span className="trace-event-duration">{formatDuration(eventDuration(event.attributes))}</span>
                </div>
              )) : <div className="trace-empty">Collecting milestones…</div>}
            </section>
          </>
        )}
      </aside>
    </div>
  );
}
