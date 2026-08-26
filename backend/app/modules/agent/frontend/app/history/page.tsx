"use client";

import { useEffect, useState, useCallback } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { getRuns, RunResponse, extractReportPreview } from "@/lib/api";
import { StatusBadge } from "@/components/StatusBadge";

export default function HistoryPage() {
  const router = useRouter();
  const [runs, setRuns] = useState<RunResponse[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const fetchHistory = useCallback(async (isManualRefresh = false) => {
    if (isManualRefresh) {
      setIsRefreshing(true);
    } else {
      setIsLoading(true);
    }
    setError(null);

    try {
      const data = await getRuns();
      setRuns(data);
    } catch (err) {
      if (err instanceof Error) {
        setError(err.message);
      } else {
        setError("Failed to fetch research history.");
      }
    } finally {
      setIsLoading(false);
      setIsRefreshing(false);
    }
  }, []);

  useEffect(() => {
    fetchHistory();
  }, [fetchHistory]);

  const formatDate = (dateString?: string | null) => {
    if (!dateString) return "N/A";
    try {
      const date = new Date(dateString);
      return new Intl.DateTimeFormat("en-US", {
        month: "short",
        day: "numeric",
        year: "numeric",
        hour: "numeric",
        minute: "2-digit",
      }).format(date);
    } catch {
      return dateString;
    }
  };

  return (
    <main className="flex-1 max-w-5xl w-full mx-auto px-4 py-8 sm:px-6 lg:px-8 space-y-6">
      {/* Header Bar */}
      <div className="flex flex-wrap items-center justify-between gap-4 border-b border-zinc-800 pb-4">
        <div>
          <h1 className="text-xl sm:text-2xl font-bold tracking-tight text-zinc-100">
            Research History
          </h1>
          <p className="text-xs sm:text-sm text-zinc-400 mt-1">
            View all previous research runs, live status, and synthesized reports.
          </p>
        </div>

        <div className="flex items-center gap-3">
          <button
            onClick={() => fetchHistory(true)}
            disabled={isRefreshing || isLoading}
            className="inline-flex items-center gap-2 rounded-lg bg-zinc-900 px-3.5 py-1.5 text-xs sm:text-sm font-medium text-zinc-200 border border-zinc-700/60 hover:bg-zinc-800 hover:text-white disabled:opacity-50 transition-colors"
          >
            <svg
              className={`h-4 w-4 text-zinc-400 ${
                isRefreshing ? "animate-spin text-indigo-400" : ""
              }`}
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
              xmlns="http://www.w3.org/2000/svg"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15"
              />
            </svg>
            <span>{isRefreshing ? "Refreshing..." : "Refresh"}</span>
          </button>

          <Link
            href="/"
            className="inline-flex items-center gap-1.5 rounded-lg bg-indigo-600 px-3.5 py-1.5 text-xs sm:text-sm font-medium text-white hover:bg-indigo-500 shadow-sm transition-colors"
          >
            <span>New Run</span>
            <svg
              className="h-4 w-4"
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
              xmlns="http://www.w3.org/2000/svg"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M12 4v16m8-8H4"
              />
            </svg>
          </Link>
        </div>
      </div>

      {/* Loading State */}
      {isLoading && (
        <div className="flex flex-col items-center justify-center py-16 space-y-4 rounded-xl bg-zinc-900/40 border border-zinc-800">
          <div className="animate-spin h-8 w-8 border-4 border-indigo-500 border-t-transparent rounded-full" />
          <p className="text-sm text-zinc-400">Loading research history...</p>
        </div>
      )}

      {/* Error State */}
      {error && (
        <div className="rounded-xl bg-rose-950/50 border border-rose-800/80 p-6 space-y-4 shadow-lg">
          <div className="flex items-start gap-3">
            <svg
              className="h-6 w-6 text-rose-400 shrink-0"
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
              xmlns="http://www.w3.org/2000/svg"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z"
              />
            </svg>
            <div>
              <h2 className="text-base font-semibold text-rose-200">
                Failed to load history
              </h2>
              <p className="text-xs sm:text-sm text-rose-300/90 mt-1">
                {error}
              </p>
            </div>
          </div>
          <button
            onClick={() => fetchHistory()}
            className="px-4 py-2 text-xs font-semibold rounded-lg bg-rose-900/80 text-rose-100 hover:bg-rose-800 border border-rose-700 transition-colors"
          >
            Try Again
          </button>
        </div>
      )}

      {/* Empty State */}
      {!isLoading && !error && runs.length === 0 && (
        <div className="text-center py-16 px-4 rounded-xl bg-zinc-900/40 border border-zinc-800 space-y-4">
          <div className="mx-auto h-12 w-12 rounded-full bg-zinc-800/80 flex items-center justify-center text-zinc-400">
            <svg
              className="h-6 w-6"
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
              xmlns="http://www.w3.org/2000/svg"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z"
              />
            </svg>
          </div>
          <div className="space-y-1">
            <h3 className="text-base font-semibold text-zinc-200">
              No research runs yet
            </h3>
            <p className="text-xs sm:text-sm text-zinc-400 max-w-sm mx-auto">
              Start your first autonomous research goal to see past history logs here.
            </p>
          </div>
          <Link
            href="/"
            className="inline-flex items-center gap-2 rounded-lg bg-indigo-600 px-4 py-2 text-xs sm:text-sm font-semibold text-white hover:bg-indigo-500 transition-colors shadow-md"
          >
            Start New Research
          </Link>
        </div>
      )}

      {/* History Runs List */}
      {!isLoading && !error && runs.length > 0 && (
        <div className="space-y-3">
          <div className="flex items-center justify-between text-xs text-zinc-400 px-1">
            <span>Showing {runs.length} research run{runs.length > 1 ? "s" : ""}</span>
          </div>

          <div className="divide-y divide-zinc-800/60 rounded-xl bg-zinc-900/60 border border-zinc-800 overflow-hidden shadow-xl">
            {runs.map((run) => {
              const preview = extractReportPreview(run.report?.content_markdown);

              return (
                <div
                  key={run.id}
                  onClick={() => router.push(`/runs/${run.id}`)}
                  className="group p-4 sm:p-5 hover:bg-zinc-800/50 transition-colors cursor-pointer flex flex-col space-y-2.5"
                >
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <div className="flex items-center gap-2 min-w-0">
                      <StatusBadge status={run.status} />
                      <span className="text-[11px] font-mono text-zinc-500 truncate">
                        ID: {run.id.slice(0, 8)}...
                      </span>
                    </div>

                    <span className="text-xs font-mono text-zinc-400 shrink-0">
                      {formatDate(run.created_at)}
                    </span>
                  </div>

                  <p className="text-sm sm:text-base font-medium text-zinc-200 group-hover:text-indigo-300 transition-colors line-clamp-2 break-words">
                    {run.goal_text}
                  </p>

                  {/* One-line report preview for completed runs with a report */}
                  {preview ? (
                    <div className="flex items-start gap-2 pt-1 border-t border-zinc-800/40 text-xs text-zinc-400 italic">
                      <span className="text-indigo-400 not-italic shrink-0">📄 Summary:</span>
                      <span className="line-clamp-1 break-words">{preview}</span>
                    </div>
                  ) : run.status === "complete" ? (
                    <div className="flex items-center gap-1.5 pt-0.5 text-[11px] text-zinc-500">
                      <span>✓ Completed</span>
                    </div>
                  ) : null}
                </div>
              );
            })}
          </div>
        </div>
      )}
    </main>
  );
}
