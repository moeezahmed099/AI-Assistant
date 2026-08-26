"use client";

import React, { useEffect, useRef, useState } from "react";
import { TraceEvent } from "@/lib/api";

interface TraceFeedProps {
  events: TraceEvent[];
  connectionStatus: "connected" | "connecting" | "reconnecting" | "disconnected" | "closed";
  onViewReportClick?: () => void;
}

export function TraceFeed({
  events,
  connectionStatus,
  onViewReportClick,
}: TraceFeedProps) {
  const bottomRef = useRef<HTMLDivElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const [autoScroll, setAutoScroll] = useState(true);
  const [isAtBottom, setIsAtBottom] = useState(true);
  const [expandedItems, setExpandedItems] = useState<Record<string, boolean>>({});

  const toggleExpand = (id: string) => {
    setExpandedItems((prev) => ({ ...prev, [id]: !prev[id] }));
  };

  // Auto-scroll when new events arrive if autoScroll is enabled
  useEffect(() => {
    if (autoScroll && bottomRef.current) {
      bottomRef.current.scrollIntoView({ behavior: "smooth" });
    }
  }, [events, autoScroll]);

  // Track user scroll position
  const handleScroll = () => {
    if (!containerRef.current) return;
    const { scrollTop, scrollHeight, clientHeight } = containerRef.current;
    const atBottom = scrollHeight - scrollTop - clientHeight < 60;
    setIsAtBottom(atBottom);
    if (atBottom) {
      setAutoScroll(true);
    }
  };

  const scrollToBottom = () => {
    setAutoScroll(true);
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  };

  const formatTimestamp = (isoString?: string) => {
    if (!isoString) return "";
    try {
      const date = new Date(isoString);
      return date.toLocaleTimeString([], {
        hour: "2-digit",
        minute: "2-digit",
        second: "2-digit",
      });
    } catch {
      return isoString;
    }
  };

  return (
    <div className="flex flex-col h-full rounded-xl bg-zinc-900/80 border border-zinc-800 shadow-xl overflow-hidden">
      {/* Header bar */}
      <div className="flex items-center justify-between px-4 py-3 border-b border-zinc-800 bg-zinc-950/60 shrink-0">
        <div className="flex items-center gap-2.5 min-w-0">
          <div className="flex items-center gap-1.5">
            <span
              className={`w-2.5 h-2.5 rounded-full ${
                connectionStatus === "connected"
                  ? "bg-emerald-400 shadow-[0_0_8px_rgba(52,211,153,0.8)] animate-pulse"
                  : connectionStatus === "connecting" || connectionStatus === "reconnecting"
                  ? "bg-amber-400 animate-ping"
                  : "bg-zinc-500"
              }`}
            />
            <h3 className="text-sm font-semibold text-zinc-200 tracking-wide truncate">
              Live Agent Execution Trace
            </h3>
          </div>
          <span className="text-[11px] font-mono px-2 py-0.5 rounded-md bg-zinc-800/80 text-zinc-400 border border-zinc-700/50 shrink-0">
            {events.length} event{events.length !== 1 ? "s" : ""}
          </span>
        </div>

        <div className="flex items-center gap-2 shrink-0">
          <button
            onClick={() => setAutoScroll(!autoScroll)}
            className={`text-[11px] px-2.5 py-1 rounded-md border font-medium transition-colors ${
              autoScroll
                ? "bg-indigo-950/60 text-indigo-300 border-indigo-700/60"
                : "bg-zinc-800/80 text-zinc-400 border-zinc-700/50 hover:text-zinc-200"
            }`}
            title="Toggle automatic scrolling on incoming events"
          >
            {autoScroll ? "Auto-scroll ON" : "Auto-scroll OFF"}
          </button>
        </div>
      </div>

      {/* Feed Container */}
      <div
        ref={containerRef}
        onScroll={handleScroll}
        className="flex-1 overflow-y-auto p-3 sm:p-4 space-y-3.5 max-h-[600px] min-h-[350px] relative scroll-smooth focus:outline-none"
      >
        {events.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-16 text-center space-y-3 text-zinc-500">
            <div className="h-9 w-9 rounded-full bg-zinc-800/60 flex items-center justify-center animate-pulse">
              <svg className="h-5 w-5 text-zinc-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 10V3L4 14h7v7l9-11h-7z" />
              </svg>
            </div>
            <p className="text-xs sm:text-sm">Connecting to stream & awaiting agent events...</p>
          </div>
        ) : (
          events.map((evt) => (
            <TraceEventItem
              key={evt.id}
              event={evt}
              formatTimestamp={formatTimestamp}
              isExpanded={!!expandedItems[evt.id]}
              onToggleExpand={() => toggleExpand(evt.id)}
              onViewReportClick={onViewReportClick}
            />
          ))
        )}
        <div ref={bottomRef} className="h-1" />
      </div>

      {/* Floating Jump to Latest Button */}
      {!isAtBottom && events.length > 3 && (
        <div className="absolute bottom-4 right-6 z-10 pointer-events-auto">
          <button
            onClick={scrollToBottom}
            className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold rounded-full bg-indigo-600 text-white shadow-lg hover:bg-indigo-500 transition-all border border-indigo-400/40"
          >
            <span>Jump to Latest</span>
            <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 14l-7 7m0 0l-7-7m7 7V3" />
            </svg>
          </button>
        </div>
      )}
    </div>
  );
}

interface TraceEventItemProps {
  event: TraceEvent;
  formatTimestamp: (iso?: string) => string;
  isExpanded: boolean;
  onToggleExpand: () => void;
  onViewReportClick?: () => void;
}

function TraceEventItem({
  event,
  formatTimestamp,
  isExpanded,
  onToggleExpand,
  onViewReportClick,
}: TraceEventItemProps) {
  const { type, timestamp, payload } = event;

  switch (type) {
    case "plan_created":
      return (
        <div className="rounded-lg bg-zinc-950/80 border border-zinc-800 p-3.5 sm:p-4 space-y-2.5 shadow-md">
          <div className="flex items-center justify-between gap-2 border-b border-zinc-800/80 pb-2">
            <div className="flex items-center gap-2">
              <span className="flex h-5 w-5 rounded bg-indigo-900/60 border border-indigo-700/60 text-indigo-300 text-xs items-center justify-center font-bold">
                📋
              </span>
              <span className="text-xs font-semibold uppercase tracking-wider text-indigo-300">
                Research Plan Formulated
              </span>
            </div>
            <span className="text-[11px] font-mono text-zinc-500">{formatTimestamp(timestamp)}</span>
          </div>
          <p className="text-xs text-zinc-300">
            Agent synthesized a structured plan with <strong className="text-zinc-100">{payload.total_steps || payload.steps?.length || 0} steps</strong>:
          </p>
          <div className="space-y-1.5 pl-1">
            {(payload.steps || []).map((s: any, idx: number) => (
              <div key={s.id || idx} className="flex items-start gap-2 text-xs text-zinc-300">
                <span className="font-mono text-indigo-400 font-semibold shrink-0">{idx + 1}.</span>
                <span className="break-words flex-1">
                  {s.description}
                  {s.intended_tool && s.intended_tool !== "none" && (
                    <span className="ml-1.5 px-1.5 py-0.5 rounded bg-zinc-800 text-zinc-400 font-mono text-[10px] border border-zinc-700/60">
                      tool: {s.intended_tool}
                    </span>
                  )}
                </span>
              </div>
            ))}
          </div>
        </div>
      );

    case "step_started":
      return (
        <div className="rounded-lg bg-blue-950/20 border border-blue-900/40 p-3 sm:p-3.5 space-y-1.5 shadow-sm">
          <div className="flex items-center justify-between gap-2">
            <div className="flex items-center gap-2 min-w-0">
              <span className="relative flex h-2.5 w-2.5 shrink-0">
                <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-blue-400 opacity-75"></span>
                <span className="relative inline-flex rounded-full h-2.5 w-2.5 bg-blue-500"></span>
              </span>
              <span className="text-xs font-semibold text-blue-300 uppercase tracking-wider truncate">
                Step Started
              </span>
            </div>
            <span className="text-[11px] font-mono text-zinc-500 shrink-0">{formatTimestamp(timestamp)}</span>
          </div>
          <p className="text-xs sm:text-sm text-zinc-200 font-medium break-words">
            {payload.description}
          </p>
          {payload.intended_tool && (
            <div className="flex items-center gap-1.5 pt-0.5">
              <span className="text-[11px] text-zinc-400">Intended Tool:</span>
              <span className="text-[11px] font-mono text-blue-300 px-2 py-0.5 rounded bg-blue-900/40 border border-blue-800/40">
                {payload.intended_tool}
              </span>
            </div>
          )}
        </div>
      );

    case "tool_call_started":
      return (
        <div className="rounded-lg bg-zinc-950/60 border border-zinc-800/80 p-3 space-y-2">
          <div className="flex items-center justify-between gap-2">
            <div className="flex items-center gap-2">
              <svg className="animate-spin h-3.5 w-3.5 text-indigo-400 shrink-0" fill="none" viewBox="0 0 24 24">
                <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
              </svg>
              <span className="text-xs font-medium text-zinc-300">
                Executing Tool: <strong className="font-mono text-indigo-300">{payload.tool_name}</strong>
              </span>
            </div>
            <span className="text-[11px] font-mono text-zinc-500">{formatTimestamp(timestamp)}</span>
          </div>

          {payload.input_args && (
            <div className="bg-zinc-900/90 rounded p-2 border border-zinc-800 text-[11px] font-mono text-zinc-300 break-words overflow-hidden">
              <span className="text-zinc-500 text-[10px] block mb-0.5">Parameters:</span>
              <p className="line-clamp-3 break-all">
                {typeof payload.input_args === "string"
                  ? payload.input_args
                  : JSON.stringify(payload.input_args, null, 2)}
              </p>
            </div>
          )}
        </div>
      );

    case "tool_call_result":
      const success = payload.success !== false;
      return (
        <div
          className={`rounded-lg p-3 space-y-2 border ${
            success
              ? "bg-emerald-950/20 border-emerald-900/40"
              : "bg-rose-950/20 border-rose-900/40"
          }`}
        >
          <div className="flex items-center justify-between gap-2">
            <div className="flex items-center gap-2">
              {success ? (
                <span className="inline-flex items-center justify-center h-4 w-4 rounded-full bg-emerald-900/80 text-emerald-400 text-[11px] font-bold">
                  ✓
                </span>
              ) : (
                <span className="inline-flex items-center justify-center h-4 w-4 rounded-full bg-rose-900/80 text-rose-400 text-[11px] font-bold">
                  ✗
                </span>
              )}
              <span className="text-xs font-medium text-zinc-200">
                Tool Result: <span className="font-mono">{payload.tool_name}</span>{" "}
                <span className={`font-semibold ${success ? "text-emerald-400" : "text-rose-400"}`}>
                  ({success ? "Success" : "Failed"})
                </span>
              </span>
            </div>
            <span className="text-[11px] font-mono text-zinc-500">{formatTimestamp(timestamp)}</span>
          </div>

          {payload.error_message && (
            <div className="text-xs text-rose-300 bg-rose-950/40 p-2 rounded border border-rose-800/60 break-words">
              {payload.error_message}
            </div>
          )}

          {payload.output_data && (
            <div className="bg-zinc-950/80 rounded p-2 border border-zinc-800/80 text-[11px] font-mono text-zinc-400">
              <div className="flex items-center justify-between mb-1">
                <span className="text-[10px] text-zinc-500 uppercase tracking-wider">Output Preview:</span>
                <button
                  onClick={onToggleExpand}
                  className="text-[10px] text-indigo-400 hover:text-indigo-300"
                >
                  {isExpanded ? "Show less" : "Show more"}
                </button>
              </div>
              <p className={`break-words whitespace-pre-wrap ${!isExpanded ? "line-clamp-2" : ""}`}>
                {typeof payload.output_data === "string"
                  ? payload.output_data
                  : JSON.stringify(payload.output_data, null, 2)}
              </p>
            </div>
          )}
        </div>
      );

    case "observation_made":
      const classification = payload.classification || "success";
      let badgeColor = "bg-emerald-950/80 text-emerald-300 border-emerald-800/60";
      if (classification === "insufficient") {
        badgeColor = "bg-amber-950/80 text-amber-300 border-amber-800/60";
      } else if (classification === "transient_failure") {
        badgeColor = "bg-orange-950/80 text-orange-300 border-orange-800/60";
      } else if (classification === "hard_failure") {
        badgeColor = "bg-rose-950/80 text-rose-300 border-rose-800/60";
      }

      return (
        <div className="rounded-lg bg-zinc-950/70 border border-zinc-800/80 p-3 space-y-2">
          <div className="flex items-center justify-between gap-2">
            <div className="flex items-center gap-2">
              <span className="text-xs text-zinc-400">Observation:</span>
              <span className={`text-[10px] font-semibold uppercase tracking-wider px-2 py-0.5 rounded-full border ${badgeColor}`}>
                {classification}
              </span>
              {payload.recommendation && (
                <span className="text-[10px] font-mono text-zinc-400 bg-zinc-800 px-1.5 py-0.5 rounded border border-zinc-700/60">
                  action: {payload.recommendation}
                </span>
              )}
            </div>
            <span className="text-[11px] font-mono text-zinc-500">{formatTimestamp(timestamp)}</span>
          </div>
          <p className="text-xs text-zinc-300 leading-relaxed break-words">
            {payload.reasoning}
          </p>
        </div>
      );

    case "replan_triggered":
      return (
        <div className="rounded-lg bg-amber-950/40 border-2 border-amber-600/70 p-3.5 sm:p-4 space-y-2 shadow-lg animate-pulse-once">
          <div className="flex items-center justify-between gap-2 border-b border-amber-800/60 pb-2">
            <div className="flex items-center gap-2">
              <span className="flex h-5 w-5 rounded-full bg-amber-600 text-zinc-950 text-xs items-center justify-center font-bold">
                ⚡
              </span>
              <span className="text-xs font-bold uppercase tracking-wider text-amber-200">
                Self-Correction / Replan Triggered
              </span>
            </div>
            <span className="text-[11px] font-mono text-amber-400">{formatTimestamp(timestamp)}</span>
          </div>
          <div className="flex flex-wrap items-center gap-2 text-xs">
            <span className="text-zinc-300">Strategy:</span>
            <span className="font-mono font-semibold px-2 py-0.5 rounded bg-amber-900/60 text-amber-200 border border-amber-700/60">
              {payload.action}
            </span>
            <span className="text-zinc-400">
              (Attempt: #{payload.retry_count || 1})
            </span>
          </div>
          <div className="text-xs text-amber-100/90 leading-relaxed bg-amber-950/60 p-2.5 rounded border border-amber-800/60 break-words">
            <strong>Agent Reasoning:</strong> {payload.reasoning}
          </div>
        </div>
      );

    case "step_completed":
      return (
        <div className="rounded-lg bg-zinc-950/50 border border-zinc-800/80 p-2.5 flex items-center justify-between gap-2">
          <div className="flex items-center gap-2 min-w-0">
            <span className="text-emerald-400 text-xs">✓</span>
            <span className="text-xs text-zinc-300 truncate">
              Step marked as <strong className="text-emerald-300 font-mono">{payload.status || "completed"}</strong>
            </span>
          </div>
          <span className="text-[11px] font-mono text-zinc-500 shrink-0">{formatTimestamp(timestamp)}</span>
        </div>
      );

    case "report_ready":
      return (
        <div className="rounded-lg bg-indigo-950/40 border border-indigo-700/70 p-3.5 space-y-2 shadow-md">
          <div className="flex items-center justify-between gap-2">
            <div className="flex items-center gap-2">
              <span className="text-base">📄</span>
              <span className="text-xs font-bold uppercase tracking-wider text-indigo-200">
                Research Report Ready
              </span>
            </div>
            <span className="text-[11px] font-mono text-indigo-400">{formatTimestamp(timestamp)}</span>
          </div>
          <p className="text-xs text-indigo-200/90">
            Synthesis complete! Markdown report generated ({payload.content_markdown?.length || 0} characters).
          </p>
          {onViewReportClick && (
            <button
              onClick={onViewReportClick}
              className="inline-flex items-center gap-1.5 px-3 py-1 text-xs font-semibold rounded bg-indigo-600 hover:bg-indigo-500 text-white transition-colors"
            >
              <span>View Full Report</span>
              <span>→</span>
            </button>
          )}
        </div>
      );

    case "run_completed":
      return (
        <div className="rounded-lg bg-emerald-950/50 border-2 border-emerald-600/80 p-4 space-y-2 shadow-xl">
          <div className="flex items-center justify-between gap-2 border-b border-emerald-800/60 pb-2">
            <div className="flex items-center gap-2">
              <span className="flex h-5 w-5 rounded-full bg-emerald-500 text-zinc-950 text-xs items-center justify-center font-bold">
                ✓
              </span>
              <span className="text-sm font-bold uppercase tracking-wider text-emerald-200">
                Research Run Complete
              </span>
            </div>
            <span className="text-xs font-mono text-emerald-400">{formatTimestamp(timestamp)}</span>
          </div>
          <p className="text-xs text-emerald-100">
            Goal successfully accomplished! Total steps executed:{" "}
            <strong>{payload.total_steps_executed ?? "All"}</strong>.
          </p>
        </div>
      );

    case "run_failed":
      return (
        <div className="rounded-lg bg-rose-950/50 border-2 border-rose-600/80 p-4 space-y-2 shadow-xl">
          <div className="flex items-center justify-between gap-2 border-b border-rose-800/60 pb-2">
            <div className="flex items-center gap-2">
              <span className="flex h-5 w-5 rounded-full bg-rose-500 text-zinc-950 text-xs items-center justify-center font-bold">
                ✗
              </span>
              <span className="text-sm font-bold uppercase tracking-wider text-rose-200">
                Research Run Failed
              </span>
            </div>
            <span className="text-xs font-mono text-rose-400">{formatTimestamp(timestamp)}</span>
          </div>
          <p className="text-xs text-rose-200 break-words">
            {payload.error_message || "The autonomous agent encountered an unrecoverable error."}
          </p>
        </div>
      );

    case "connection_status":
      return (
        <div className="rounded p-2 text-[11px] font-mono text-zinc-400 bg-zinc-900/60 border border-zinc-800/60 flex items-center justify-between">
          <span>{payload.message}</span>
          <span className="text-zinc-500">{formatTimestamp(timestamp)}</span>
        </div>
      );

    default:
      return (
        <div className="rounded p-2.5 text-xs text-zinc-300 bg-zinc-950/60 border border-zinc-800">
          <div className="flex justify-between items-center text-[10px] text-zinc-500 font-mono mb-1">
            <span>{type}</span>
            <span>{formatTimestamp(timestamp)}</span>
          </div>
          <p className="line-clamp-2 break-all text-[11px] font-mono">{JSON.stringify(payload)}</p>
        </div>
      );
  }
}
