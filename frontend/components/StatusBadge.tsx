import React from "react";

interface StatusBadgeProps {
  status: string;
  className?: string;
}

export function StatusBadge({ status, className = "" }: StatusBadgeProps) {
  const s = status ? status.toLowerCase().trim() : "pending";

  let colorClasses = "";
  let label = status;

  if (s === "pending") {
    label = "Pending";
    colorClasses = "bg-zinc-800/80 text-zinc-300 border-zinc-700/60";
  } else if (s === "in-progress" || s === "running" || s === "in_progress") {
    label = "In Progress";
    colorClasses = "bg-blue-950/70 text-blue-300 border-blue-800/60";
  } else if (s === "complete" || s === "completed") {
    label = "Completed";
    colorClasses = "bg-emerald-950/70 text-emerald-300 border-emerald-800/60";
  } else if (s === "failed") {
    label = "Failed";
    colorClasses = "bg-rose-950/70 text-rose-300 border-rose-800/60";
  } else {
    label = status;
    colorClasses = "bg-zinc-800/80 text-zinc-300 border-zinc-700/60";
  }

  return (
    <span
      className={`inline-flex items-center gap-1.5 px-2.5 py-1 text-xs font-medium rounded-full border transition-colors ${colorClasses} ${className}`}
    >
      <span className={`w-1.5 h-1.5 rounded-full ${
        s === "pending" ? "bg-zinc-400" :
        (s === "in-progress" || s === "running" || s === "in_progress") ? "bg-blue-400 animate-pulse" :
        (s === "complete" || s === "completed") ? "bg-emerald-400" :
        s === "failed" ? "bg-rose-400" : "bg-zinc-400"
      }`} />
      {label}
    </span>
  );
}
