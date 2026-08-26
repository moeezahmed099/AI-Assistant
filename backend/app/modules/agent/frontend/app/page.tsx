"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { createRun } from "@/lib/api";

const SAMPLE_GOALS = [
  "What was the average annual rainfall in Tokyo between 2000 and 2020?",
  "What are the latest breakthroughs in solid-state battery technology in 2025?",
  "Analyze the market share of major web browsers over the past 5 years.",
];

export default function Home() {
  const router = useRouter();
  const [goal, setGoal] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [showWakeupNotice, setShowWakeupNotice] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const cleanGoal = goal.trim();
    if (!cleanGoal) {
      setError("Please enter a valid research goal.");
      return;
    }

    setError(null);
    setIsLoading(true);
    setShowWakeupNotice(false);

    // Show wakeup notice if request takes longer than 4.5 seconds (Render free tier cold start)
    const wakeupTimer = setTimeout(() => {
      setShowWakeupNotice(true);
    }, 4500);

    try {
      const run = await createRun(cleanGoal);
      clearTimeout(wakeupTimer);
      router.push(`/runs/${run.id}`);
    } catch (err) {
      clearTimeout(wakeupTimer);
      setIsLoading(false);
      setShowWakeupNotice(false);
      if (err instanceof Error) {
        setError(err.message);
      } else {
        setError("An unexpected error occurred while starting research.");
      }
    }
  };

  return (
    <main className="flex-1 flex flex-col items-center justify-center px-4 py-8 sm:px-6 lg:px-8">
      <div className="w-full max-w-2xl space-y-6">
        {/* Header section */}
        <div className="text-center space-y-3">
          <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full text-xs font-medium bg-indigo-500/10 text-indigo-400 border border-indigo-500/20">
            <span className="relative flex h-2 w-2">
              <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-indigo-400 opacity-75"></span>
              <span className="relative inline-flex rounded-full h-2 w-2 bg-indigo-500"></span>
            </span>
            Autonomous AI Agent
          </div>
          <h1 className="text-2xl sm:text-4xl font-bold tracking-tight text-zinc-100">
            What would you like to research?
          </h1>
          <p className="text-sm sm:text-base text-zinc-400 max-w-lg mx-auto">
            Provide a research question or topic. The agent will plan steps, gather data, run calculations, and generate a report.
          </p>
        </div>

        {/* Form section */}
        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="relative rounded-xl bg-zinc-900/90 p-1 border border-zinc-800 focus-within:border-indigo-500 focus-within:ring-1 focus-within:ring-indigo-500 transition-all shadow-xl">
            <textarea
              id="goal-input"
              rows={5}
              value={goal}
              onChange={(e) => {
                setGoal(e.target.value);
                if (error) setError(null);
              }}
              placeholder="e.g., What was the average annual rainfall in Tokyo between 2000 and 2020?"
              className="w-full bg-transparent p-3 sm:p-4 text-sm sm:text-base text-zinc-100 placeholder-zinc-500 focus:outline-none resize-none"
              disabled={isLoading}
            />

            <div className="flex flex-wrap items-center justify-between gap-3 border-t border-zinc-800/80 pt-3 px-3 pb-2">
              <span className="text-xs text-zinc-500">
                {goal.length} characters
              </span>
              <button
                type="submit"
                disabled={isLoading || !goal.trim()}
                className="w-full sm:w-auto inline-flex items-center justify-center gap-2 rounded-lg bg-indigo-600 px-5 py-2.5 text-sm font-semibold text-white shadow-md hover:bg-indigo-500 focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:ring-offset-2 focus:ring-offset-zinc-900 disabled:opacity-50 disabled:cursor-not-allowed transition-all"
              >
                {isLoading ? (
                  <>
                    <svg
                      className="animate-spin h-4 w-4 text-white"
                      xmlns="http://www.w3.org/2000/svg"
                      fill="none"
                      viewBox="0 0 24 24"
                    >
                      <circle
                        className="opacity-25"
                        cx="12"
                        cy="12"
                        r="10"
                        stroke="currentColor"
                        strokeWidth="4"
                      ></circle>
                      <path
                        className="opacity-75"
                        fill="currentColor"
                        d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"
                      ></path>
                    </svg>
                    <span>Starting Research...</span>
                  </>
                ) : (
                  <>
                    <span>Start Research</span>
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
                        d="M14 5l7 7m0 0l-7 7m7-7H3"
                      />
                    </svg>
                  </>
                )}
              </button>
            </div>
          </div>

          {/* Render Free Tier Wakeup Notification */}
          {showWakeupNotice && isLoading && (
            <div className="rounded-lg bg-amber-950/40 border border-amber-800/60 p-4 text-xs sm:text-sm text-amber-200 flex items-start gap-3 animate-fade-in shadow-md">
              <span className="text-lg leading-none select-none">⏳</span>
              <div className="flex-1">
                <p className="font-semibold text-amber-300">Waking up the research agent backend...</p>
                <p className="mt-0.5 text-amber-200/80 text-xs leading-relaxed">
                  Render&apos;s free tier spins down after inactivity. Cold starts can take 30–60 seconds on the initial request. Please wait while the server starts up!
                </p>
              </div>
            </div>
          )}

          {/* Error Message */}
          {error && (
            <div className="rounded-lg bg-rose-950/60 border border-rose-800/80 p-4 text-xs sm:text-sm text-rose-200 flex items-start gap-3 animate-fade-in shadow-md">
              <svg
                className="h-5 w-5 text-rose-400 shrink-0 mt-0.5"
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
              <div className="flex-1">
                <p className="font-semibold text-rose-300">Submission Error</p>
                <p className="mt-0.5 text-rose-200/90">{error}</p>
              </div>
            </div>
          )}
        </form>

        {/* Starter Prompts */}
        <div className="space-y-2 pt-2">
          <p className="text-xs font-medium uppercase tracking-wider text-zinc-500">
            Example Prompts
          </p>
          <div className="flex flex-col gap-2">
            {SAMPLE_GOALS.map((sample, idx) => (
              <button
                key={idx}
                type="button"
                onClick={() => {
                  setGoal(sample);
                  if (error) setError(null);
                }}
                disabled={isLoading}
                className="text-left text-xs sm:text-sm text-zinc-400 bg-zinc-900/50 hover:bg-zinc-900 hover:text-zinc-200 border border-zinc-800/80 rounded-lg p-3 transition-colors flex items-center justify-between group"
              >
                <span className="line-clamp-1">{sample}</span>
                <svg
                  className="h-4 w-4 text-zinc-600 group-hover:text-indigo-400 shrink-0 ml-2 transition-colors"
                  fill="none"
                  stroke="currentColor"
                  viewBox="0 0 24 24"
                  xmlns="http://www.w3.org/2000/svg"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={2}
                    d="M9 5l7 7-7 7"
                  />
                </svg>
              </button>
            ))}
          </div>
        </div>
      </div>
    </main>
  );
}
