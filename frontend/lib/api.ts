export interface ToolCallResponse {
  id: string;
  step_id: string;
  tool_name: string;
  input_args: Record<string, unknown>;
  output_data?: Record<string, unknown> | null;
  success: boolean;
  error_message?: string | null;
  created_at: string;
}

export interface ObservationResponse {
  id: string;
  step_id: string;
  classification: string;
  recommendation: string;
  reasoning: string;
  created_at: string;
}

export interface StepResponse {
  id: string;
  plan_id: string;
  description: string;
  intended_tool: string;
  status: string;
  result_ref?: string | null;
  created_at: string;
  started_at?: string | null;
  completed_at?: string | null;
  tool_calls: ToolCallResponse[];
  observation?: ObservationResponse | null;
}

export interface PlanResponse {
  id: string;
  run_id: string;
  created_at: string;
  is_current: boolean;
  steps: StepResponse[];
}

export interface ReportResponse {
  id: string;
  run_id: string;
  content_markdown: string;
  created_at: string;
}

export interface RunResponse {
  id: string;
  goal_text: string;
  status: string;
  created_at: string;
  completed_at?: string | null;
  plans: PlanResponse[];
  report?: ReportResponse | null;
}

export interface RunCreatePayload {
  goal_text: string;
}

export interface CatchUpPayload {
  run: {
    id: string;
    goal_text: string;
    status: string;
    created_at: string;
    completed_at?: string | null;
  };
  steps: StepResponse[];
  report?: ReportResponse | null;
}

export interface PlanCreatedPayload {
  plan_id: string;
  total_steps: number;
  steps: Array<{
    id: string;
    description: string;
    intended_tool: string;
    status: string;
  }>;
}

export interface StepStartedPayload {
  step_id: string;
  plan_id?: string;
  description: string;
  intended_tool: string;
  started_at?: string;
}

export interface ToolCallStartedPayload {
  tool_call_id: string;
  step_id: string;
  tool_name: string;
  input_args: Record<string, unknown>;
}

export interface ToolCallResultPayload {
  tool_call_id: string;
  step_id: string;
  tool_name: string;
  success: boolean;
  error_message?: string | null;
  output_data?: Record<string, unknown> | null;
}

export interface ObservationMadePayload {
  step_id: string;
  classification: "success" | "insufficient" | "transient_failure" | "hard_failure" | string;
  recommendation: "continue" | "retry_same" | "retry_reformulated" | "skip_and_flag" | string;
  reasoning: string;
}

export interface ReplanTriggeredPayload {
  step_id: string;
  action: "retry_same" | "retry_reformulated" | "skip_and_flag" | string;
  retry_count: number;
  reasoning: string;
  tool_name?: string;
  input_args?: Record<string, unknown>;
}

export interface StepCompletedPayload {
  step_id: string;
  status: "completed" | "skipped" | "failed" | string;
  result_ref?: string | null;
  completed_at?: string;
}

export interface ReportReadyPayload {
  report_id: string;
  content_markdown: string;
  created_at?: string;
}

export interface RunCompletedPayload {
  run_id: string;
  status: "complete" | string;
  completed_at: string;
  total_steps_executed?: number;
}

export interface RunFailedPayload {
  run_id: string;
  status: "failed" | string;
  error_message?: string;
  completed_at?: string;
}

export interface TraceEvent {
  id: string;
  type:
    | "catch_up"
    | "plan_created"
    | "step_started"
    | "tool_call_started"
    | "tool_call_result"
    | "observation_made"
    | "replan_triggered"
    | "step_completed"
    | "report_ready"
    | "run_completed"
    | "run_failed"
    | "connection_status";
  timestamp: string;
  step_id?: string;
  payload: Record<string, any>;
}

export const BACKEND_URL =
  process.env.NEXT_PUBLIC_BACKEND_URL || "http://localhost:8000";

export function getWebSocketUrl(runId: string): string {
  const backend = BACKEND_URL.replace(/\/+$/, "");
  let wsBase = backend;

  if (backend.startsWith("https://")) {
    wsBase = backend.replace("https://", "wss://");
  } else if (backend.startsWith("http://")) {
    wsBase = backend.replace("http://", "ws://");
  } else if (typeof window !== "undefined") {
    const protocol = window.location.protocol === "https:" ? "wss:" : "ws:";
    wsBase = `${protocol}//${backend}`;
  } else {
    wsBase = `ws://${backend}`;
  }

  return `${wsBase}/runs/${runId}/stream`;
}

export function extractReportPreview(markdown?: string | null, maxLength = 140): string {
  if (!markdown) return "";
  const lines = markdown.split("\n");
  for (const rawLine of lines) {
    const line = rawLine.trim();
    // Skip empty lines, headers, dividers, citations
    if (!line || line.startsWith("#") || line.startsWith("---") || line.startsWith("===") || line.startsWith(">")) {
      continue;
    }
    // Clean formatting
    const cleaned = line
      .replace(/\*\*(.*?)\*\*/g, "$1")
      .replace(/\*(.*?)\*/g, "$1")
      .replace(/\[(.*?)\]\(.*?\)/g, "$1")
      .replace(/`+(.*?)`+/g, "$1")
      .trim();

    if (cleaned.length > 20) {
      return cleaned.length > maxLength ? `${cleaned.slice(0, maxLength)}...` : cleaned;
    }
  }
  return "";
}

export async function createRun(goalText: string): Promise<RunResponse> {
  const cleanGoal = goalText ? goalText.trim() : "";
  if (!cleanGoal) {
    throw new Error("Research goal cannot be empty");
  }

  let response: Response;
  try {
    response = await fetch(`${BACKEND_URL}/runs`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ goal_text: cleanGoal }),
    });
  } catch (err) {
    throw new Error(
      `Unable to connect to backend server (${BACKEND_URL}). Please verify backend is running.`
    );
  }

  if (!response.ok) {
    let errorDetail = `Failed to create run (Status ${response.status})`;
    try {
      const data = await response.json();
      if (data.detail) {
        if (typeof data.detail === "string") {
          errorDetail = data.detail;
        } else if (Array.isArray(data.detail) && data.detail.length > 0) {
          errorDetail = data.detail.map((d: { msg?: string }) => d.msg || JSON.stringify(d)).join("; ");
        }
      }
    } catch {
      // Ignore JSON parse errors if response isn't JSON
    }
    throw new Error(errorDetail);
  }

  return response.json();
}

export async function getRun(runId: string): Promise<RunResponse> {
  let response: Response;
  try {
    response = await fetch(`${BACKEND_URL}/runs/${runId}`, {
      method: "GET",
      headers: {
        "Accept": "application/json",
      },
      cache: "no-store",
    });
  } catch {
    throw new Error(
      `Unable to connect to backend server (${BACKEND_URL}). Please verify backend is running.`
    );
  }

  if (!response.ok) {
    if (response.status === 404) {
      throw new Error(`Research run "${runId}" was not found.`);
    }
    throw new Error(`Failed to fetch run details (Status ${response.status})`);
  }

  return response.json();
}

export async function getRuns(): Promise<RunResponse[]> {
  let response: Response;
  try {
    response = await fetch(`${BACKEND_URL}/runs`, {
      method: "GET",
      headers: {
        "Accept": "application/json",
      },
      cache: "no-store",
    });
  } catch {
    throw new Error(
      `Unable to connect to backend server (${BACKEND_URL}). Please verify backend is running.`
    );
  }

  if (!response.ok) {
    throw new Error(`Failed to fetch research runs history (Status ${response.status})`);
  }

  return response.json();
}
