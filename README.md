# AP Process Discovery Agent

An agent that takes an **Accounts Payable (AP) process description** as input and
produces a **structured process map**, **automation candidate scores (ACS)**, a
**ranked list of automation opportunities**, a **deterministic ROI projection**,
and an **executive summary** as output.

The core is a [LangGraph](https://langchain-ai.github.io/langgraph/) pipeline.
It runs as a standalone Python tool — **no database, no Docker, no auth, no cloud
services**. Just clone, add one API key, and run one command.

```
AP transcript / document  ->  [ LangGraph pipeline ]  ->  Process map (JSON)
                                                          ACS scores
                                                          Opportunity rankings
                                                          Deterministic ROI
                                                          Executive summary
```

---

## Quickstart (under 5 minutes)

```bash
# 1. Clone and enter the repo
git clone <your-repo-url>
cd ap-process-discovery

# 2. (Recommended) create a virtual environment
python -m venv .venv && source .venv/bin/activate   # Windows: .venv\Scripts\activate

# 3. Install dependencies
pip install -r requirements.txt

# 4. Configure ONE LLM provider
cp .env.example .env
#   then edit .env and set either:
#     LLM_PROVIDER=gemini     + GEMINI_API_KEY=...
#   or
#     LLM_PROVIDER=anthropic  + ANTHROPIC_API_KEY=...

# 5. Launch the Gradio app
python app.py
```

Open the printed local URL (default http://localhost:7860). Click
**“Load sample transcript”**, then **“Analyze process”**.

Prefer the terminal? Run the same pipeline as a CLI:

```bash
python run_cli.py                       # uses the bundled sample transcript
python run_cli.py --file my_notes.docx  # .txt / .md / .docx / .pdf
python run_cli.py --text "Our AP team receives invoices by email..."
python run_cli.py --json result.json    # also save the full JSON result
```

---

## Configuration

All configuration is via `.env` (see `.env.example`):

| Variable | Description | Default |
| --- | --- | --- |
| `LLM_PROVIDER` | `gemini` or `anthropic` | `gemini` |
| `GEMINI_API_KEY` | Google Gemini key (if using Gemini) | — |
| `GEMINI_MODEL` | Gemini model id | `gemini-2.0-flash` |
| `ANTHROPIC_API_KEY` | Anthropic key (if using Anthropic) | — |
| `ANTHROPIC_MODEL` | Claude model id | `claude-3-5-sonnet-latest` |
| `ENABLE_LIVE_PRICING` | Fetch live component prices (Gemini only) | `false` |
| `DEFAULT_PRICING_REGION` | Region for pricing benchmarks | `US` |

The pipeline works identically with either provider — the model choice is fully
abstracted behind `utils/llm.py`.

---

## How it works — the tools (pipeline steps)

The LangGraph pipeline (`graph/pipeline.py`) runs six steps in sequence. Each
step is a self-contained “tool”:

| # | Step (`graph/nodes/`) | What it does |
| --- | --- | --- |
| 1 | **parse_input** | Extracts the raw AP steps, systems, roles, pain points, and quantitative *discovery facts* (volume, FTE, currency, exception rate, approval matrix…) from the transcript. Never invents figures — missing facts are flagged. |
| 2 | **structure_process** | Normalizes the raw steps into a clean, ordered **process map** with inputs, outputs, systems, and actors per step. |
| 3 | **score_steps** | Assigns each step an **Automation Candidate Score (ACS)** based on rule-based-ness, structure of data, volume, and standardization. |
| 4 | **map_patterns** | Maps high-scoring steps to known **AP automation patterns** (e.g. OCR/IDP, 3-way match, rules engine) and estimates effort reduction. |
| 5 | **calculate_roi** | The **deterministic ROI module** — pure Python math (no LLM guessing on the numbers) that turns the facts + patterns into labour savings, implementation cost, net savings, and payback. |
| 6 | **generate_summary** | Produces the **executive summary**, a project timeline, and a full Markdown report. |

### The deterministic ROI module

`utils/roi_math.py` is kept exactly as designed: a dependency-free, fully
deterministic calculator (currency normalization, FX conversion, cost/benefit
and payback math). It does **not** call an LLM for the numbers, so ROI output is
reproducible. Optional live component pricing (`utils/pricing.py`) is **off by
default** and falls back to an offline benchmark table, so the tool always runs
without network access beyond the LLM call itself.

---

## Sample input and output

**Input** (excerpt from `data/sample_transcript.txt`):

```
Interviewer: Can you walk me through your current Accounts Payable process?
AP Clerk (Sarah): It starts when invoices arrive. We receive most of them via
email as PDF attachments... I manually key in all the header and line item data
into SAP. We process about 200 to 250 invoices a week... I have to do a 3-way
match... anything over $1,000 has to be approved by a department manager...
```

**Output** (shape produced by the pipeline):

```jsonc
{
  "process_map": [
    { "step": 1, "name": "Receive invoices via email", "system": "Email", "actor": "AP Clerk" },
    { "step": 2, "name": "Manual data entry into SAP", "system": "SAP", "actor": "AP Clerk" }
    // ...
  ],
  "scored_steps": [
    { "step_name": "Manual data entry into SAP", "acs_score": 92, "rationale": "..." }
  ],
  "opportunities": [
    { "step_name": "Manual data entry into SAP", "ap_pattern": "OCR / IDP", "effort_reduction_pct": 80 }
  ],
  "roi_estimate": {
    "annual_labor_savings": 48000, "net_annual_savings": 31000,
    "payback_months": 7, "effort_reduction_pct": 65, "currency_symbol": "$"
  },
  "executive_summary": "The AP process is heavily manual, with data entry and 3-way matching as the top automation targets..."
}
```

In the Gradio UI these appear in the **Process Map**, **ACS Scores**,
**Opportunities**, and **Executive Summary** tabs.

---

## Project structure

```
ap-process-discovery/
├─ app.py                 # Gradio interface (python app.py)
├─ run_cli.py             # Command-line demo
├─ config.py              # .env-driven configuration (provider, models, pricing)
├─ requirements.txt
├─ .env.example
├─ data/
│  └─ sample_transcript.txt
├─ graph/
│  ├─ pipeline.py         # LangGraph StateGraph (the core asset)
│  ├─ state.py            # Pipeline state schema
│  ├─ models.py           # Pydantic data models
│  └─ nodes/              # The six pipeline steps (tools)
└─ utils/
   ├─ llm.py              # Provider-agnostic LLM client (Gemini / Anthropic)
   ├─ roi_math.py         # Deterministic ROI module (no external deps)
   ├─ pricing.py          # Optional live pricing w/ deterministic fallback
   └─ document_parser.py  # .txt / .md / .docx / .pdf ingestion
```

## What was intentionally left out

Per the AuxiLab publishing standard, this repository is the **pipeline only**.
The following were removed and are not required to run the tool: MongoDB, Redis,
Docker, Google OAuth, the React frontend, the FastAPI server, the voice avatar,
the BPMN editor, multilingual audio, PDD/SDD Word export, and developer API keys.

## License

See [LICENSE](LICENSE).


---

## Built By

| Name | GitHub |
|------|--------|
| Sunaina Aggarwal | [@SunainaAggarwal-Auxi](https://github.com/SunainaAggarwal-Auxi) |
| Robinpreet Singh | [@robinpreetsingh-16](https://github.com/robinpreetsingh-16) |

Built during the **AuxiLab Founding Hackathon** by [Auxiliobits Technologies](https://auxiliobits.com) · [AuxiLab Catalogue](https://auxiliobits.com/auxilab)
