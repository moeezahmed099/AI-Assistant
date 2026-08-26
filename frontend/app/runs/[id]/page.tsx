"use client";

import { useEffect, useState, useRef, useCallback } from "react";
import { useParams, useRouter } from "next/navigation";
import Link from "next/link";
import {
  getRun,
  getWebSocketUrl,
  RunResponse,
  StepResponse,
  ReportResponse,
  TraceEvent,
} from "@/lib/api";
import { StatusBadge } from "@/components/StatusBadge";
import { TraceFeed } from "@/components/TraceFeed";
import { ReportView } from "@/components/ReportView";

export default function RunDetailPage() {
  const params = useParams();
  const router = useRouter();
  const id = params?.id as string;

  const [run, setRun] = useState<RunResponse | null>(null);
  const [steps, setSteps] = useState<StepResponse[]>([]);
  const [report, setReport] = useState<ReportResponse | null>(null);
  const [traceEvents, setTraceEvents] = useState<TraceEvent[]>([]);
  const [currentStepId, setCurrentStepId] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<"dashboard" | "report">("dashboard");

  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [connectionStatus, setConnectionStatus] = useState<
    "connecting" | "connected" | "reconnecting" | "disconnected" | "closed"
  >("connecting");

  const wsRef = useRef<WebSocket | null>(null);
  const reconnectTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const isTerminalStateRef = useRef(false);
  const traceCounterRef = useRef(0);

  const getNextEventId = () => {
    traceCounterRef.current += 1;
    return `evt-${Date.now()}-${traceCounterRef.current}`;
  };

  // Convert snapshot steps into initial trace history if connecting late or on catch_up
  const buildTraceFromSteps = (existingSteps: StepResponse[], existingReport?: ReportResponse | null): TraceEvent[] => {
    const events: TraceEvent[] = [];

    if (existingSteps.length > 0) {
      events.push({
        id: `plan-init-${existingSteps[0].plan_id || "1"}`,
        type: "plan_created",
        timestamp: existingSteps[0].created_at || new Date().toISOString(),
        payload: {
          total_steps: existingSteps.length,
          steps: existingSteps.map((s) => ({
            id: s.id,
            description: s.description,
            intended_tool: s.intended_tool,
            status: s.status,
          })),
        },
      });

      for (const step of existingSteps) {
        if (step.status !== "pending") {
          events.push({
            id: `step-start-${step.id}`,
            type: "step_started",
            timestamp: step.started_at || step.created_at || new Date().toISOString(),
            step_id: step.id,
            payload: {
              step_id: step.id,
              description: step.description,
              intended_tool: step.intended_tool,
            },
          });
        }

        for (const tc of step.tool_calls || []) {
          events.push({
            id: `tc-start-${tc.id}`,
            type: "tool_call_started",
            timestamp: tc.created_at || new Date().toISOString(),
            step_id: step.id,
            payload: {
              tool_call_id: tc.id,
              step_id: step.id,
              tool_name: tc.tool_name,
              input_args: tc.input_args,
            },
          });

          events.push({
            id: `tc-res-${tc.id}`,
            type: "tool_call_result",
            timestamp: tc.created_at || new Date().toISOString(),
            step_id: step.id,
            payload: {
              tool_call_id: tc.id,
              step_id: step.id,
              tool_name: tc.tool_name,
              success: tc.success,
              error_message: tc.error_message,
              output_data: tc.output_data,
            },
          });
        }

        if (step.observation) {
          events.push({
            id: `obs-${step.observation.id}`,
            type: "observation_made",
            timestamp: step.observation.created_at || new Date().toISOString(),
            step_id: step.id,
            payload: {
              step_id: step.id,
              classification: step.observation.classification,
              recommendation: step.observation.recommendation,
              reasoning: step.observation.reasoning,
            },
          });
        }

        if (step.status === "completed" || step.status === "complete" || step.status === "skipped" || step.status === "failed") {
          events.push({
            id: `step-done-${step.id}`,
            type: "step_completed",
            timestamp: step.completed_at || new Date().toISOString(),
            step_id: step.id,
            payload: {
              step_id: step.id,
              status: step.status,
              result_ref: step.result_ref,
            },
          });
        }
      }
    }

    if (existingReport) {
      events.push({
        id: `report-${existingReport.id}`,
        type: "report_ready",
        timestamp: existingReport.created_at || new Date().toISOString(),
        payload: {
          report_id: existingReport.id,
          content_markdown: existingReport.content_markdown,
        },
      });
    }

    return events;
  };

  // Initial REST fetch to validate run existence
  const loadInitialSnapshot = useCallback(async () => {
    if (!id) return;
    try {
      const data = await getRun(id);
      setRun(data);
      if (data.report) {
        setReport(data.report);
      }
      const currentPlan = data.plans?.find((p) => p.is_current) || data.plans?.[0];
      if (currentPlan?.steps) {
        setSteps(currentPlan.steps);
      }
      if (data.status === "complete" || data.status === "failed") {
        isTerminalStateRef.current = true;
        const initialTrace = buildTraceFromSteps(currentPlan?.steps || [], data.report);
        setTraceEvents(initialTrace);
      }
    } catch (err) {
      if (err instanceof Error) {
        setError(err.message);
      }
    } finally {
      setIsLoading(false);
    }
  }, [id]);

  // WebSocket Live Connection with auto-reconnect
  useEffect(() => {
    if (!id) return;

    loadInitialSnapshot();

    let isUnmounted = false;

    const connectWebSocket = () => {
      if (isUnmounted) return;

      const wsUrl = getWebSocketUrl(id);
      setConnectionStatus((prev) => (prev === "connected" ? "reconnecting" : "connecting"));

      try {
        const ws = new WebSocket(wsUrl);
        wsRef.current = ws;

        ws.onopen = () => {
          if (isUnmounted) return;
          setConnectionStatus("connected");
        };

        ws.onmessage = (event) => {
          if (isUnmounted) return;
          try {
            const data = JSON.parse(event.data);
            const eventType = data.type || data.event;
            const payload = data.payload || {};
            const timestamp = data.timestamp || new Date().toISOString();

            if (eventType === "catch_up") {
              if (payload.run) {
                setRun((prev) => ({
                  ...(prev || {}),
                  id: payload.run.id,
                  goal_text: payload.run.goal_text,
                  status: payload.run.status,
                  created_at: payload.run.created_at,
                  completed_at: payload.run.completed_at,
                  plans: prev?.plans || [],
                }));

                if (payload.run.status === "complete" || payload.run.status === "failed") {
                  isTerminalStateRef.current = true;
                }
              }

              if (payload.steps && Array.isArray(payload.steps)) {
                setSteps(payload.steps);
                // Active step
                const active = payload.steps.find(
                  (s: StepResponse) => s.status === "in_progress" || s.status === "in-progress"
                );
                if (active) setCurrentStepId(active.id);
              }

              if (payload.report) {
                setReport(payload.report);
              }

              // Build initial trace list from catch up state
              const populatedTrace = buildTraceFromSteps(payload.steps || [], payload.report);
              setTraceEvents(populatedTrace);
            } else if (eventType === "plan_created") {
              const newSteps: StepResponse[] = (payload.steps || []).map((s: any) => ({
                id: s.id,
                plan_id: payload.plan_id,
                description: s.description,
                intended_tool: s.intended_tool,
                status: s.status || "pending",
                created_at: timestamp,
                tool_calls: [],
              }));
              setSteps(newSteps);
              setTraceEvents((prev) => [
                ...prev,
                {
                  id: getNextEventId(),
                  type: "plan_created",
                  timestamp,
                  payload,
                },
              ]);
            } else if (eventType === "step_started") {
              setCurrentStepId(payload.step_id);
              setSteps((prev) =>
                prev.map((s) =>
                  s.id === payload.step_id
                    ? { ...s, status: "in_progress", started_at: timestamp }
                    : s
                )
              );
              setTraceEvents((prev) => [
                ...prev,
                {
                  id: getNextEventId(),
                  type: "step_started",
                  timestamp,
                  step_id: payload.step_id,
                  payload,
                },
              ]);
            } else if (eventType === "tool_call_started") {
              setSteps((prev) =>
                prev.map((s) => {
                  if (s.id === payload.step_id) {
                    const newCall = {
                      id: payload.tool_call_id,
                      step_id: payload.step_id,
                      tool_name: payload.tool_name,
                      input_args: payload.input_args,
                      success: false,
                      created_at: timestamp,
                    };
                    return {
                      ...s,
                      tool_calls: [...(s.tool_calls || []), newCall],
                    };
                  }
                  return s;
                })
              );
              setTraceEvents((prev) => [
                ...prev,
                {
                  id: getNextEventId(),
                  type: "tool_call_started",
                  timestamp,
                  step_id: payload.step_id,
                  payload,
                },
              ]);
            } else if (eventType === "tool_call_result") {
              setSteps((prev) =>
                prev.map((s) => {
                  if (s.id === payload.step_id) {
                    return {
                      ...s,
                      tool_calls: (s.tool_calls || []).map((tc) =>
                        tc.id === payload.tool_call_id
                          ? {
                              ...tc,
                              success: payload.success,
                              error_message: payload.error_message,
                              output_data: payload.output_data,
                            }
                          : tc
                      ),
                    };
                  }
                  return s;
                })
              );
              setTraceEvents((prev) => [
                ...prev,
                {
                  id: getNextEventId(),
                  type: "tool_call_result",
                  timestamp,
                  step_id: payload.step_id,
                  payload,
                },
              ]);
            } else if (eventType === "observation_made") {
              setSteps((prev) =>
                prev.map((s) =>
                  s.id === payload.step_id
                    ? {
                        ...s,
                        observation: {
                          id: `obs-${Date.now()}`,
                          step_id: payload.step_id,
                          classification: payload.classification,
                          recommendation: payload.recommendation,
                          reasoning: payload.reasoning,
                          created_at: timestamp,
                        },
                      }
                    : s
                )
              );
              setTraceEvents((prev) => [
                ...prev,
                {
                  id: getNextEventId(),
                  type: "observation_made",
                  timestamp,
                  step_id: payload.step_id,
                  payload,
                },
              ]);
            } else if (eventType === "replan_triggered") {
              setTraceEvents((prev) => [
                ...prev,
                {
                  id: getNextEventId(),
                  type: "replan_triggered",
                  timestamp,
                  step_id: payload.step_id,
                  payload,
                },
              ]);
            } else if (eventType === "step_completed") {
              setSteps((prev) =>
                prev.map((s) =>
                  s.id === payload.step_id
                    ? {
                        ...s,
                        status: payload.status || "completed",
                        result_ref: payload.result_ref,
                        completed_at: timestamp,
                      }
                    : s
                )
              );
              setCurrentStepId((prev) => (prev === payload.step_id ? null : prev));
              setTraceEvents((prev) => [
                ...prev,
                {
                  id: getNextEventId(),
                  type: "step_completed",
                  timestamp,
                  step_id: payload.step_id,
                  payload,
                },
              ]);
            } else if (eventType === "report_ready") {
              const newReport: ReportResponse = {
                id: payload.report_id,
                run_id: id,
                content_markdown: payload.content_markdown,
                created_at: timestamp,
              };
              setReport(newReport);
              setTraceEvents((prev) => [
                ...prev,
                {
                  id: getNextEventId(),
                  type: "report_ready",
                  timestamp,
                  payload,
                },
              ]);
            } else if (eventType === "run_completed") {
              isTerminalStateRef.current = true;
              setRun((prev) => (prev ? { ...prev, status: "complete", completed_at: timestamp } : null));
              setConnectionStatus("closed");
              setTraceEvents((prev) => [
                ...prev,
                {
                  id: getNextEventId(),
                  type: "run_completed",
                  timestamp,
                  payload,
                },
              ]);
            } else if (eventType === "run_failed") {
              isTerminalStateRef.current = true;
              setRun((prev) => (prev ? { ...prev, status: "failed", completed_at: timestamp } : null));
              setConnectionStatus("closed");
              setTraceEvents((prev) => [
                ...prev,
                {
                  id: getNextEventId(),
                  type: "run_failed",
                  timestamp,
                  payload,
                },
              ]);
            }
          } catch (e) {
            console.error("Error processing websocket event:", e);
          }
        };

        ws.onerror = () => {
          if (!isTerminalStateRef.current && !isUnmounted) {
            setConnectionStatus("reconnecting");
          }
        };

        ws.onclose = () => {
          if (isUnmounted) return;
          if (isTerminalStateRef.current) {
            setConnectionStatus("closed");
          } else {
            setConnectionStatus("reconnecting");
            // Schedule auto-reconnection
            reconnectTimeoutRef.current = setTimeout(() => {
              if (!isUnmounted && !isTerminalStateRef.current) {
                connectWebSocket();
              }
            }, 2500);
          }
        };
      } catch (err) {
        if (!isTerminalStateRef.current) {
          setConnectionStatus("reconnecting");
          reconnectTimeoutRef.current = setTimeout(connectWebSocket, 2500);
        }
      }
    };

    connectWebSocket();

    return () => {
      isUnmounted = true;
      if (reconnectTimeoutRef.current) {
        clearTimeout(reconnectTimeoutRef.current);
      }
      if (wsRef.current) {
        wsRef.current.close();
      }
    };
  }, [id, loadInitialSnapshot]);

  const formatDate = (dateString?: string | null) => {
    if (!dateString) return "N/A";
    try {
      const date = new Date(dateString);
      return new Intl.DateTimeFormat("en-US", {
        dateStyle: "medium",
        timeStyle: "medium",
      }).format(date);
    } catch {
      return dateString;
    }
  };

  return (
    <main className="flex-1 max-w-7xl w-full mx-auto px-3 sm:px-6 lg:px-8 py-6 sm:py-8 space-y-6">
      {/* Top Navigation & Status Bar */}
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-zinc-800 pb-4">
        <Link
          href="/history"
          className="inline-flex items-center gap-1.5 text-xs sm:text-sm font-medium text-zinc-400 hover:text-zinc-200 transition-colors"
        >
          <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
          </svg>
          <span>Back to History</span>
        </Link>

        {/* WebSocket Connection Status & View Switcher */}
        <div className="flex items-center gap-3">
          <div className="flex items-center gap-2 px-3 py-1 rounded-full bg-zinc-900 border border-zinc-800 text-xs">
            <span
              className={`w-2 h-2 rounded-full ${
                connectionStatus === "connected"
                  ? "bg-emerald-400 shadow-[0_0_8px_rgba(52,211,153,0.9)] animate-pulse"
                  : connectionStatus === "reconnecting" || connectionStatus === "connecting"
                  ? "bg-amber-400 animate-ping"
                  : "bg-zinc-500"
              }`}
            />
            <span className="text-zinc-300 font-mono text-[11px]">
              {connectionStatus === "connected"
                ? "Live Stream"
                : connectionStatus === "reconnecting"
                ? "Reconnecting..."
                : connectionStatus === "connecting"
                ? "Connecting..."
                : "Completed"}
            </span>
          </div>

          <div className="flex rounded-lg bg-zinc-900 p-1 border border-zinc-800">
            <button
              onClick={() => setActiveTab("dashboard")}
              className={`px-3 py-1 text-xs font-semibold rounded-md transition-colors ${
                activeTab === "dashboard"
                  ? "bg-indigo-600 text-white shadow-sm"
                  : "text-zinc-400 hover:text-zinc-200"
              }`}
            >
              Live Trace
            </button>
            <button
              onClick={() => setActiveTab("report")}
              className={`flex items-center gap-1.5 px-3 py-1 text-xs font-semibold rounded-md transition-colors ${
                activeTab === "report"
                  ? "bg-indigo-600 text-white shadow-sm"
                  : "text-zinc-400 hover:text-zinc-200"
              }`}
            >
              <span>Report</span>
              {report && (
                <span className="w-1.5 h-1.5 rounded-full bg-emerald-400" />
              )}
            </button>
          </div>
        </div>
      </div>

      {/* Loading State */}
      {isLoading && (
        <div className="flex flex-col items-center justify-center py-16 space-y-4 rounded-xl bg-zinc-900/40 border border-zinc-800">
          <div className="animate-spin h-8 w-8 border-4 border-indigo-500 border-t-transparent rounded-full" />
          <p className="text-sm text-zinc-400">Connecting to research run stream...</p>
        </div>
      )}

      {/* Error State */}
      {error && !run && (
        <div className="rounded-xl bg-rose-950/50 border border-rose-800/80 p-6 space-y-4 shadow-lg">
          <div className="flex items-start gap-3">
            <svg className="h-6 w-6 text-rose-400 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
            </svg>
            <div>
              <h2 className="text-base font-semibold text-rose-200">Unable to load research run</h2>
              <p className="text-xs sm:text-sm text-rose-300/90 mt-1">{error}</p>
            </div>
          </div>
          <div className="flex gap-3 pt-2">
            <button
              onClick={() => router.push("/")}
              className="px-4 py-2 text-xs font-semibold rounded-lg bg-zinc-900 text-zinc-300 hover:bg-zinc-800 border border-zinc-700 transition-colors"
            >
              Start New Research
            </button>
          </div>
        </div>
      )}

      {/* Main Content */}
      {run && (
        <div className="space-y-6">
          {/* Objective Card */}
          <div className="rounded-xl bg-zinc-900/80 border border-zinc-800 p-4 sm:p-6 space-y-4 shadow-xl">
            <div className="flex flex-wrap items-center justify-between gap-3 border-b border-zinc-800/80 pb-3">
              <div className="space-y-1 min-w-0">
                <span className="text-[10px] sm:text-xs font-mono text-zinc-500 uppercase tracking-wider">
                  Run ID
                </span>
                <p className="text-xs sm:text-sm font-mono text-zinc-300 break-all">{run.id}</p>
              </div>
              <div className="flex items-center gap-2.5">
                <StatusBadge status={run.status} />
              </div>
            </div>

            <div className="space-y-1.5">
              <h2 className="text-xs font-semibold uppercase tracking-wider text-zinc-400">
                Research Objective
              </h2>
              <p className="text-sm sm:text-base text-zinc-100 font-medium leading-relaxed bg-zinc-950/60 p-3.5 sm:p-4 rounded-lg border border-zinc-800/60 break-words whitespace-pre-wrap">
                {run.goal_text}
              </p>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 pt-1 text-xs">
              <div className="bg-zinc-950/40 p-2.5 rounded-lg border border-zinc-800/40">
                <span className="text-zinc-500 block text-[11px]">Started</span>
                <p className="text-zinc-300 font-mono mt-0.5">{formatDate(run.created_at)}</p>
              </div>
              <div className="bg-zinc-950/40 p-2.5 rounded-lg border border-zinc-800/40">
                <span className="text-zinc-500 block text-[11px]">Finished</span>
                <p className="text-zinc-300 font-mono mt-0.5">
                  {run.completed_at ? formatDate(run.completed_at) : "In Progress..."}
                </p>
              </div>
            </div>
          </div>

          {/* Tab View Selection: Dashboard vs Report */}
          {activeTab === "dashboard" ? (
            <div className="w-full">
              <TraceFeed
                events={traceEvents}
                connectionStatus={connectionStatus}
                onViewReportClick={() => setActiveTab("report")}
              />
            </div>
          ) : (
            <ReportView
              contentMarkdown={report?.content_markdown}
              reportId={report?.id}
              goalText={run.goal_text}
              createdAt={report?.created_at}
            />
          )}
        </div>
      )}
    </main>
  );
}
