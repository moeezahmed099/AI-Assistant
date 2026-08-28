# Database Schema Documentation

## Agent Tables (Moeez)

The Agent module manages two core relational tables in the shared PostgreSQL database to persist pipeline execution states, decision outcomes, and detailed action traces.

### `agent_runs`
Stores the high-level execution metadata and synthesis outcome for an agent run within a given pipeline lifecycle.

| Column | Type | Constraints | Description |
|---|---|---|---|
| `pipeline_run_id` | UUID / VARCHAR(64) | NOT NULL, INDEX | Foreign reference identifying the parent pipeline execution. |
| `agent_run_id` | UUID / VARCHAR(64) | PRIMARY KEY | Unique identifier for this specific agent execution run. |
| `status` | VARCHAR(50) | NOT NULL | Execution status (`pending`, `in_progress`, `completed`, `pending_review`, `flagged_incomplete`, `failed`). |
| `decision` | VARCHAR(50) | NOT NULL | High-level decision: `generate_report`, `search_more_context`, `needs_review`, `flag_incomplete`. |
| `reason` | TEXT | NOT NULL | Human-readable explanation justifying the computed decision. |
| `created_at` | TIMESTAMPTZ | NOT NULL, DEFAULT NOW() | Timestamp when the agent run was initialized. |
| `completed_at` | TIMESTAMPTZ | NULLABLE | Timestamp when the agent execution finished. |

### `agent_actions`
Logs granular, step-by-step actions, tool calls, and observations during agent execution.

| Column | Type | Constraints | Description |
|---|---|---|---|
| `id` | UUID / VARCHAR(64) | PRIMARY KEY | Unique identifier for the individual action record. |
| `agent_run_id` | UUID / VARCHAR(64) | NOT NULL, FK -> `agent_runs.agent_run_id` | Reference linking the action back to its agent run. |
| `action_type` | VARCHAR(100) | NOT NULL | Type of action performed (e.g. `decision_rule_evaluation`, `tool_call`, `observation_evaluation`, `orchestrator_invoked`, `synthesize_report`). |
| `payload` | JSONB / JSON | NOT NULL | Structured payload detailing inputs, tool outputs, parameters, or execution artifacts. |
| `created_at` | TIMESTAMPTZ | NOT NULL, DEFAULT NOW() | Timestamp when the action occurred. |
