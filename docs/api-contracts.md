# API Contracts Documentation

## Agent Contract (Moeez)

The Agent module acts as the downstream orchestrator that consumes upstream pipeline artifacts (Vision detection and RAG contextual retrieval) and computes an intelligent decision and final synthesis.

### Endpoint: `POST /api/v1/agent/run`

- **Description:** Triggers the Agent evaluation and orchestration for a specified pipeline run.
- **Data Access:** The caller provides only `pipeline_run_id`. The Agent service reads Vision and RAG state directly from the shared database.
- **Request Body:**
  ```json
  {
    "pipeline_run_id": "pipe-run-8f3a1b02-9c8d-4e5f-a1b2-c3d4e5f6a7b8"
  }
  ```
- **Response Model (`AgentRunResponse`):**
  ```json
  {
    "pipeline_run_id": "pipe-run-8f3a1b02-9c8d-4e5f-a1b2-c3d4e5f6a7b8",
    "agent_run_id": "agent-run-5a6b7c8d-9e0f-1a2b-3c4d-5e6f7a8b9c0d",
    "status": "completed",
    "decision": "generate_report",
    "reason": "Confident Vision match and RAG retrieved context is grounded and complete.",
    "actions": [
      {
        "action_type": "decision_rule_evaluation",
        "payload": {
          "pipeline_run_id": "pipe-run-8f3a1b02-9c8d-4e5f-a1b2-c3d4e5f6a7b8",
          "decision": "generate_report",
          "reason": "Confident Vision match and RAG retrieved context is grounded and complete.",
          "has_vision_data": true,
          "has_rag_data": true
        }
      }
    ]
  }
  ```

---

### Decision-Rule Table

| Condition | Decision | Description / Action |
|---|---|---|
| Confident Vision match + RAG grounded, complete | `generate_report` | Proceeds to full multi-step reasoning and report synthesis. |
| Confident Vision match + RAG present but not grounded / thin citations | `search_more_context` | Dispatches supplementary research tools to gather missing context. |
| Vision match weak/below similarity threshold | `needs_review` | Flags the item for manual human-in-the-loop verification. |
| Vision or RAG state missing entirely | `flag_incomplete` | Flags pipeline as incomplete due to missing upstream stage data. |

---

### Sample Paper-Trace

Below is a complete end-to-end paper trace demonstrating how the contract fields align across the pipeline for a single `pipeline_run_id`:

#### 1. Input Pipeline ID
`pipeline_run_id`: `"pipe-run-8f3a1b02-9c8d-4e5f-a1b2-c3d4e5f6a7b8"`

#### 2. Vision State in Shared DB
```json
{
  "pipeline_run_id": "pipe-run-8f3a1b02-9c8d-4e5f-a1b2-c3d4e5f6a7b8",
  "vision_run_id": "vis-run-01",
  "status": "completed",
  "matched_part": "P-10023-B",
  "similarity_score": 0.94,
  "confidence": 0.94,
  "is_confident": true,
  "bounding_box": [120, 85, 340, 290]
}
```

#### 3. RAG State in Shared DB
```json
{
  "pipeline_run_id": "pipe-run-8f3a1b02-9c8d-4e5f-a1b2-c3d4e5f6a7b8",
  "rag_run_id": "rag-run-01",
  "status": "completed",
  "grounded": true,
  "complete": true,
  "citation_count": 3,
  "citations": [
    "manuals/part_P10023_specifications.pdf",
    "catalogs/industrial_components_v2.pdf",
    "datasheets/replacement_guides.pdf"
  ],
  "context_chunks": [
    "Part P-10023-B is an industrial heavy-duty hydraulic actuator valve...",
    "Operating tolerance: -40C to 120C with maximum load threshold of 5000 PSI."
  ]
}
```

#### 4. Agent Endpoint Output (`POST /api/v1/agent/run`)
```json
{
  "pipeline_run_id": "pipe-run-8f3a1b02-9c8d-4e5f-a1b2-c3d4e5f6a7b8",
  "agent_run_id": "agent-run-5a6b7c8d-9e0f-1a2b-3c4d-5e6f7a8b9c0d",
  "status": "completed",
  "decision": "generate_report",
  "reason": "Confident Vision match and RAG retrieved context is grounded and complete.",
  "actions": [
    {
      "action_type": "decision_rule_evaluation",
      "payload": {
        "pipeline_run_id": "pipe-run-8f3a1b02-9c8d-4e5f-a1b2-c3d4e5f6a7b8",
        "decision": "generate_report",
        "reason": "Confident Vision match and RAG retrieved context is grounded and complete.",
        "has_vision_data": true,
        "has_rag_data": true
      }
    },
    {
      "action_type": "orchestrator_invoked",
      "payload": {
        "module": "backend.app.modules.agent.backend.agent.orchestrator",
        "status": "report_generation_ready"
      }
    }
  ]
}
```
