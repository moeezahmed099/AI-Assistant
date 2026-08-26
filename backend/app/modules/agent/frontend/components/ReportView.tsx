"use client";

import React, { useState } from "react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";

interface ReportViewProps {
  contentMarkdown?: string | null;
  reportId?: string | null;
  goalText?: string | null;
  createdAt?: string | null;
}

export function ReportView({
  contentMarkdown,
  reportId,
  goalText,
  createdAt,
}: ReportViewProps) {
  const [copied, setCopied] = useState(false);

  if (!contentMarkdown) {
    return (
      <div className="rounded-xl bg-zinc-900/80 border border-zinc-800 p-8 sm:p-12 text-center space-y-4 shadow-xl">
        <div className="mx-auto h-12 w-12 rounded-full bg-zinc-800 flex items-center justify-center text-zinc-400">
          <svg className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
          </svg>
        </div>
        <div className="space-y-1">
          <h3 className="text-base font-semibold text-zinc-200">No Research Report Yet</h3>
          <p className="text-xs sm:text-sm text-zinc-400 max-w-md mx-auto">
            The autonomous agent will synthesize findings and generate the final report once execution completes.
          </p>
        </div>
      </div>
    );
  }

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(contentMarkdown);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // Fallback
    }
  };

  const handleDownload = () => {
    const element = document.createElement("a");
    const file = new Blob([contentMarkdown], { type: "text/markdown" });
    element.href = URL.createObjectURL(file);
    element.download = `research-report-${(reportId || "run").slice(0, 8)}.md`;
    document.body.appendChild(element);
    element.click();
    document.body.removeChild(element);
  };

  const wordCount = contentMarkdown.trim().split(/\s+/).filter(Boolean).length;

  return (
    <div className="rounded-xl bg-zinc-900/90 border border-zinc-800 shadow-2xl overflow-hidden flex flex-col space-y-0">
      {/* Report Header Bar */}
      <div className="px-4 sm:px-6 py-4 border-b border-zinc-800 bg-zinc-950/80 flex flex-wrap items-center justify-between gap-3">
        <div className="space-y-1 min-w-0">
          <div className="flex items-center gap-2">
            <span className="text-lg">📑</span>
            <h2 className="text-base sm:text-lg font-bold text-zinc-100 tracking-tight">
              Synthesized Research Report
            </h2>
          </div>
          <p className="text-xs text-zinc-400">
            {wordCount} words • {contentMarkdown.length} characters
            {createdAt && ` • Generated ${new Date(createdAt).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}`}
          </p>
        </div>

        <div className="flex items-center gap-2">
          <button
            onClick={handleCopy}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-lg bg-zinc-800 hover:bg-zinc-700 text-zinc-200 border border-zinc-700/60 transition-colors shadow-sm"
          >
            {copied ? (
              <>
                <span className="text-emerald-400">✓</span>
                <span className="text-emerald-300">Copied!</span>
              </>
            ) : (
              <>
                <svg className="w-3.5 h-3.5 text-zinc-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z" />
                </svg>
                <span>Copy Markdown</span>
              </>
            )}
          </button>

          <button
            onClick={handleDownload}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-lg bg-indigo-600 hover:bg-indigo-500 text-white shadow-sm transition-colors"
          >
            <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
            </svg>
            <span>Download .md</span>
          </button>
        </div>
      </div>

      {/* Markdown Content Area */}
      <div className="p-5 sm:p-8 overflow-y-auto max-h-[750px] space-y-4 text-zinc-200 text-sm sm:text-base leading-relaxed break-words selection:bg-indigo-500 selection:text-white">
        <ReactMarkdown
          remarkPlugins={[remarkGfm]}
          components={{
            h1: ({ children }) => (
              <h1 className="text-xl sm:text-2xl font-bold text-zinc-100 border-b border-zinc-800 pb-2.5 mt-6 mb-4 first:mt-0 tracking-tight">
                {children}
              </h1>
            ),
            h2: ({ children }) => {
              const text = String(children || "");
              const isLimitations =
                text.toLowerCase().includes("limitation") ||
                text.toLowerCase().includes("caveat") ||
                text.toLowerCase().includes("gaps") ||
                text.toLowerCase().includes("risk");

              if (isLimitations) {
                return (
                  <div className="mt-8 mb-3 p-3.5 rounded-lg bg-amber-950/40 border-l-4 border-amber-500 text-amber-200">
                    <div className="flex items-center gap-2">
                      <span className="text-base">⚠️</span>
                      <h2 className="text-base sm:text-lg font-bold text-amber-200 uppercase tracking-wide">
                        {children}
                      </h2>
                      <span className="text-[10px] uppercase font-bold tracking-wider px-2 py-0.5 rounded bg-amber-900/60 text-amber-300 border border-amber-700/60 ml-auto">
                        Important
                      </span>
                    </div>
                  </div>
                );
              }

              return (
                <h2 className="text-lg sm:text-xl font-semibold text-zinc-100 mt-7 mb-3 border-b border-zinc-800/60 pb-1.5">
                  {children}
                </h2>
              );
            },
            h3: ({ children }) => (
              <h3 className="text-base sm:text-lg font-medium text-zinc-200 mt-5 mb-2">
                {children}
              </h3>
            ),
            p: ({ children }) => (
              <p className="mb-4 text-zinc-300 leading-relaxed text-sm sm:text-base">
                {children}
              </p>
            ),
            ul: ({ children }) => (
              <ul className="list-disc list-outside pl-5 mb-4 space-y-1.5 text-zinc-300 text-sm sm:text-base">
                {children}
              </ul>
            ),
            ol: ({ children }) => (
              <ol className="list-decimal list-outside pl-5 mb-4 space-y-1.5 text-zinc-300 text-sm sm:text-base">
                {children}
              </ol>
            ),
            li: ({ children }) => <li className="pl-1">{children}</li>,
            blockquote: ({ children }) => (
              <blockquote className="border-l-4 border-indigo-500/70 bg-indigo-950/20 pl-4 py-2 my-4 rounded-r-lg text-indigo-200/90 italic text-sm">
                {children}
              </blockquote>
            ),
            code: ({ children, className }) => {
              const isInline = !className;
              if (isInline) {
                return (
                  <code className="px-1.5 py-0.5 rounded bg-zinc-800 text-indigo-300 font-mono text-xs border border-zinc-700/50">
                    {children}
                  </code>
                );
              }
              return (
                <pre className="p-4 rounded-lg bg-zinc-950 border border-zinc-800 overflow-x-auto text-xs font-mono text-zinc-300 my-4">
                  <code>{children}</code>
                </pre>
              );
            },
            table: ({ children }) => (
              <div className="overflow-x-auto my-4 rounded-lg border border-zinc-800">
                <table className="min-w-full divide-y divide-zinc-800 text-xs sm:text-sm">
                  {children}
                </table>
              </div>
            ),
            th: ({ children }) => (
              <th className="px-3 py-2 bg-zinc-950 font-semibold text-zinc-200 text-left border-b border-zinc-800">
                {children}
              </th>
            ),
            td: ({ children }) => (
              <td className="px-3 py-2 text-zinc-300 border-b border-zinc-800/50">
                {children}
              </td>
            ),
            hr: () => <hr className="border-zinc-800 my-6" />,
          }}
        >
          {contentMarkdown}
        </ReactMarkdown>
      </div>
    </div>
  );
}
