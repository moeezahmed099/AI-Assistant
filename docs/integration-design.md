# Integration Design Documentation

## Agent Module – Moeez

### Architecture Role
The Agent module operates as the final orchestration and synthesis stage in the integrated AI-Assistant pipeline. Rather than requiring raw payload transfers across network boundaries, the Agent receives only the `pipeline_run_id` and directly queries the shared relational database (PostgreSQL) for upstream outputs produced by the Vision and RAG modules.

The Agent is responsible for:
1. **Upstream State Assessment:** Inspecting Vision match confidence and RAG retrieval completeness/groundedness.
2. **Deterministic Decision Gating:** Applying explicit business rules to determine whether to proceed, search further, require human review, or flag incomplete pipelines.
3. **Autonomous Execution & Synthesis:** When authorized, executing the multi-step research cycle (planning, tool dispatch, evaluation, self-correction) and synthesizing the final Markdown diagnostic report.
4. **State Persistence:** Recording high-level run outcomes in `agent_runs` and granular step/action telemetry in `agent_actions`.

---

### The Four Decisions

| Decision | Trigger Criteria | Lifecycle & Architectural Behavior |
|---|---|---|
| `generate_report` | Confident Vision match + RAG grounded and complete | Initiates orchestrator execution, generates a comprehensive report, and marks the pipeline run complete. |
| `search_more_context` | Confident Vision match + RAG present but ungrounded or thin citations | Triggers targeted supplementary information gathering via agent web search or document tools. |
| `needs_review` | Vision match weak or below similarity threshold | Halts automatic finalization and marks status as `pending_review` for human expert confirmation. |
| `flag_incomplete` | Vision or RAG state missing entirely | Marks status as `flagged_incomplete` to prevent processing corrupted or premature pipeline runs. |

---

### Vector Store Tradeoff Note: Separate Vector Stores (FAISS + Qdrant) vs. pgvector

In this integration phase, the architecture intentionally retains separate specialized vector stores:
- **Vision Module:** Utilizes **FAISS** for fast, high-density in-memory image embedding search and visual nearest-neighbor matching.
- **RAG Module:** Utilizes **Qdrant** for filtered semantic chunk search, metadata payload querying, and document retrieval.

#### Rationale for Not Consolidating to pgvector in Phase 2:
1. **Modularity and Zero Disruption:** Both Vision and RAG have existing, fully tested, and optimized index pipelines. Forcing a migration to pgvector in this phase would create unnecessary friction, potential regressions, and delay contract verification.
2. **Domain-Specific Optimization:** FAISS excels at high-throughput visual feature space search, while Qdrant provides advanced payload filtering natively suited for document chunk metadata. A single generic store would compromise these domain-tuned capabilities.
3. **Loose Coupling via Relational State:** The modules coordinate through structured metadata and run references in the shared PostgreSQL database via `pipeline_run_id`, allowing each module to optimize its search backend independently while maintaining strict integration contracts.
