# AP Process Discovery Agent

> An AI agent that turns a raw description of an **Accounts Payable (AP) process**
> — typed, recorded, filmed, or written in a document — into a complete,
> business-ready automation assessment: a structured process map, ranked
> automation opportunities, a deterministic ROI projection, an editable BPMN
> diagram, and downloadable **PDD / SDD** Word documents.

The agent's job is **process discovery**: you give it a manual process as input,
and it produces a full report. Everything else in the product (chat, live voice
assistant, documents, public API) is built around that core pipeline.

---

## Table of contents

1. [What it does](#1-what-it-does)
2. [Architecture overview](#2-architecture-overview)
3. [The discovery pipeline](#3-the-discovery-pipeline)
4. [Repository structure](#4-repository-structure)
5. [Tech stack](#5-tech-stack)
6. [Prerequisites](#6-prerequisites)
7. [Environment variables](#7-environment-variables)
8. [Setup & run (step by step)](#8-setup--run-step-by-step)
9. [Quick CLI demo](#9-quick-cli-demo)
10. [Using the web app](#10-using-the-web-app)
11. [REST API reference](#11-rest-api-reference)
12. [Public developer API (named models)](#12-public-developer-api-named-models)
13. [Live voice avatar (Aria)](#13-live-voice-avatar-aria)
14. [Custom PDD / SDD templates](#14-custom-pdd--sdd-templates)
15. [Running the tests](#15-running-the-tests)
16. [Docker deployment](#16-docker-deployment)
17. [Troubleshooting](#17-troubleshooting)
18. [Team](#18-team)

---

## 1. What it does

| Capability | Description |
|-----------|-------------|
| **Multimodal input** | Accepts the process as **text**, a **Word doc** (`.docx`), an **audio** recording, or a **video** walkthrough. Audio/video are transcribed by Gemini before analysis. |
| **Process discovery pipeline** | A LangGraph pipeline extracts steps, structures them, scores each one for automation potential, and maps them to AP automation patterns. |
| **Deterministic ROI** | A pure-Python module computes implementation cost, annual savings, payback period, and FTE freed — grounded in discovery facts, not guessed by the LLM. |
| **BPMN diagram** | Generates an editable BPMN 2.0 diagram of the process; you can modify it in the UI. |
| **PDD / SDD documents** | Generates a Process Definition Document and Solution Design Document, downloadable as Word files — optionally rendered into **your own uploaded template** (logo, header/footer, fonts). |
| **Report chat** | Ask questions about, or request edits to, the generated report and documents. |
| **Live voice assistant** | “AP Discovery Live” — a real-time spoken conversation with a 3D anime avatar (Aria) powered by the Gemini Live API, with lip-sync. |
| **Audio overview** | Generates a narrated, multilingual audio summary of an assessment. |
| **History** | Every assessment is saved per-user and reloadable from a sidebar. |
| **Auth** | Email/password (JWT cookies) + “Continue with Google” + forgot-password OTP via email. |
| **Public developer API** | An `ap_sk_` key-authenticated `/v1/run` endpoint exposing the pipeline as named models. |

---

## 2. Architecture overview

This is a **monorepo** with two apps:

```
  Browser (React + Vite SPA)
        │  fetch / WebSocket  (cookies = JWT)
        ▼
  FastAPI backend  ─────────┐
   ├─ LangGraph discovery pipeline  ──▶ Google Gemini (LLM + multimodal + Live API)
   ├─ ROI math (pure Python)
   ├─ Document generator (python-docx)
   ├─ MongoDB  (users, assessments, documents, sessions, API keys)
   └─ Redis    (OTP / password-reset codes)
```

- **`backend/`** — FastAPI (Python). Hosts the pipeline, all REST endpoints, the
  WebSocket live-chat proxy, auth, persistence, and document generation.
- **`frontend/`** — React 19 + Vite SPA. In dev it proxies `/api` and `/ws` to
  the backend (see `frontend/vite.config.js`).

---

## 3. The discovery pipeline

Defined in `backend/graph/pipeline.py` as a LangGraph `StateGraph`. The shared
state object is `APProcessState` (`backend/graph/state.py`). Nodes run in order:

| # | Node (`backend/graph/nodes/`) | What it does | Uses LLM? |
|---|-------------------------------|--------------|-----------|
| 0 | `preprocess_media.py` | Routes by `input_format`. For audio/video it transcribes via Gemini; for `.docx` it extracts text; for text it passes through. | Audio/video/docx only |
| 1 | `parse_input.py` | Extracts steps, systems, roles, pain points, and **discovery facts** (currency, hourly rate, annual volume, FTE, exception rate). Normalizes currency symbols → ISO codes and flags missing critical facts. | Yes |
| 2 | `structure_process.py` | Turns raw steps into a structured process map (step number, role, I/O documents, systems, time, occurrence probability, manual flag). | Yes |
| 3 | `score_steps.py` | Scores each step (rule-based, data-structure, volume) into an **Automation Confidence Score (ACS)** = mean of the three; flags `is_priority` when ACS > 7. | Yes |
| 4 | `map_patterns.py` | Maps automatable steps to AP automation patterns, enriches them, and **ranks opportunities by probability-weighted labour value × effort-reduction**. | Yes |
| 5 | `calculate_roi.py` | Classifies the automation components needed, then calls the **deterministic** `utils/roi_math.py` to compute costs, savings, payback, and FTE freed. Has a safety net if the LLM returns nothing. | Component step only |
| 6 | `generate_summary.py` | Writes the executive summary, a reconciled project timeline, and assembles the final **markdown report**. | Yes |

The **ROI math is intentionally deterministic** (`utils/roi_math.py`): same input
→ same output, no network, no key. That's why it's the most heavily unit-tested
piece. The LLM-driven nodes are tested by **mocking the Gemini boundary** (see
[Running the tests](#15-running-the-tests)).

---

## 4. Repository structure

```
AlphaFold/
├─ README.md                  # this file
├─ LICENSE                    # MIT
├─ pyproject.toml             # project metadata
├─ requirements.txt           # backend deps (UTF-8, includes pytest)
├─ .env.example               # all env vars (copy to backend/.env)
├─ LIVE_AVATAR_README.md      # deep-dive: 3D voice avatar
├─ TEMPLATE_FEATURE_README.md # deep-dive: custom PDD/SDD templates
│
├─ demo/
│  └─ demo.py                 # CLI: run the pipeline on text/docx/audio/video
│
├─ tests/
│  ├─ conftest.py             # adds backend/ to sys.path, sets dummy keys
│  ├─ test_roi_math.py        # deterministic ROI unit tests
│  ├─ test_pipeline.py        # discovery nodes + full pipeline (Gemini mocked)
│  └─ test_media_processor.py # input-type detection
│
├─ backend/
│  ├─ main.py                 # FastAPI app: all routes + WebSocket + public API
│  ├─ config.py               # env, Gemini models, upload limits, extensions
│  ├─ Dockerfile              # container image for the backend
│  ├─ requirements.txt        # (original; UTF-16 — use the root one)
│  ├─ graph/
│  │  ├─ pipeline.py          # builds + compiles the LangGraph pipeline
│  │  ├─ state.py             # APProcessState TypedDict
│  │  ├─ models.py            # pydantic models for structured LLM output
│  │  └─ nodes/               # the 7 pipeline nodes (see section 3)
│  ├─ utils/
│  │  ├─ gemini_client.py     # Gemini text / structured / multimodal calls
│  │  ├─ media_processor.py   # detect_input_type + audio/video transcription
│  │  ├─ docx_parser.py       # extract text from .docx
│  │  ├─ roi_math.py          # deterministic ROI engine
│  │  ├─ auth.py              # JWT, bcrypt, cookie auth dependency
│  │  ├─ api_keys.py          # ap_sk_ key generate/hash/mask
│  │  ├─ template_store.py    # per-assessment PDD/SDD template storage
│  │  ├─ template_renderer.py # render generated content into your template
│  │  └─ email_sender.py      # SMTP OTP emails
│  ├─ routes/
│  │  └─ keys.py              # /api/keys CRUD (manage public API keys)
│  ├─ db/
│  │  ├─ mongo_client.py      # assessments, documents, sessions, API keys
│  │  ├─ user_client.py       # users collection
│  │  └─ redis_client.py      # OTP store
│  ├─ templates/              # uploaded .docx templates (gitkept)
│  └─ data/transcripts/       # sample AP transcript used by the demo
│
└─ frontend/
   ├─ package.json            # React 19, Vite, bpmn-js, three, etc.
   ├─ vite.config.js          # dev proxy for /api and /ws
   ├─ index.html
   └─ src/
      ├─ App.jsx              # routing + top-level state
      ├─ services/api.js      # all backend calls from the browser
      ├─ hooks/useMicRecorder.js
      └─ components/          # InputPanel, ReportView, FlowchartView,
                              # DocumentView, ChatView, LiveChat, Avatar3D,
                              # HistorySidebar, auth screens, etc.
```

> Note: the `backend/test*.py` and `backend/scratch/` files are ad-hoc developer
> scratch scripts. The maintained, CI-style tests live in the top-level
> **`tests/`** folder.

---

## 5. Tech stack

**Backend:** Python 3.11, FastAPI, Uvicorn, LangGraph + LangChain, Google GenAI
SDK (Gemini), MongoDB (PyMongo), Redis, python-docx, PyJWT, bcrypt, websockets.

**Frontend:** React 19, Vite, Tailwind CSS, `@xyflow/react` + `bpmn-js` +
`dagre` (diagrams), `three` + `@pixiv/three-vrm` + `@react-three/fiber` (3D
avatar), `recharts`, `react-markdown`, `@react-oauth/google`.

**External:** Google Gemini (LLM, multimodal transcription, TTS, Live API).

---

## 6. Prerequisites

- **Python 3.11+**
- **Node.js 18+** and npm
- **MongoDB** (local or Atlas connection string)
- **Redis** (only required for forgot-password OTP; the app runs without it otherwise)
- A **Google Gemini API key** with credits (required for all AI features and the Live API)
- *(Optional)* A Google OAuth Client ID for “Continue with Google”
- *(Optional)* SMTP credentials for password-reset emails

---

## 7. Environment variables

Copy `.env.example` to **`backend/.env`** and fill it in. Variables actually read
by the code:

| Variable | Required | Purpose |
|----------|----------|---------|
| `GEMINI_API_KEY` | **Yes** | All AI: transcription, structuring, scoring, summaries, BPMN, docs, TTS, and the Live API. |
| `MONGODB_URI` | **Yes** (for the web app) | Users, assessments, documents, live-chat sessions, API keys. The CLI demo does **not** need it. |
| `JWT_SECRET` | **Yes** | Signs auth cookies. Defaults to an insecure dev value — set a real secret. |
| `MAX_UPLOAD_SIZE_MB` | No (default `100`) | Max upload size for audio/video/doc. |
| `REDIS_URL` | For OTP | Stores forgot-password OTP codes. Default `redis://localhost:6379`. |
| `SMTP_HOST` / `SMTP_PORT` / `SMTP_USER` / `SMTP_PASS` | For OTP email | Sends password-reset codes. Defaults to Gmail SMTP host/port. |
| `GOOGLE_CLIENT_ID` | Optional | Enables “Continue with Google” login. |
| `ALLOWED_ORIGINS` | Optional | Comma-separated CORS allowlist. Defaults to the localhost dev ports. |
| `FRONTEND_URL` | Optional | Appended to the CORS allowlist if set. |

> The Gemini model names are set in `backend/config.py` (`GEMINI_MODEL_FAST`,
> `GEMINI_MODEL_QUALITY`). Adjust them there if you have access to different models.

**Frontend (`frontend/.env`):**

| Variable | Purpose |
|----------|---------|
| `VITE_API_URL` | Backend base URL for production builds. In dev, leave unset and the Vite proxy handles `/api`. |
| `VITE_AVATAR_URL` | Optional `.vrm` avatar URL (otherwise a local file is used). |

---

## 8. Setup & run (step by step)

### 8.1 Clone & enter the repo
```bash
git clone <your-repo-url>
cd AlphaFold
```

### 8.2 Backend
```bash
cd backend
python -m venv .venv
# Windows:  .venv\Scripts\activate
# macOS/Linux:  source .venv/bin/activate

# Install deps (use the clean root requirements file)
pip install -r ../requirements.txt

# Configure environment
cp ../.env.example .env        # then edit .env and add GEMINI_API_KEY, MONGODB_URI, JWT_SECRET

# Start the API (http://localhost:8000)
uvicorn main:app --reload --port 8000
```
Verify it's up: open <http://localhost:8000/api/health> → should return `{"status": "ok"}`.
Interactive API docs are at <http://localhost:8000/docs>.

### 8.3 Frontend
In a second terminal:
```bash
cd frontend
npm install
npm run dev        # http://localhost:5173
```
The dev server proxies `/api` and `/ws` to `http://127.0.0.1:8000`, so no extra
config is needed locally. Open <http://localhost:5173> and sign up.

### 8.4 (Optional) Redis for password reset
```bash
# Docker is the easiest way:
docker run -p 6379:6379 redis
```

---

## 9. Quick CLI demo

The fastest way to see the agent work end-to-end without the web app. **You pass
the input on the command line** — for an audio or video file you simply give its
PATH after `--file`, and the pipeline transcribes it with Gemini before analyzing.

```bash
# From the repo root, with backend deps installed and GEMINI_API_KEY set:

python demo/demo.py                                  # bundled sample transcript (text)
python demo/demo.py --text "Our AP team keys invoices into SAP..."   # inline text
python demo/demo.py --file path/to/notes.txt         # a .txt file
python demo/demo.py --file path/to/process.docx      # a Word document
python demo/demo.py --file path/to/interview.mp3     # an AUDIO recording (give its path)
python demo/demo.py --file path/to/walkthrough.mp4   # a VIDEO walkthrough (give its path)
```

The input type is **detected automatically from the file extension**:

| Type  | Extensions |
|-------|------------|
| audio | `.mp3` `.wav` `.m4a` `.ogg` `.webm` |
| video | `.mp4` `.webm` `.mov` |
| docs  | `.docx` |
| text  | `.txt` |

> **Where do I put the audio/video path?** On the terminal, right after `--file`.
> On Windows, wrap paths containing spaces in quotes, e.g.
> `python demo/demo.py --file "D:/recordings/ap walkthrough.mp4"`.
> Audio/video runs require `GEMINI_API_KEY` + network and take longer than text
> because the file is uploaded to Gemini and transcribed first.

The demo prints (for audio/video) a transcript preview, then the executive
summary, discovered steps, ranked opportunities, and the ROI projection.

---

## 10. Using the web app

1. **Sign up / log in** (email + password, or Continue with Google).
2. **Provide the process** in the input panel: paste text, upload a
   `.txt`/`.docx`/audio/video file, or **record your voice** with the mic button.
3. The agent runs the pipeline and may ask **follow-up questions** to fill in
   missing critical facts (currency, hourly rate, volume, FTE, exception rate).
4. **Review the assessment:** executive summary, process map table, scored steps,
   ranked automation opportunities, stats, and ROI.
5. **Inspect / edit the BPMN diagram** of the process flow.
6. **Generate PDD / SDD documents**, optionally after uploading your own Word
   template; then download them as `.docx`.
7. **Chat** with the assistant to ask questions or request edits to the report.
8. **Audio overview:** generate a narrated multilingual summary.
9. **AP Discovery Live:** start a real-time spoken conversation with the avatar.
10. **History sidebar:** revisit, reload, or delete past assessments.

---

## 11. REST API reference

All `/api/*` routes (except auth and health) require a valid JWT cookie, set by
login. Base URL in dev: `http://localhost:8000`.

**Auth**
| Method & path | Purpose |
|---|---|
| `POST /api/auth/signup` | Create an account |
| `POST /api/auth/login` | Log in (sets cookies) |
| `GET  /api/auth/check` | Validate session |
| `POST /api/auth/refresh` | Refresh the access token |
| `POST /api/auth/logout` | Clear cookies |
| `POST /api/auth/google` | Google OAuth login |
| `POST /api/auth/forgot-password` | Email an OTP |
| `POST /api/auth/verify-otp` | Verify the OTP |
| `POST /api/auth/reset-password` | Set a new password |

**Core analysis**
| Method & path | Purpose |
|---|---|
| `GET  /api/health` | Health check |
| `POST /api/transcribe` | Transcribe a recorded audio clip to text |
| `POST /api/analyze` | Run the full pipeline on `text` or an uploaded `file` |
| `POST /api/analyze/followup-questions` | Generate clarifying questions for missing facts |
| `POST /api/analyze/followup-answers` | Re-run analysis with the user's answers |

**History & assessment editing**
| Method & path | Purpose |
|---|---|
| `GET    /api/history` | List the user's assessments |
| `GET    /api/history/{id}` | Load one assessment |
| `DELETE /api/history/{id}` | Delete an assessment |
| `PUT    /api/history/{id}/bpmn` | Save edited BPMN XML |
| `PUT    /api/history/{id}/chat` | Save chat history |
| `PUT    /api/history/{id}/hourly-rate` | Update hourly rate (recomputes ROI) |
| `POST   /api/history/{id}/audio-overview` | Generate a narrated audio summary |

**Documents (PDD / SDD)**
| Method & path | Purpose |
|---|---|
| `POST   /api/history/{id}/upload-template` | Upload a custom `.docx` template (`file`, `doc_type`) |
| `GET    /api/history/{id}/template-status` | Check which templates exist |
| `DELETE /api/history/{id}/template` | Remove a template |
| `POST   /api/history/{id}/generate-document` | Generate PDD/SDD content |
| `POST   /api/history/{id}/update-document` | Apply edits to a document |
| `PUT    /api/history/{id}/document/{doc_type}` | Save document markdown |
| `POST   /api/history/{id}/download-document` | Download as `.docx` (uses your template if uploaded) |

**Diagrams & chat**
| Method & path | Purpose |
|---|---|
| `POST /api/flowchart/generate` | Generate a flowchart |
| `POST /api/flowchart/modify` | Modify a flowchart |
| `POST /api/chat` | Ask about / edit the report |

**Live voice chat**
| Method & path | Purpose |
|---|---|
| `POST   /api/analyze/live-chat` | Analyze a live-chat conversation |
| `POST/GET/DELETE /api/live-chat/session` | Manage the temporary live session |
| `POST   /api/live-chat/prepare-resume` | Prepare a resumable session |
| `WS     /api/ws/live-chat` | WebSocket proxy to the Gemini Live API |

**API-key management** (see next section): `GET/POST /api/keys`, `DELETE /api/keys/{id}`.

---

## 12. Public developer API (named models)

The pipeline is also exposed as a key-authenticated public API — useful for
integrating AP discovery into other systems.

1. **Create a key** (logged in, via the UI or `POST /api/keys`). The raw secret
   (`ap_sk_...`) is shown **exactly once**. Only a SHA-256 hash is stored.
2. **Call `/v1/run`** with the key as a Bearer token.

### Running in the Terminal

You can invoke the named models directly from your terminal using `curl` or `Invoke-RestMethod` (PowerShell).

#### Linux / macOS / Git Bash:
```bash
curl -X POST http://localhost:8000/v1/run \
  -H "Authorization: Bearer ap_sk_your_secret_key" \
  -H "Content-Type: application/json" \
  -d '{
    "model": "ap_analysis",
    "input": { "text": "Our AP process starts when an invoice arrives by email..." }
  }'
```

#### Windows Command Prompt (`cmd.exe`):
```cmd
curl -X POST http://localhost:8000/v1/run -H "Authorization: Bearer ap_sk_your_secret_key" -H "Content-Type: application/json" -d "{\"model\": \"ap_analysis\", \"input\": {\"text\": \"Our AP process starts when an invoice arrives by email...\"}}"
```

#### Windows PowerShell:
```powershell
$headers = @{
    "Authorization" = "Bearer ap_sk_your_secret_key"
    "Content-Type"  = "application/json"
}
$body = @{
    model = "ap_analysis"
    input = @{ text = "Our AP process starts when an invoice arrives by email..." }
} | ConvertTo-Json

Invoke-RestMethod -Uri "http://localhost:8000/v1/run" -Method Post -Headers $headers -Body $body
```

**Models:**
| `model` | Input | Output |
|---------|-------|--------|
| `ap_analysis` | `text`, or `file_b64` | Full structured analysis (steps, opportunities, ROI, summary) |
| `ap_bpmn` | `scored_steps`, an `analysis` object, or raw `text`/`file_b64` | BPMN 2.0 XML |
| `ap_pdd-sdd` | `doc_type` (`pdd`/`sdd`) + `analysis`, or raw `text`/`file_b64` | Generated document content |

A key can be scoped to specific models. The `ap_pdd-sdd` and `ap_bpmn` wrappers
reuse the **exact** in-app orchestration so output matches the web app.

---

## 13. Live voice avatar (Aria)

“AP Discovery Live” is a real-time spoken conversation streamed through the
backend WebSocket (`/api/ws/live-chat`) to the **Gemini Live API**, rendered with
a 3D **VRM** anime avatar that lip-syncs to the voice.

To show the cute avatar instead of the placeholder:
1. Download a free `.vrm` model (e.g. from VRoid Hub or Open Source Avatars).
2. Rename it to **`aria.vrm`**.
3. Place it at **`frontend/public/avatars/aria.vrm`**.
4. `npm run dev` and start a Live session.

Alternatively set `VITE_AVATAR_URL` in `frontend/.env`. Full details in
**`LIVE_AVATAR_README.md`**.

---

## 14. Custom PDD / SDD templates

Upload your own Word template (with logo, header/footer, fonts, and section
structure) and the generated PDD/SDD will follow **your** design instead of the
default layout. The backend reuses a copy of your template as the skeleton,
preserves its styles/header/footer, replaces the body with generated content, and
embeds the BPMN/flowchart images. Full details in
**`TEMPLATE_FEATURE_README.md`**.

---

## 15. Running the tests

```bash
# From the repo root, with backend deps installed:
pytest tests/ -v
```

The suite covers both halves of the agent:

- **`test_roi_math.py`** — the deterministic ROI engine (currency normalization,
  cost composition, payback, effort-reduction caps, missing-fact detection).
- **`test_pipeline.py`** — the discovery nodes and the **full pipeline**
  (input → complete report). Every Gemini call is **mocked**, so these run
  offline and deterministically while exercising the real graph wiring and
  transformation logic. The end-to-end test uses `pytest.importorskip("langgraph")`.
- **`test_media_processor.py`** — input-type detection for text/docx/audio/video.

`tests/conftest.py` adds `backend/` to the path and sets a dummy `GEMINI_API_KEY`
so modules that build the Gemini client at import time load cleanly under test.

---

## 16. Docker deployment

The backend ships with a `Dockerfile` (Python 3.11 slim):

```bash
cd backend
docker build -t ap-discovery-backend .
docker run -p 8080:8080 --env-file .env ap-discovery-backend
```

It starts Uvicorn with WebSocket support and honours the `$PORT` env var (so it
works on platforms like Railway/Render). Build the frontend with `npm run build`
and host the `dist/` output on any static host, pointing `VITE_API_URL` at the
backend.

---

## 17. Troubleshooting

| Symptom | Likely cause / fix |
|---------|--------------------|
| `GEMINI_API_KEY is not set` | Add it to `backend/.env` (the CLI demo loads `backend/.env`). |
| Login works but `/api/...` returns 401 | `JWT_SECRET` changed between restarts, or cookies blocked. Set a stable `JWT_SECRET`. |
| `Warning: MONGODB_URI is not set` | The web app needs MongoDB; set `MONGODB_URI`. The CLI demo does not. |
| Forgot-password email not sent | Set `REDIS_URL` + SMTP vars; for Gmail use an App Password. |
| Live avatar shows a pink placeholder | Add `frontend/public/avatars/aria.vrm` (see section 13). |
| Live session error about “Live API Key” / credits | Your Gemini key needs Live API access and credits. |
| CORS errors in the browser | Set `ALLOWED_ORIGINS` to include your frontend origin. |
| `pip install` issues with `backend/requirements.txt` | That file is UTF-16; install the clean root `requirements.txt` instead. |

---

## 18. Team

| Name | Role | Contact |
|------|------|---------|
| Robinpreet Singh | Full-Stack & AI Engineer | robinpreet.singh@auxiliobits.com |
| Sunaina | Full-Stack & AI Engineer | sunaina.aggarwal@auxiliobits.com |

---

_Built for the AuxiLabs hackathon. Licensed under the MIT License (see `LICENSE`)._
