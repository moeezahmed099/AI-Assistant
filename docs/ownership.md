## Agent Module  Moeez

- **Receives:** pipeline_run_id (reads Vision + RAG state from shared DB)
- **Returns:** decision (generate_report / search_more_context / needs_review / flag_incomplete) + reason
- **Owns DB tables:** agent_runs, agent_actions (contributes to module_events)
- **On failure:** status = agent_failed, returns error_code + error_message
- **Consumed by:** final report generation / dashboard
