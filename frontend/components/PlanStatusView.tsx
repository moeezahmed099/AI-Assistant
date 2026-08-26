"use client";

import React from "react";
import { StepResponse } from "@/lib/api";

interface PlanStatusViewProps {
  steps: StepResponse[];
  currentStepId?: string | null;
  activePlanId?: string | null;
}

export function PlanStatusView({
  steps,
  currentStepId,
  activePlanId,
}: PlanStatusViewProps) {
  const completedCount = steps.filter(
    (s) => s.status === "completed" || s.status === "complete"
  ).length;
  const totalCount = steps.length;
  const progressPercent =
    totalCount > 0 ? Math.round((completedCount / totalCount) * 100) : 0;

  return (
    <div className="rounded-xl bg-zinc-900/80 border border-zinc-800 shadow-xl overflow-hidden flex flex-col h-full">
      {/* Plan Header */}
      <div className="px-4 py-3 border-b border-zinc-800 bg-zinc-950/60 flex items-center justify-between">
        <div className="space-y-0.5 min-w-0">
          <div className="flex items-center gap-2">
            <span className="text-sm">🎯</span>
            <h3 className="text-sm font-semibold text-zinc-200 tracking-wide truncate">
              Execution Plan
            </h3>
          </div>
          <p className="text-[11px] text-zinc-400">
            {completedCount} of {totalCount} step{totalCount !== 1 ? "s" : ""} finished ({progressPercent}%)
          </p>
        </div>

        <div className="w-20 sm:w-24 shrink-0">
          <div className="h-2 rounded-full bg-zinc-800 overflow-hidden border border-zinc-700/50">
            <div
              className="h-full bg-gradient-to-r from-indigo-500 to-emerald-400 transition-all duration-500"
              style={{ width: `${progressPercent}%` }}
            />
          </div>
        </div>
      </div>

      {/* Steps List */}
      <div className="flex-1 p-3 sm:p-4 overflow-y-auto space-y-2.5 max-h-[550px]">
        {steps.length === 0 ? (
          <div className="text-center py-12 text-zinc-500 text-xs space-y-2">
            <div className="animate-spin w-5 h-5 border-2 border-indigo-500 border-t-transparent rounded-full mx-auto" />
            <p>Formulating structured execution plan...</p>
          </div>
        ) : (
          steps.map((step, idx) => {
            const isCurrent = currentStepId === step.id || step.status === "in_progress" || step.status === "in-progress";
            const isCompleted = step.status === "completed" || step.status === "complete";
            const isSkipped = step.status === "skipped";
            const isFailed = step.status === "failed";
            const isPending = step.status === "pending" || (!isCurrent && !isCompleted && !isSkipped && !isFailed);

            let borderStyle = "border-zinc-800/80 bg-zinc-950/40";
            if (isCurrent) {
              borderStyle = "border-blue-600/70 bg-blue-950/20 ring-1 ring-blue-500/40";
            } else if (isCompleted) {
              borderStyle = "border-emerald-900/50 bg-emerald-950/10";
            } else if (isSkipped) {
              borderStyle = "border-amber-900/50 bg-amber-950/10";
            } else if (isFailed) {
              borderStyle = "border-rose-900/50 bg-rose-950/10";
            }

            return (
              <div
                key={step.id || idx}
                className={`rounded-lg p-3 border transition-all text-xs space-y-2 ${borderStyle}`}
              >
                <div className="flex items-start justify-between gap-2">
                  <div className="flex items-start gap-2.5 min-w-0">
                    {/* Status Icon */}
                    <div className="mt-0.5 shrink-0">
                      {isCompleted ? (
                        <span className="flex h-5 w-5 items-center justify-center rounded-full bg-emerald-900/80 text-emerald-300 font-bold text-xs border border-emerald-700/60">
                          ✓
                        </span>
                      ) : isCurrent ? (
                        <span className="flex h-5 w-5 items-center justify-center rounded-full bg-blue-900/80 text-blue-300 text-xs border border-blue-600 animate-spin">
                          ⚙
                        </span>
                      ) : isSkipped ? (
                        <span className="flex h-5 w-5 items-center justify-center rounded-full bg-amber-900/80 text-amber-300 text-xs border border-amber-700/60">
                          ↷
                        </span>
                      ) : isFailed ? (
                        <span className="flex h-5 w-5 items-center justify-center rounded-full bg-rose-900/80 text-rose-300 text-xs border border-rose-700/60">
                          ✗
                        </span>
                      ) : (
                        <span className="flex h-5 w-5 items-center justify-center rounded-full bg-zinc-800 text-zinc-400 text-[11px] font-mono border border-zinc-700">
                          {idx + 1}
                        </span>
                      )}
                    </div>

                    {/* Description */}
                    <div className="space-y-1 min-w-0">
                      <p
                        className={`font-medium leading-snug break-words ${
                          isCompleted
                            ? "text-zinc-300"
                            : isCurrent
                            ? "text-blue-100 font-semibold"
                            : isSkipped
                            ? "text-zinc-400 line-through"
                            : "text-zinc-300"
                        }`}
                      >
                        {step.description}
                      </p>
                    </div>
                  </div>

                  {/* Status Badge */}
                  <span
                    className={`text-[10px] uppercase tracking-wider font-semibold px-2 py-0.5 rounded-full border shrink-0 ${
                      isCompleted
                        ? "bg-emerald-950/80 text-emerald-300 border-emerald-800/60"
                        : isCurrent
                        ? "bg-blue-950/80 text-blue-300 border-blue-700 animate-pulse"
                        : isSkipped
                        ? "bg-amber-950/80 text-amber-300 border-amber-800/60"
                        : isFailed
                        ? "bg-rose-950/80 text-rose-300 border-rose-800/60"
                        : "bg-zinc-800/80 text-zinc-400 border-zinc-700/60"
                    }`}
                  >
                    {isCompleted
                      ? "Complete"
                      : isCurrent
                      ? "In Progress"
                      : isSkipped
                      ? "Skipped"
                      : isFailed
                      ? "Failed"
                      : "Pending"}
                  </span>
                </div>

                {/* Sub-meta details */}
                <div className="flex flex-wrap items-center gap-2 pt-1 border-t border-zinc-800/40 text-[11px]">
                  {step.intended_tool && step.intended_tool !== "none" && (
                    <span className="font-mono text-[10px] text-zinc-400 bg-zinc-900 px-1.5 py-0.5 rounded border border-zinc-800">
                      tool: {step.intended_tool}
                    </span>
                  )}
                  {step.tool_calls && step.tool_calls.length > 0 && (
                    <span className="text-[10px] text-indigo-300 font-mono">
                      {step.tool_calls.length} tool call{step.tool_calls.length !== 1 ? "s" : ""}
                    </span>
                  )}
                  {step.observation && (
                    <span
                      className={`text-[10px] font-mono px-1.5 py-0.5 rounded ${
                        step.observation.classification === "success"
                          ? "bg-emerald-950 text-emerald-400 border border-emerald-800/40"
                          : "bg-amber-950 text-amber-400 border border-amber-800/40"
                      }`}
                    >
                      obs: {step.observation.classification}
                    </span>
                  )}
                </div>
              </div>
            );
          })
        )}
      </div>
    </div>
  );
}
