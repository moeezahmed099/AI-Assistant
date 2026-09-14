# Unified Internal AI Assistant

**Track:** Combined (Computer Vision + NLP/LLMs + Agentic AI)  
**Duration:** 3 Weeks (Weeks 4–6 of 6-Week Internship)  
**Team:** 
- **Muneeb Farooqi** — Computer Vision & Visual Search Lead
- **Faizan** — NLP, Knowledge Retrieval & RAG Lead
- **Moeez Ahmed** — Agentic AI, Orchestration & Gateway BFF Lead  
**Company:** Gitwork / Phebsoft  
**University Requirement:** Capital University of Science and Technology (CUST) — 6th Semester Internship  

---

## 1. Executive Summary & Overview

In Weeks 1–3, each team member developed an independent, specialized AI module:
1. **Computer Vision (Muneeb):** Scalable visual similarity search across a 44,119-item product catalog using FAISS vector indexing and deep embeddings.
2. **NLP & RAG (Faizan):** Grounded document question-answering with hybrid vector retrieval, Qdrant vector database, and hallucination verification.
3. **Agentic AI & Orchestration (Moeez):** Autonomous research agent with deterministic multi-factor decision rules, execution planning, and live WebSocket streaming.

For Weeks 4–6, all three systems were integrated into a **Unified Enterprise AI Assistant**. A user can upload an image or product query; the system visually identifies matching catalog products, pulls verified technical specifications and catalog documentation via RAG, and invokes an autonomous Agent that assesses data confidence, verifies citations, and determines the optimal downstream business action (`generate_report`, `search_more_context`, `needs_review`, or `flag_incomplete`).

---

## 2. System Architecture

The application adopts an **Asynchronous Backend-for-Frontend (BFF) Gateway pattern** built on FastAPI, SQLAlchemy, and PostgreSQL. Inter-module communication is completely decoupled through shared database tables and background polling with atomic state locking, preventing race conditions or tight in-memory coupling.

```mermaid
flowchart TD
    Client["Client (Web Browser / REST / WebSocket)"]

    subgraph GatewayBFF ["API Gateway & Orchestration BFF (Moeez)"]
        GWRouter["FastAPI Application & Gateway Router"]
        Poller["Background Orchestrator Poller (3s interval)"]
        WSServer["WebSocket Event Stream (/ws/pipeline/:id)"]
    end

    subgraph DataLayer ["Shared Persistence Layer (PostgreSQL - Supabase)"]
        T_Runs[("pipeline_runs")]
        T_Events[("module_events")]
        T_Extracted[("extracted_data")]
        T_RAG[("rag_documents")]
        T_Agent[("agent_runs & agent_actions")]
        T_Catalog[("catalog_items (44,119 rows)")]
    end

    subgraph VisionModule ["Vision Module (Muneeb)"]
        FAISS["FAISS IndexIDMap2 (512-dim)"]
        VModel["CLIP / MobileCLIP Vision Encoder"]
        VAdapter["Vision Adapter"]
    end

    subgraph RAGModule ["RAG Module (Faizan)"]
        Qdrant[("Qdrant Vector Cloud")]
        GeminiLLM["Gemini LLM (1.5 Flash / 3.5 Flash)"]
        HCheck["Hallucination & Groundedness Checker"]
    end

    subgraph AgentModule ["Agent Module (Moeez)"]
        Rules["Deterministic Decision Rules Engine"]
        Actions["Action Dispatcher & Report Generator"]
    end

    %% Workflow Steps
    Client -->|1. POST /api/v1/pipeline/run| GWRouter
    GWRouter -->|Initialize run: created| T_Runs
    GWRouter -->|Subscribe to trace events| WSServer
    WSServer -.->|Live updates| Client

    Client -->|2. POST /api/v1/gateway/run (Upload Image)| VisionModule
    VAdapter -->|Query similarity| FAISS
    VAdapter -->|Lookup metadata| T_Catalog
    VAdapter -->|Write match result| T_Extracted
    VAdapter -->|Update status: vision_complete| T_Runs

    Poller -->|3. Detects vision_complete (Atomic Claim)| T_Runs
    Poller -->|4. HTTP POST /api/v1/rag/process| RAGModule
    RAGModule -->|Query dense vectors| Qdrant
    RAGModule -->|Grounded synthesis| GeminiLLM
    RAGModule -->|Validate claims| HCheck
    RAGModule -->|Persist context & citations| T_RAG
    RAGModule -->|Update status: rag_complete| T_Runs

    Poller -->|5. Detects rag_complete (Atomic Claim)| T_Runs
    Poller -->|6. Invoke in-process run_agent()| AgentModule
    AgentModule -->|Read Vision & RAG records| DataLayer
    AgentModule -->|Evaluate 4-path rules| Rules
    AgentModule -->|Record audit trail| T_Agent
    AgentModule -->|Final status: agent_complete| T_Runs
    AgentModule -->|Emit EVENT_STATUS_UPDATED| WSServer
```

---

## 3. Shared Database Schema

The shared PostgreSQL database coordinates all state handoffs. Every stage transition is audited in `module_events` to ensure complete observability.

| Table Name | Primary Purpose | Primary Columns | Module Owner |
| :--- | :--- | :--- | :---: |
| **`pipeline_runs`** | Master lifecycle coordinator | `id (UUID)`, `status`, `user_id`, `created_at`, `updated_at` | Gateway (Moeez) |
| **`module_events`** | Granular audit trail & event log | `id`, `pipeline_run_id`, `module`, `event`, `message`, `payload (JSONB)`, `created_at` | Gateway (Moeez) |
| **`catalog_items`** | Production product catalog | `id`, `product_id`, `product_display_name`, `category`, `sub_category`, `article_type`, `base_colour`, `gender`, `season`, `usage` | Vision (Muneeb) |
| **`extracted_data`** | Vision intake match outputs | `id`, `pipeline_run_id`, `module`, `data_type`, `content (JSONB)`, `confidence`, `model` | Vision (Muneeb) |
| **`rag_documents`** | Grounded context & citations | `id`, `pipeline_run_id`, `source_extracted_data_id`, `content`, `metadata (JSONB)` | RAG (Faizan) |
| **`chat_history`** | RAG user/bot conversation | `id`, `pipeline_run_id`, `role`, `content`, `created_at` | RAG (Faizan) |
| **`agent_runs`** | Agent execution summary | `agent_run_id`, `pipeline_run_id`, `status`, `decision`, `reason`, `created_at`, `completed_at` | Agent (Moeez) |
| **`agent_actions`** | Granular agent actions log | `id`, `agent_run_id`, `action_type`, `payload (JSONB)`, `created_at` | Agent (Moeez) |

---

## 4. API Specification & Module Contracts

### 4.1. Gateway Lifecycle & Status Endpoints
* **`POST /api/v1/pipeline/run`**: Seeds a new pipeline run with status `created`.
* **`GET /api/v1/pipeline/run/{run_id}`**: Retrieves unified pipeline status, returning aggregated `vision_result`, `rag_result`, `agent_result`, and audit `events`.
* **`WS /ws/pipeline/{run_id}`**: WebSocket channel streaming initial catch-up snapshot (`catch_up`) followed by live module status updates (`status_updated`).
* **`GET /health`** / **`GET /api/v1/health`**: High-speed gateway liveness check (< 5ms response time).

### 4.2. Computer Vision Module Endpoints
* **`POST /search`**: Multi-part query image upload performing FAISS similarity search across 44,119 catalog items with metadata mapping.
* **`POST /api/v1/gateway/run`**: Canonical Gateway intake endpoint. Ingests image for a seeded `run_id`, saves match to `extracted_data`, and advances status to `vision_complete`.
* **`GET /catalog-images/{filename}`**: ORB-compliant static image delivery supporting Chromium Cross-Origin-Resource-Policy (`CORP: cross-origin`).
* **`GET /api/catalog/categories`**: Aggregates item counts and sample images by catalog category.

### 4.3. RAG Module Endpoints
* **`POST /api/v1/rag/process`**: Consumes `pipeline_run_id` and `extracted_data_id`. Converts vision match into search context, queries Qdrant `rag_documents`, generates verified summary via Gemini LLM, updates `rag_documents`, and sets status to `rag_complete`.
* **`POST /api/v1/rag/chat`**: Standalone conversational RAG endpoint over the knowledge base.

### 4.4. Agent Module Endpoints
* **`POST /api/v1/agent/run`**: Consumes `pipeline_run_id`, reads upstream state, evaluates deterministic decision rules, writes to `agent_runs`/`agent_actions`, updates pipeline status to `agent_complete`, and broadcasts results.

---

## 5. Agent Decision Rules Engine

The Agent operates on a strict multi-factor gating matrix, avoiding hallucinated branching:

$$\text{Decision Matrix}$$

```
                ┌────────────────────────────────────────────────────────┐
                │             Upstream Data Availability                 │
                └──────────────────────────┬─────────────────────────────┘
                                           │
                      ┌────────────────────┴────────────────────┐
                      ▼                                         ▼
            [ Missing State ]                          [ State Present ]
                      │                                         │
                      ▼                                         ▼
              flag_incomplete                        Vision Confidence Check
                                                                │
                                              ┌─────────────────┴─────────────────┐
                                              ▼                                   ▼
                                       [ Conf < 0.70 ]                     [ Conf ≥ 0.70 ]
                                              │                                   │
                                              ▼                                   ▼
                                         needs_review                   RAG Groundedness Check
                                                                                  │
                                                                ┌─────────────────┴─────────────────┐
                                                                ▼                                   ▼
                                                       [ Grounded & Complete ]             [ Thin / Ungrounded ]
                                                                │                                   │
                                                                ▼                                   ▼
                                                         generate_report                   search_more_context
```

1. **`flag_incomplete`**: Upstream Vision or RAG output is missing entirely, or upstream module reported unrecoverable failure.
2. **`needs_review`**: Vision match confidence is below the $0.70$ threshold (e.g., blurry or out-of-distribution image). Halts automated pipeline and requests human review.
3. **`search_more_context`**: Vision match is confident ($\ge 0.70$), but retrieved RAG context lacks citations or is ungrounded. Dispatches secondary search tool.
4. **`generate_report`**: Vision match is confident ($\ge 0.70$) and RAG context is verified grounded with complete citations. Synthesizes full product intelligence report.

---

## 6. Verification Evidence & Quality Assurance

The system underwent rigorous, automated end-to-end benchmarking. All tests were executed against the live remote PostgreSQL database and external AI services.

### 6.1. Verified Pipeline Benchmark Summary

| Test Phase | Component Tested | Result | Latency / Metrics | Details |
| :--- | :--- | :---: | :---: | :--- |
| **Startup** | Uvicorn Server Lifespan | **PASS** | 25.76 s | Process RSS: 134.39 MB. Poller & DB tables auto-initialized. |
| **Health API** | Gateway Endpoint `/health` | **PASS** | 4.18 ms | HTTP 200 `{"status":"healthy","version":"1.0.0"}` |
| **Database** | Supabase Remote PostgreSQL | **PASS** | ~50 ms | Verified 17 tables; 44,119 catalog rows verified. |
| **Vision Intake** | Search on `10003.jpg` | **PASS** | 48.5 ms | Rank 1: Nike White T-Shirt (`product_id: 10003`, score: `1.0`). |
| **RAG Knowledge** | Qdrant + Gemini LLM | **PASS** | 29.28 s | Queried Qdrant (30 vectors), synthesized grounded summary. |
| **Agent Gating** | Full Handshake | **PASS** | 10.99 s | State evaluated, decision logged, pipeline finished. |
| **Failure Path** | Simulated Downstream Outage | **PASS** | < 10 s | Bounded recovery, zero hangs, clean `flag_incomplete` status. |
| **Concurrency** | 5 Concurrent Health Requests | **PASS** | 2,665 ms avg | 100% success rate (5/5). Zero crashes. |
| **Concurrency** | 2 Concurrent Visual Searches | **PASS** | 8,203 ms avg | 100% success rate (2/2). Zero memory leaks. |

### 6.2. Production ONNX Runtime Memory Optimization (Render Free Tier)

To ensure zero out-of-memory (OOM) crashes on cloud free-tier hosting (specifically Render's strict 512 MB RAM ceiling), Visual Search was re-engineered to replace the heavy PyTorch runtime with a high-efficiency ONNX Runtime pipeline:

| Metric | Legacy PyTorch + OpenCLIP | Production ONNX Runtime (INT8) | Optimization Impact |
| :--- | :---: | :---: | :--- |
| **Model Artifact Size** | 351.8 MB (float32) | **88.9 MB** (`clip_vit_b32_vision_int8.onnx`) | **74.7% smaller** storage footprint |
| **Process Baseline RSS** | ~135 MB | **30.33 MB** | Clean startup without PyTorch C++ runtime |
| **Live Search Peak RSS** | **1,238.91 MB** | **278.23 MB** | **960.68 MB saved (77.5% RAM reduction)** |
| **Framework Overhead** | `torch`, `torchvision`, `open_clip`, `timm` | **Pure PIL + NumPy + ONNX Runtime** | Zero PyTorch imports (`sys.modules` clean) |
| **Render 512 MB Limit** | **FAILED (-726.9 MB deficit)** | **PASSED (+233.77 MB headroom)** | **Production ready for Render Free Tier** |
| **FAISS Compatibility** | ViT-B-32 (512-dim) | ViT-B-32 (512-dim) | **100% zero-drift alignment with 44k index** |

---

## 7. Setup & Local Installation

This section provides comprehensive instructions for running the complete full-stack Unified AI Assistant on your local machine (Windows, macOS, or Linux).

---

### 7.1. Prerequisites & System Requirements

Ensure you have the following installed on your system before proceeding:
* **Python:** Version `3.11` or higher (tested and verified on Python `3.11` to `3.13`).
* **Node.js:** Version `18.x` or higher (LTS recommended) along with `npm` `9.x+`.
* **Git:** For cloning and updating the repository.
* **Database Options:**
  * **Option A (Zero-Config / Local Fallback):** If no PostgreSQL connection is configured, the gateway **automatically falls back to a local SQLite database (`ai_assistant.db`)**. You can run the entire system offline without spinning up a database server!
  * **Option B (Production Supabase / PostgreSQL):** A PostgreSQL instance or free Supabase project if using shared cloud persistence.
* **API Keys (Optional for local visual search, required for LLM synthesis & web search):**
  * Google Gemini API Key (`GEMINI_API_KEY`) for RAG synthesis.
  * Tavily Search API Key (`SEARCH_API_KEY` or `TAVILY_API_KEY`) for secondary agent research.
  * Qdrant Cloud URL & API Key (for dense RAG vector search).

---

### 7.2. Fast-Track Quick Start (3 Steps)

If your environment is already set up with Python and Node.js:

```bash
# 1. Clone & Enter Project
git clone https://github.com/moeezahmed099/AI-Assistant.git
cd AI-Assistant/AI-Assistant

# 2. Start Backend (Terminal 1)
python -m venv venv
# Windows: .\venv\Scripts\activate | macOS/Linux: source venv/bin/activate
pip install -r requirements.txt
python -m uvicorn backend.app.gateway.main:app --host 127.0.0.1 --port 8000 --reload

# 3. Start Frontend (Terminal 2)
cd frontend
npm install
npm run dev
```

Open **`http://localhost:5173/dashboard`** in your browser to launch the Unified AI Assistant.

---

### 7.3. Detailed Step-by-Step Installation

#### Step 1: Clone the Repository

```bash
git clone https://github.com/moeezahmed099/AI-Assistant.git
cd AI-Assistant/AI-Assistant
```

#### Step 2: Configure Environment Variables

Create a `.env` file in the project root (or copy `.env.example`):

```bash
# On Windows (PowerShell):
Copy-Item .env.example .env

# On macOS / Linux:
cp .env.example .env
```

Open `.env` in your text editor and configure your credentials:

```env
# ============================================================================
# Database Configuration
# NOTE: If DATABASE_URL is left empty or commented out, the system will
# automatically use local SQLite (ai_assistant.db). Zero database setup needed!
# ============================================================================
DATABASE_URL=postgresql://postgres:[PASSWORD]@[HOST]:5432/postgres
SHARED_DATABASE_URL=postgresql://postgres:[PASSWORD]@[HOST]:5432/postgres
CATALOG_DATABASE_URL=postgresql://postgres:[PASSWORD]@[HOST]:5432/postgres

# ============================================================================
# External AI & API Keys
# ============================================================================
GEMINI_API_KEY=your_gemini_api_key_here
GEMINI_MODEL=gemini-3.5-flash-lite
SEARCH_API_KEY=your_tavily_search_api_key_here

# ============================================================================
# RAG Knowledge Base (Qdrant Vector Cloud)
# ============================================================================
QDRANT_URL=https://your-cluster-id.region.qdrant.tech:6333
QDRANT_API_KEY=your_qdrant_api_key_here

# Gateway Server Port
PORT=8000
```

> [!TIP]
> Also copy or link `.env` to `backend/.env` if running standalone module scripts:
> ```bash
> # Windows:
> Copy-Item .env backend/.env
> # Linux/macOS:
> cp .env backend/.env
> ```

#### Step 3: Set Up Python Backend & Download Artifacts

1. Create and activate a Python virtual environment:
   ```bash
   # Create virtual environment
   python -m venv venv

   # Activate on Windows (PowerShell):
   .\venv\Scripts\activate
   # (If execution is restricted, run: Set-ExecutionPolicy -Scope Process -ExecutionPolicy Bypass)

   # Activate on macOS / Linux:
   source venv/bin/activate
   ```

2. Install backend dependencies:
   ```bash
   pip install --upgrade pip
   pip install -r requirements.txt
   ```

3. Ensure FAISS Search Index & ONNX Models are present:
   * The repository already includes the INT8 quantized ONNX vision model (`artifacts/onnx/clip_vit_b32_vision_int8.onnx`).
   * If `artifacts/faiss/clip.index` is not present locally, download it automatically with:
     ```bash
     python scripts/download_faiss.py
     ```

4. Launch the Unified Backend Gateway:
   ```bash
   python -m uvicorn backend.app.gateway.main:app --host 127.0.0.1 --port 8000 --reload
   ```
   * The backend will start on **`http://127.0.0.1:8000`**.
   * Health endpoint: `http://127.0.0.1:8000/health`
   * Interactive Swagger Documentation: `http://127.0.0.1:8000/docs`

#### Step 4: Set Up and Launch Frontend

Open a second terminal window:

1. Navigate to the frontend directory:
   ```bash
   cd AI-Assistant/AI-Assistant/frontend
   ```

2. Install frontend dependencies:
   ```bash
   npm install
   ```

3. Start the Vite development server:
   ```bash
   npm run dev
   ```
   * The development server will start on **`http://localhost:5173`** (or `http://127.0.0.1:5173`).
   * By default, the frontend automatically proxies API calls to `http://127.0.0.1:8000`. If running the backend on a different port, set `VITE_API_BASE_URL=http://your-host:port` in `frontend/.env`.

---

### 7.4. Interactive Dashboard User Guide

Once both servers are running, navigate to:
👉 **`http://localhost:5173/dashboard`** (or click **"Dashboard"** in the top navigation bar).

The unified dashboard provides full interactive control over the 3-tier pipeline:

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                       UNIFIED AI ASSISTANT DASHBOARD                        │
├─────────────────────────────────────────────────────────────────────────────┤
│  [ Intake Section: Drag & Drop Query Image or Click Quick-Select Presets ]  │
│  Presets: [ Nike T-Shirt ] [ Puma Pants ] [ Fastrack Watch ] [ Navy Polo ]  │
│  Model Selector: (•) OpenCLIP (ViT-B/32)  ( ) ResNet-50                     │
├─────────────────────────────────────────────────────────────────────────────┤
│  Pipeline Tracker: [ 1. Vision: Done ] -> [ 2. RAG: Done ] -> [ 3. Agent ]   │
│  Current Run: e2e-run-9182  | Status: agent_complete | [ Advance Step > ]   │
├─────────────────────────────────────────────────────────────────────────────┤
│  [👁️ Vision Results]  [🧠 RAG Intelligence]  [🤖 Agent Actions]  [📄 Final Report]│
└─────────────────────────────────────────────────────────────────────────────┘
```

1. **Intake & Dropzone**:
   * **Drag & Drop** any image file (`.jpg`, `.png`, `.webp`) onto the upload zone, or click **"Browse Files"**.
   * Or click any of the **4 Quick-Select Presets** (*Nike T-Shirt*, *Puma Track Pants*, *Fastrack Watch*, *Navy Polo*) for instant, zero-upload testing.
   * Click **"Run Full Pipeline"** to seed a new pipeline run ID and trigger the end-to-end flow.

2. **Stage Progression & Stepper**:
   * Observe real-time progress indicators: `created` $\to$ `vision_complete` $\to$ `rag_complete` $\to$ `agent_complete`.
   * Use manual **"Advance to Next Stage"** buttons to step through the pipeline incrementally if desired.
   * Switch between past runs using the **Pipeline Run Switcher** dropdown.

3. **Multi-Tab Inspection**:
   * **👁️ Vision Results Tab**: Displays the top-1 primary catalog match along with similarity score, catalog product details, and the top-10 candidate match gallery.
   * **🧠 RAG Intelligence Tab**: Shows the grounded knowledge summary, groundedness verification badge (with confidence score), and verified catalog citations. Includes a standalone question-answering box.
   * **🤖 Agent Actions Tab**: Displays the deterministic decision matrix evaluation, policy rationale, and tool execution traces.
   * **📄 Final Executive Report Tab**: Consolidates findings from all three stages into a structured, executive-ready dossier with:
     * **Download Markdown (`.md`)**: Downloads a formatted report file directly to your machine.
     * **Copy to Clipboard**: Copies the full GitHub-flavored markdown report.
     * **Print / Save as PDF**: Formatted print view for instant PDF export.

---

### 7.5. Automated Verification & Smoke Tests

Verify that your local installation is functioning properly with these quick tests:

1. **Gateway Health Check:**
   ```bash
   curl http://127.0.0.1:8000/health
   # Expected response: {"status":"healthy","version":"1.0.0"}
   ```

2. **Initialize a Pipeline Run:**
   ```bash
   curl -X POST http://127.0.0.1:8000/api/v1/pipeline/run
   # Expected response: {"pipeline_run_id":"<uuid>","status":"created",...}
   ```

3. **Inspect Active Pipeline Runs:**
   ```bash
   curl http://127.0.0.1:8000/api/v1/pipeline/runs
   ```

4. **Run Backend Test Suites:**
   ```bash
   pytest backend/app/gateway/tests/
   ```

5. **Verify Frontend Production Build:**
   ```bash
   cd frontend
   npm run build
   # Should transform modules and generate dist/ assets with zero errors
   ```

---

### 7.6. Troubleshooting & Common Pitfalls

| Issue | Likely Cause | Solution |
| :--- | :--- | :--- |
| **`scripts execution is disabled on this system`** | Windows PowerShell security policy | Run `Set-ExecutionPolicy -Scope Process -ExecutionPolicy Bypass` in your PowerShell window, then reactivate the venv. |
| **`Port 8000 or 5173 is already in use`** | A lingering server instance is active | Identify and stop the process: `netstat -ano \| findstr :8000` followed by `taskkill /F /PID <PID>`, or start on a different port: `--port 8001`. |
| **`clip.index not found`** | FAISS index has not been fetched | Run `python scripts/download_faiss.py` to automatically download the 512-dim index into `artifacts/faiss/clip.index`. |
| **`Database connection timeout or SSL error`** | Supabase connection pooler paused or unreachable | Leave `DATABASE_URL` blank in `.env` — the gateway will automatically fall back to local SQLite (`ai_assistant.db`) without any external dependencies. |
| **`Cross-Origin Request Blocked (CORS)`** | Frontend origin mismatch | The backend gateway is pre-configured to accept `http://localhost:5173` and `http://127.0.0.1:5173`. Ensure your browser URL matches one of these origins. |
| **`Out of Memory (OOM) on Free Tier`** | Running legacy PyTorch models | The production codebase uses the INT8 quantized ONNX runtime (`clip_vit_b32_vision_int8.onnx`), requiring only ~278 MB peak RAM (comfortably below Render's 512 MB ceiling). |

> [!NOTE]
> **Deployment Status:** Cloud deployment to Render is currently in progress. All team members, supervisors, and evaluators can run the full system locally following the steps above.

---

## 8. Individual Contributions

### Moeez Ahmed (Agentic AI & Integration Lead)
* **Architecture & BFF Gateway**: Designed and developed `backend/app/gateway/main.py` and `router.py`, unifying the three independent modules into a single FastAPI backend with centralized CORS and lifespan hooks.
* **Production Memory Optimization**: Re-architected `app/services/embedding_service.py` to use dynamic INT8 ONNX Runtime with pure PIL/NumPy transforms, slashing peak RAM from 1,238 MB to 278 MB (77.5% reduction) and unlocking Render 512 MB Free Tier deployment with zero PyTorch overhead.
* **Orchestration Poller**: Authored `backend/app/gateway/orchestrator_poller.py`, implementing autonomous background stage transitions (`vision_complete` $\to$ `rag_processing` $\to$ `rag_complete` $\to$ `agent_complete`) using atomic database locks.
* **Database Schema Design**: Defined SQLAlchemy models (`backend/app/gateway/models.py`) for shared execution tracking (`pipeline_runs`, `module_events`, `agent_runs`, `agent_actions`).
* **Deterministic Decision Engine**: Implemented `backend/app/modules/agent/adapter.py`, implementing multi-factor decision logic evaluating Vision similarity thresholds and RAG groundedness metrics.
* **WebSocket Real-Time Channel**: Built `/ws/pipeline/{run_id}` streaming live execution events and catch-up snapshots to frontend consumers.
* **QA & Benchmarking**: Authored end-to-end regression test suites verifying failure-path resilience, latency, and memory profiling.

### Muneeb Farooqi (Computer Vision Lead)
* **Visual Search Engine**: Exported and indexed 44,119 catalog items using deep visual encoders and FAISS `IndexIDMap2` vector space.
* **Catalog Ingestion & ORB Protection**: Implemented static asset delivery (`/catalog-images/{filename}`) with standard `Cross-Origin-Resource-Policy` headers to prevent modern browser ORB blocking.
* **Vision Integration Adapter**: Authored `app/modules/vision/adapter.py` mapping query images to structured product entities and persisting primary matches to `extracted_data`.
* **Frontend Shell**: Developed the initial Vite/React navigation and visual search interface.

### Faizan (NLP & RAG Lead)
* **Hybrid Vector Retrieval**: Designed hybrid dense-sparse retrieval combining Qdrant vector similarity with BM25 keyword matching.
* **Groundedness & Anti-Hallucination**: Authored `app/services/hallucination_check.py` to verify that generated responses cite verified documentation before returning answers.
* **RAG Integration Adapter**: Built `app/modules/rag/adapter.py` and `writes.py`, mapping Vision's extracted attributes into plain-text search context and saving summaries into `rag_documents`.

---

## 9. Final Release Checklist

- [x] Single shared PostgreSQL database schema in active use by all modules
- [x] Written API contracts followed in code (`vision-rag-contract.md`, `contracts.py`)
- [x] End-to-end pipeline verified live: Image Upload $\to$ Vision Intake $\to$ RAG Grounding $\to$ Agent Decision
- [x] Graceful degradation and bounded recovery verified under simulated failure
- [x] Module ownership clearly traceable in codebase and documentation
- [x] All secrets excluded from source code; `.env.example` provided
- [x] Complete 6-minute joint presentation script documented and rehearsed
