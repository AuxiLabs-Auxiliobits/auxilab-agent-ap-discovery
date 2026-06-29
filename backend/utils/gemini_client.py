import time
from google import genai
from google.genai import types
from config import GEMINI_API_KEY, GEMINI_MODEL, GEMINI_LIVE_API_KEY

# Initialize the clients
client = genai.Client(api_key=GEMINI_API_KEY)
live_client = genai.Client(api_key=GEMINI_LIVE_API_KEY) if GEMINI_LIVE_API_KEY else client


def call_gemini_text(prompt: str, system_prompt: str = "", model: str = None, use_live_key: bool = False) -> str:
    """Simple text-to-text Gemini call."""
    model = model or GEMINI_MODEL
    config = {
        "temperature": 0.0,
    }
    if system_prompt:
        config["system_instruction"] = system_prompt

    active_client = live_client if use_live_key else client
    try:
        response = active_client.models.generate_content(
            model=model,
            contents=prompt,
            config=types.GenerateContentConfig(**config) if config else None,
        )
    except Exception as e:
        if use_live_key and active_client is not client:
            print(f"Warning: Live key call failed ({e}). Falling back to default API key.")
            response = client.models.generate_content(
                model=model,
                contents=prompt,
                config=types.GenerateContentConfig(**config) if config else None,
            )
        else:
            raise
    return response.text


def call_gemini_structured(
    prompt: str,
    system_prompt: str = "",
    response_schema: dict = None,
    model: str = None,
) -> dict:
    """Gemini call that returns structured JSON output."""
    import json
    model = model or GEMINI_MODEL

    config = {
        "response_mime_type": "application/json",
        "temperature": 0.0,
    }
    if system_prompt:
        config["system_instruction"] = system_prompt
    if response_schema:
        config["response_schema"] = response_schema

    response = client.models.generate_content(
        model=model,
        contents=prompt,
        config=types.GenerateContentConfig(**config),
    )
    return json.loads(response.text)


def call_gemini_grounded(prompt: str, system_prompt: str = "", model: str = None) -> str:
    """Text generation grounded with real-time Google Search results.

    Used ONLY to fetch up-to-date pricing inputs (tool/license costs, regional
    developer rates). Grounding is enabled via the google_search tool. Returns
    the model's raw text; callers parse JSON leniently and fall back on error.
    """
    model = model or GEMINI_MODEL
    config = {
        "temperature": 0.0,
        "tools": [types.Tool(google_search=types.GoogleSearch())],
    }
    if system_prompt:
        config["system_instruction"] = system_prompt
    response = client.models.generate_content(
        model=model,
        contents=prompt,
        config=types.GenerateContentConfig(**config),
    )
    return response.text


def call_gemini_multimodal(file_path: str, prompt: str, model: str = None) -> str:
    """Upload a media file (audio/video) to Gemini and get a text response."""
    model = model or GEMINI_MODEL

    # Upload the file
    uploaded_file = client.files.upload(file=file_path)

    # Wait for file to be processed
    while uploaded_file.state == "PROCESSING":
        time.sleep(2)
        uploaded_file = client.files.get(name=uploaded_file.name)

    if uploaded_file.state == "FAILED":
        raise ValueError(f"File processing failed: {uploaded_file.name}")

    # Generate content with the file
    response = client.models.generate_content(
        model=model,
        contents=[uploaded_file, prompt],
        config=types.GenerateContentConfig(temperature=0.0),
    )

    # Clean up the uploaded file
    try:
        client.files.delete(name=uploaded_file.name)
    except Exception:
        pass  # Non-critical cleanup

    return response.text


def transcribe_audio_bytes(file_path: str, prompt: str, mime_type: str = "audio/webm", model: str = None, use_live_key: bool = False) -> str:
    """Transcribe audio by sending raw bytes inline to Gemini (no File API upload).
    
    This is more reliable for short browser-recorded clips than the File Upload API.
    """
    model = model or GEMINI_MODEL

    # Read the audio file as bytes
    with open(file_path, "rb") as f:
        audio_bytes = f.read()

    # Create an inline audio part
    audio_part = types.Part.from_bytes(data=audio_bytes, mime_type=mime_type)

    # Generate content with inline audio
    active_client = live_client if use_live_key else client
    try:
        response = active_client.models.generate_content(
            model=model,
            contents=[audio_part, prompt],
            config=types.GenerateContentConfig(temperature=0.0),
        )
    except Exception as e:
        if use_live_key and active_client is not client:
            print(f"Warning: Live key transcription failed ({e}). Falling back to default API key.")
            response = client.models.generate_content(
                model=model,
                contents=[audio_part, prompt],
                config=types.GenerateContentConfig(temperature=0.0),
            )
        else:
            raise

    return response.text


def _split_into_tts_chunks(text: str, max_chars: int = 2800) -> list:
    """Split text into chunks at sentence boundaries for multi-chunk TTS."""
    if len(text) <= max_chars:
        return [text]

    chunks = []
    remaining = text.strip()
    while remaining:
        if len(remaining) <= max_chars:
            chunks.append(remaining)
            break
        segment = remaining[:max_chars]
        # Find the last sentence-ending character within this segment
        best = -1
        for sep in ('. ', '! ', '? ', '।', '。', '\n'):
            idx = segment.rfind(sep)
            if idx > best:
                best = idx
        if best > max_chars * 0.4:
            cut = best + 2  # include the terminator + space
        else:
            cut = max_chars  # no good boundary — hard cut
        chunks.append(remaining[:cut].strip())
        remaining = remaining[cut:].strip()
    return chunks


def call_gemini_tts(text: str, voice_name: str = "Kore", use_live_key: bool = False) -> bytes | None:
    """Convert text to speech using Gemini TTS via the REST API.

    Automatically splits long scripts into ~2800-char chunks at sentence
    boundaries, calls TTS for each chunk, and concatenates the raw PCM bytes
    into one continuous audio stream — enabling audio of any desired length.

    Returns raw PCM bytes (24kHz, 16-bit, mono) ready to be wrapped in a WAV file.
    """
    import base64
    import json
    import urllib.request
    import urllib.error

    api_key = GEMINI_API_KEY
    models_to_try = [
        "gemini-2.5-flash-preview-tts",
        "gemini-2.5-pro-preview-tts",
        "gemini-3.1-flash-tts-preview",
    ]

    def _call_single_chunk(chunk_text: str) -> bytes:
        """Call TTS REST API for one text chunk; try models in order."""
        payload = {
            "contents": [{"parts": [{"text": chunk_text}]}],
            "generationConfig": {
                "responseModalities": ["AUDIO"],
                "speechConfig": {
                    "voiceConfig": {
                        "prebuiltVoiceConfig": {
                            "voiceName": voice_name
                        }
                    }
                }
            }
        }
        data = json.dumps(payload).encode("utf-8")
        last_err = None
        for model in models_to_try:
            url = (
                f"https://generativelanguage.googleapis.com/v1beta"
                f"/models/{model}:generateContent?key={api_key}"
            )
            req = urllib.request.Request(
                url, data=data, headers={"Content-Type": "application/json"}
            )
            try:
                with urllib.request.urlopen(req, timeout=120) as resp:
                    result = json.loads(resp.read().decode("utf-8"))
                    candidates = result.get("candidates", [])
                    if candidates:
                        parts = candidates[0].get("content", {}).get("parts", [])
                        for part in parts:
                            if "inlineData" in part:
                                audio_b64 = part["inlineData"]["data"]
                                print(f"[TTS] OK model={model} chunk={len(chunk_text)}chars")
                                return base64.b64decode(audio_b64)
            except urllib.error.HTTPError as e:
                body = e.read().decode("utf-8", errors="replace")
                print(f"[TTS] HTTPError {model}: {e.code} — {body[:200]}")
                last_err = Exception(f"{e.code} {body[:200]}")
            except Exception as e:
                print(f"[TTS] Error {model}: {e}")
                last_err = e
        if last_err:
            raise last_err
        raise RuntimeError("TTS returned no audio data for this chunk")

    # Split into chunks and concatenate raw PCM bytes
    chunks = _split_into_tts_chunks(text, max_chars=2800)
    print(f"[TTS] Generating audio in {len(chunks)} chunk(s) for {len(text)} total chars")

    all_pcm = b""
    for i, chunk in enumerate(chunks):
        print(f"[TTS] Processing chunk {i+1}/{len(chunks)}: {len(chunk)} chars")
        pcm = _call_single_chunk(chunk)
        all_pcm += pcm

    return all_pcm if all_pcm else None


def call_gemini_image(prompt: str) -> bytes | None:
    """Generate a flowchart / diagram image using Gemini's image generation model.

    Tries gemini-3.1-flash-image first, then falls back. Returns raw PNG bytes, or None on any failure.
    """
    import base64

    # Models to try in order
    models_to_try = [
        "gemini-3.1-flash-image",
        "gemini-3.1-flash-image-preview",
        "gemini-2.5-flash-image",
        "imagen-4.0-generate-001",
        "gemini-2.0-flash-exp",
    ]

    for model_name in models_to_try:
        try:
            print(f"[ImageGen] Trying model: {model_name}")
            response = client.models.generate_content(
                model=model_name,
                contents=prompt,
                config=types.GenerateContentConfig(
                    response_modalities=["IMAGE", "TEXT"],
                    temperature=1.0,
                ),
            )

            # Log response structure for debugging
            if not response.candidates:
                print(f"[ImageGen] {model_name}: No candidates returned")
                continue

            for c_idx, candidate in enumerate(response.candidates):
                if not candidate.content or not candidate.content.parts:
                    print(f"[ImageGen] {model_name}: candidate[{c_idx}] has no parts")
                    continue

                for p_idx, part in enumerate(candidate.content.parts):
                    print(f"[ImageGen] {model_name}: part[{p_idx}] "
                          f"has_text={bool(part.text)} "
                          f"has_inline_data={bool(part.inline_data)}")

                    if part.inline_data:
                        mime = getattr(part.inline_data, 'mime_type', '')
                        print(f"[ImageGen] {model_name}: inline_data mime={mime} "
                              f"data_type={type(part.inline_data.data).__name__} "
                              f"data_len={len(part.inline_data.data) if part.inline_data.data else 0}")

                        if "image" in mime and part.inline_data.data:
                            raw = part.inline_data.data
                            # The SDK may return either raw bytes OR a base64 string
                            if isinstance(raw, str):
                                print(f"[ImageGen] {model_name}: decoding base64 string")
                                raw = base64.b64decode(raw)
                            print(f"[ImageGen] {model_name}: SUCCESS — {len(raw)} bytes")
                            return raw  # raw PNG bytes

            print(f"[ImageGen] {model_name}: No image part found in response")

        except Exception as e:
            print(f"[ImageGen] {model_name}: Exception — {type(e).__name__}: {e}")
            continue  # Try next model

    print("[ImageGen] All models failed — returning None (fallback text will be used)")
    return None


def extract_process_for_diagram(pdd_content: str, description: str) -> dict:
    """STAGE 1 of the SVG flowchart pipeline.

    Reads the full PDD/SDD markdown content and extracts a COMPLETE structured
    model of the process — including every step, every decision branch, every
    exception, and every actor — into a deterministic JSON schema.

    This solves the problem where the old single-prompt SVG agent only saw a
    short placeholder string ("To-Be Process Map") and therefore missed all the
    exceptions, validations and gateways living in the rest of the document.

    Returns a dict with keys:
        title, actors[], steps[], decisions[], exceptions[], edges[].
    Used as input for `compose_flowchart_layout`, which is then rendered to SVG.
    """
    import json

    extraction_schema = {
        "type": "OBJECT",
        "properties": {
            "title": {"type": "STRING", "description": "Short flowchart title."},
            "actors": {
                "type": "ARRAY",
                "description": "All distinct actors performing steps (Bot, AP Clerk, Manager, etc).",
                "items": {
                    "type": "OBJECT",
                    "properties": {
                        "id": {"type": "STRING", "description": "snake_case id (e.g. 'bot', 'ap_clerk')."},
                        "name": {"type": "STRING"},
                        "kind": {"type": "STRING", "enum": ["bot", "human", "system"]}
                    },
                    "required": ["id", "name", "kind"]
                }
            },
            "steps": {
                "type": "ARRAY",
                "description": "Every process step (automated, manual, start, end). Decisions go in 'decisions'.",
                "items": {
                    "type": "OBJECT",
                    "properties": {
                        "id": {"type": "STRING", "description": "snake_case id mirroring the action."},
                        "label": {"type": "STRING", "description": "Concise 2-5 word label."},
                        "actor_id": {"type": "STRING"},
                        "node_type": {"type": "STRING", "enum": ["start", "automated", "manual", "end", "exception", "terminal_success", "terminal_exception"]}
                    },
                    "required": ["id", "label", "node_type"]
                }
            },
            "decisions": {
                "type": "ARRAY",
                "description": "Every decision/gateway with ALL its branches.",
                "items": {
                    "type": "OBJECT",
                    "properties": {
                        "id": {"type": "STRING"},
                        "question": {"type": "STRING", "description": "The decision question (3-5 words)."},
                        "actor_id": {"type": "STRING"},
                        "branches": {
                            "type": "ARRAY",
                            "items": {
                                "type": "OBJECT",
                                "properties": {
                                    "outcome": {"type": "STRING", "description": "e.g. 'Yes', 'No', 'Match', 'Mismatch', 'Within tolerance'."},
                                    "next_id": {"type": "STRING", "description": "id of the step or decision to go to."}
                                },
                                "required": ["outcome", "next_id"]
                            }
                        }
                    },
                    "required": ["id", "question", "branches"]
                }
            },
            "exceptions": {
                "type": "ARRAY",
                "description": "Every exception/error handler/escalation path mentioned anywhere in the doc.",
                "items": {
                    "type": "OBJECT",
                    "properties": {
                        "id": {"type": "STRING"},
                        "trigger": {"type": "STRING", "description": "What triggers this exception (e.g. '3-way match fails')."},
                        "handler_label": {"type": "STRING", "description": "Short label for the handler node."},
                        "actor_id": {"type": "STRING", "description": "Who handles it."},
                        "rejoins_id": {"type": "STRING", "description": "Step id the exception flows back to (or terminal id)."}
                    },
                    "required": ["id", "trigger", "handler_label"]
                }
            },
            "edges": {
                "type": "ARRAY",
                "description": "All linear edges between non-decision, non-exception steps. Decisions use their 'branches'; exceptions use 'rejoins_id'.",
                "items": {
                    "type": "OBJECT",
                    "properties": {
                        "from_id": {"type": "STRING"},
                        "to_id": {"type": "STRING"},
                        "label": {"type": "STRING"}
                    },
                    "required": ["from_id", "to_id"]
                }
            }
        },
        "required": ["title", "steps"]
    }

    system_prompt = (
        "You are a Process Analyst Agent specialized in extracting COMPLETE process "
        "models from Process Design Documents (PDDs) and Solution Design Documents (SDDs).\n\n"
        "TASK: Read the PDD/SDD content and extract a complete structured model of the "
        "process referenced by the user's diagram description.\n\n"
        "CRITICAL EXTRACTION RULES — DO NOT SKIP ANY:\n"
        "1. Capture EVERY step mentioned, not just the happy path.\n"
        "2. Capture EVERY decision/gateway and ALL its branches. Do not omit a 'No' branch.\n"
        "3. Capture EVERY exception, validation failure, escalation, manual review, "
        "   and error handler. Look in sections titled 'Exceptions', 'Validations', "
        "   'Error Handling', 'Edge Cases', 'Risk Mitigation', AND scan the prose for "
        "   phrases like 'if X fails', 'when validation does not pass', 'on error', "
        "   'escalates to', 'flagged for manual review', 'requires approval', etc.\n"
        "4. Identify ALL distinct actors (each automation bot, each human role, each "
        "   external system). Use kind='bot' for automation, 'human' for people, "
        "   'system' for external services (SAP, HDFC portal, etc.).\n"
        "5. Distinguish step types precisely:\n"
        "   - 'start': the entry point (e.g. 'Trigger: New invoice arrives').\n"
        "   - 'automated': bot-performed step.\n"
        "   - 'manual': human-performed step.\n"
        "   - 'exception': handler for a failure path.\n"
        "   - 'terminal_success': successful end state.\n"
        "   - 'terminal_exception': end state for unresolved exceptions.\n"
        "6. Use snake_case ids that describe the action: 'monitor_mailbox', 'check_po_match', "
        "   'flag_exception_match'.\n"
        "7. Build edges so the flow is fully connected: every non-terminal step must have "
        "   at least one outgoing edge OR be a decision (whose branches define the edges).\n"
        "8. Keep labels concise (2-5 words). Don't repeat the actor name in the label.\n\n"
        "Output ONLY the JSON object that matches the schema. Do not invent steps not in "
        "the document, but DO consolidate sub-bullets that describe a single logical step."
    )

    # Cap input size to keep cost low — most PDDs are well under 80k chars
    MAX_DOC_CHARS = 80000
    truncated = pdd_content[:MAX_DOC_CHARS] if pdd_content else ""

    user_prompt = (
        f"DIAGRAM TO BUILD: {description}\n\n"
        f"FULL PDD/SDD CONTENT BELOW — extract the structured process model "
        f"for the diagram described above:\n\n"
        f"{truncated}"
    )

    print(f"[SVG-Pipeline] Stage 1: Extracting process structure for '{description[:60]}'...")
    try:
        structure = call_gemini_structured(
            prompt=user_prompt,
            system_prompt=system_prompt,
            response_schema=extraction_schema,
            model="gemini-3.5-flash",
        )
        n_steps = len(structure.get("steps", []))
        n_decisions = len(structure.get("decisions", []))
        n_exceptions = len(structure.get("exceptions", []))
        n_actors = len(structure.get("actors", []))
        print(
            f"[SVG-Pipeline] Stage 1 OK — {n_steps} steps, {n_decisions} decisions, "
            f"{n_exceptions} exceptions, {n_actors} actors"
        )
        return structure
    except Exception as e:
        print(f"[SVG-Pipeline] Stage 1 failed: {e}. Returning minimal structure.")
        return {
            "title": description,
            "actors": [],
            "steps": [],
            "decisions": [],
            "exceptions": [],
            "edges": [],
        }


def generate_flowchart_svg(description: str, process_structure: dict = None) -> str:
    """Three-agent SVG Flowchart Generator (LangChain-style pipeline).

    Pipeline:
    - Stage 1 (extractor): handled BEFORE this function — see
      `extract_process_for_diagram(pdd_content, description)`. The caller
      passes the resulting structured JSON as `process_structure` here.
    - Stage 2 (planner — Agent 1): converts the structured process model into
      a precise visual layout (viewBox + node coordinates + edges).
    - Stage 3 (writer — Agent 2): converts the layout into highly-styled SVG XML.

    Backward compatible: if `process_structure` is None, the planner falls back
    to using just `description` (original behaviour).

    Args:
        description: Short diagram description (placeholder text from PDD).
        process_structure: Optional rich structured model from Stage 1. When
                           provided, the planner produces a much more complete
                           diagram with all exceptions, gateways, and branches.
    """
    import json
    import re

    # 1. Define JSON schema for Agent 1 Layout Planner
    flowchart_schema = {
        "type": "OBJECT",
        "properties": {
            "viewBox": {
                "type": "STRING",
                "description": "The viewBox of the SVG canvas, e.g. '0 0 1600 800'. Canvas must be wide or tall enough to fit all nodes with margins."
            },
            "nodes": {
                "type": "ARRAY",
                "description": "List of process nodes. Space them out horizontally (X spacing 220-260px) or vertically (Y spacing 150-180px) to prevent overlapping.",
                "items": {
                    "type": "OBJECT",
                    "properties": {
                        "id": {"type": "STRING", "description": "Unique ID, e.g., 'start', 'step1', 'decision1', 'exception1', 'end'."},
                        "type": {
                            "type": "STRING",
                            "enum": ["start", "automated", "decision", "manual", "exception", "end"],
                            "description": "Visual shape and color: start/end=green pill, automated=blue, manual=gray, decision=amber diamond, exception=red rounded."
                        },
                        "label": {"type": "STRING", "description": "Display label (keep concise — 2-5 words)."},
                        "x": {"type": "INTEGER", "description": "Center X coordinate of node on canvas grid."},
                        "y": {"type": "INTEGER", "description": "Center Y coordinate of node on canvas grid."},
                        "width": {"type": "INTEGER", "description": "Width of the node (standard 170)."},
                        "height": {"type": "INTEGER", "description": "Height of the node (standard 70, or 90 for decision)."}
                    },
                    "required": ["id", "type", "label", "x", "y", "width", "height"]
                }
            },
            "edges": {
                "type": "ARRAY",
                "description": "List of connections (arrows) between nodes. Use the structure's branches and exception rejoins as the source of truth.",
                "items": {
                    "type": "OBJECT",
                    "properties": {
                        "from_node": {"type": "STRING"},
                        "to_node": {"type": "STRING"},
                        "label": {"type": "STRING", "description": "Optional label on connection line, e.g., 'Yes', 'No', 'Match', 'On error'."},
                        "path_type": {
                            "type": "STRING",
                            "enum": ["straight", "elbow_right_down", "elbow_down_right", "elbow_up_right", "elbow_down_up", "custom"],
                        }
                    },
                    "required": ["from_node", "to_node", "path_type"]
                }
            }
        },
        "required": ["viewBox", "nodes", "edges"]
    }

    # 2. Build a structure-aware planner system prompt
    planner_system_prompt = (
        "You are an expert Flowchart Layout Planner Agent.\n"
        "Your task: take a structured process model (or raw description) and design "
        "a polished, professional grid layout for a flowchart.\n\n"
        "LAYOUT RULES — strict:\n"
        "1. Choose orientation by node count: ≤7 nodes → horizontal (left-to-right). "
        "   8-12 nodes → horizontal with one wrap. >12 → top-to-bottom OR a 2-row "
        "   horizontal layout with exception lane below the happy path.\n"
        "2. The HAPPY PATH (start → automated steps → terminal_success) goes on the "
        "   primary axis. EXCEPTIONS branch off below (or to the side) and rejoin or "
        "   end at terminal_exception.\n"
        "3. Decisions sit ON the happy path. Their 'Yes' (success) branch continues "
        "   straight; their 'No' (failure) branch goes to an exception node BELOW.\n"
        "4. Spacing: 220-260px between adjacent X nodes. 150-180px between Y rows. "
        "   Decisions (diamonds) need an extra 20px horizontal padding.\n"
        "5. Standard sizes: start/end width=140 height=60; automated/manual width=170 "
        "   height=70; decision width=150 height=90; exception width=170 height=70.\n"
        "6. ViewBox: include at least 60px padding on all sides. Width is "
        "   max_x + node_w/2 + 60, height is max_y + node_h/2 + 60.\n"
        "7. EVERY step from the structure becomes a node. EVERY decision becomes a "
        "   diamond node. EVERY exception becomes its own labelled node connected "
        "   from the failure branch and back to its rejoin point.\n"
        "8. EVERY edge from the structure must appear, including all decision "
        "   branches (Yes/No labels MANDATORY) and exception rejoin paths.\n"
        "9. Type mapping: structure node_type 'automated'→'automated', 'manual'→"
        "   'manual', 'start'→'start', 'terminal_success' or 'end'→'end', "
        "   'terminal_exception'→'end' (with exception color), decisions→'decision', "
        "   exception handlers→'exception'.\n"
        "10. Do NOT collapse or omit nodes. The user wants completeness over brevity."
    )

    # Build planner prompt — richer when we have process_structure
    if process_structure and (process_structure.get("steps") or process_structure.get("decisions")):
        # Compact the structure to keep token cost low while preserving completeness.
        compact = {
            "title": process_structure.get("title", description),
            "actors": process_structure.get("actors", []),
            "steps": process_structure.get("steps", []),
            "decisions": process_structure.get("decisions", []),
            "exceptions": process_structure.get("exceptions", []),
            "edges": process_structure.get("edges", []),
        }
        planner_prompt = (
            f"DIAGRAM TITLE: {description}\n\n"
            f"COMPLETE PROCESS MODEL (extracted from PDD/SDD — render EVERY element):\n"
            f"```json\n{json.dumps(compact, indent=2)}\n```\n\n"
            f"Translate this complete model into a flowchart layout. Every step "
            f"becomes a node, every decision becomes a diamond with all branches, "
            f"every exception becomes its own labelled node. The result must be a "
            f"professional, COMPLETE diagram — not a simplified happy-path version."
        )
    else:
        planner_prompt = f"Design a professional flowchart layout for this description:\n\n{description}"

    print("[SVG-Pipeline] Stage 2: Calling Layout Planner (Agent 1)...")
    try:
        layout_plan = call_gemini_structured(
            prompt=planner_prompt,
            system_prompt=planner_system_prompt,
            response_schema=flowchart_schema,
            model="gemini-3.5-flash"
        )
        print(f"[SVG-Pipeline] Stage 2 OK — {len(layout_plan.get('nodes', []))} nodes, {len(layout_plan.get('edges', []))} edges")
    except Exception as e:
        print(f"[SVG-Pipeline] Stage 2 failed: {e}. Falling back to default plan.")
        # Minimal fallback plan
        layout_plan = {
            "viewBox": "0 0 800 200",
            "nodes": [
                {"id": "start", "type": "start", "label": "Start", "x": 100, "y": 100, "width": 140, "height": 60},
                {"id": "step", "type": "automated", "label": "Process Step", "x": 350, "y": 100, "width": 160, "height": 70},
                {"id": "end", "type": "end", "label": "End", "x": 600, "y": 100, "width": 140, "height": 60}
            ],
            "edges": [
                {"from_node": "start", "to_node": "step", "path_type": "straight"},
                {"from_node": "step", "to_node": "end", "path_type": "straight"}
            ]
        }

    # 3. Call Agent 2: SVG XML Generator
    writer_system_prompt = (
        "You are an expert SVG Graphic Designer producing publication-quality "
        "process flowcharts. Take a JSON layout plan and write a single, "
        "complete, valid SVG XML graphic.\n\n"
        "OUTPUT STRUCTURE:\n"
        "- Root <svg xmlns=\"http://www.w3.org/2000/svg\" viewBox=\"<from plan>\" "
        "  width=\"100%\" height=\"100%\" preserveAspectRatio=\"xMidYMid meet\">.\n"
        "- A <defs> block with: drop-shadow filter, all gradients, arrow markers, "
        "  and a subtle background-grid pattern.\n"
        "- A background <rect> filling the viewBox with fill=\"url(#grid)\" "
        "  fill-opacity=\"0.4\" so the diagram has a designer-looking backdrop.\n"
        "- All edges drawn FIRST (so nodes render on top).\n"
        "- All nodes (shape + label) drawn LAST.\n\n"
        "REQUIRED <defs>:\n"
        "- <filter id=\"shadow\" x=\"-10%\" y=\"-10%\" width=\"120%\" height=\"120%\">"
        "  with <feDropShadow dx=\"2\" dy=\"3\" stdDeviation=\"3\" "
        "  flood-color=\"#0F172A\" flood-opacity=\"0.18\" />.\n"
        "- Linear gradients (id, from-color, to-color):\n"
        "  * start-end:    #10B981 → #047857 (Emerald)\n"
        "  * automated:    #3B82F6 → #1D4ED8 (Blue)\n"
        "  * manual:       #6B7280 → #374151 (Slate)\n"
        "  * decision:     #F59E0B → #B45309 (Amber)\n"
        "  * exception:    #EF4444 → #B91C1C (Red)  ← used for type='exception'\n"
        "- <pattern id=\"grid\" width=\"40\" height=\"40\" patternUnits=\"userSpaceOnUse\">"
        "  containing a <path d=\"M 40 0 L 0 0 0 40\" fill=\"none\" stroke=\"#E2E8F0\" "
        "  stroke-width=\"1\" />.\n"
        "- <marker id=\"arrow\" viewBox=\"0 0 10 10\" refX=\"9\" refY=\"5\" "
        "  markerWidth=\"7\" markerHeight=\"7\" orient=\"auto-start-reverse\">"
        "  with a triangle <path d=\"M 0 1.5 L 9 5 L 0 8.5 z\" fill=\"#475569\" />.\n\n"
        "NODE SHAPES (centered at x,y; w=width; h=height):\n"
        "- start / end: <rect x=x-w/2 y=y-h/2 width=w height=h rx=h/2 ry=h/2> "
        "  fill=\"url(#start-end)\" filter=\"url(#shadow)\" stroke=\"#047857\" "
        "  stroke-width=\"1.5\" — a green pill.\n"
        "- automated: <rect rx=10 ry=10> fill=\"url(#automated)\" stroke=\"#1D4ED8\".\n"
        "- manual:    <rect rx=10 ry=10> fill=\"url(#manual)\"    stroke=\"#374151\".\n"
        "- decision:  <polygon points=\"x,y-h/2 x+w/2,y x,y+h/2 x-w/2,y\"> "
        "  fill=\"url(#decision)\" stroke=\"#B45309\" stroke-width=\"1.5\".\n"
        "- exception: <rect rx=10 ry=10> fill=\"url(#exception)\" stroke=\"#B91C1C\". "
        "  Use a 4px dashed border (stroke-dasharray=\"6 3\") to distinguish it.\n\n"
        "LABELS:\n"
        "- <text x=x y=y text-anchor=\"middle\" fill=\"#FFFFFF\" "
        "  font-family=\"Inter, system-ui, -apple-system, sans-serif\" "
        "  font-size=\"12\" font-weight=\"600\" pointer-events=\"none\">.\n"
        "- WRAP labels longer than 14 chars across 2-3 <tspan> lines (split on word "
        "  boundary). Use x=\"{x}\" on every tspan; first line dy=\"-0.4em\" "
        "  (or \"-0.9em\" for 3-line), each subsequent dy=\"1.2em\". Result must be "
        "  visually centered in the node.\n\n"
        "EDGES (paths) — draw BEFORE nodes:\n"
        "- Always go EDGE-TO-EDGE not center-to-center. Compute the source exit "
        "  point and target entry point from the relative position of the two nodes.\n"
        "- Horizontal flow (target right of source): start (sx + sw/2, sy) → end "
        "  (tx - tw/2, ty). If sy != ty use an elbow: M sx+sw/2,sy H mid V ty H tx-tw/2.\n"
        "- Vertical flow (target below): start (sx, sy + sh/2) → end (tx, ty - th/2). "
        "  If sx != tx use an elbow: M sx,sy+sh/2 V mid H tx V ty-th/2.\n"
        "- Style: stroke=\"#475569\" stroke-width=\"2\" fill=\"none\" "
        "  marker-end=\"url(#arrow)\". For 'No' / 'On error' / exception edges use "
        "  stroke=\"#DC2626\" stroke-dasharray=\"6 3\" so failure paths visually pop.\n"
        "- Edge labels (Yes/No/etc.): <text> at the path midpoint with font-size=11, "
        "  fill=\"#0F172A\", font-weight=\"600\", and a white halo "
        "  (paint-order=\"stroke\" stroke=\"#FFFFFF\" stroke-width=\"3\").\n\n"
        "TITLE: If the plan has a 'title' (or it's clear from context), draw a "
        "centered <text> at the top of the viewBox with font-size=18, "
        "font-weight=700, fill=\"#0F172A\".\n\n"
        "Output ONLY raw, clean SVG XML inside a ```xml code block. No explanations."
    )

    writer_prompt = f"Convert the following flowchart layout blueprint into highly-styled, complete SVG XML:\n\n{json.dumps(layout_plan, indent=2)}"

    print("[SVG-Flowchart] Calling Agent 2 (SVG Writer)...")
    try:
        svg_response = call_gemini_text(
            prompt=writer_prompt,
            system_prompt=writer_system_prompt,
            model="gemini-3.5-flash"
        )
        # Extract SVG code block — try several fence variations the model
        # commonly uses (```xml / ```svg / ```html / plain ```).
        svg_code = None
        for fence_pattern in (
            r"```(?:xml|svg|html)\s*([\s\S]*?)\s*```",
            r"```\s*([\s\S]*?)\s*```",  # any fenced block
        ):
            match = re.search(fence_pattern, svg_response, re.IGNORECASE)
            if match and "<svg" in match.group(1):
                svg_code = match.group(1).strip()
                break

        if svg_code is None:
            # Maybe it outputted pure XML without a code block — extract by tags.
            svg_code = svg_response.strip()
            idx = svg_code.find("<svg")
            if idx != -1:
                svg_code = svg_code[idx:]
            end_idx = svg_code.rfind("</svg>")
            if end_idx != -1:
                svg_code = svg_code[:end_idx + 6]

        # Final defensive cleanup — strip any leading XML declaration or
        # leftover markdown fences that slipped through.
        svg_code = re.sub(r'^\s*<\?xml[^>]*\?>\s*', '', svg_code)
        svg_code = re.sub(r'^\s*```(?:xml|svg|html)?\s*', '', svg_code, flags=re.IGNORECASE)
        svg_code = re.sub(r'\s*```\s*$', '', svg_code).strip()

        # Fix invalid SVG attribute height="auto" / width="auto" — rejected by
        # React DOM (causes "Expected length, 'auto'" error in console).
        svg_code = re.sub(r'\bheight\s*=\s*["\']auto["\']', 'height="100%"', svg_code, flags=re.IGNORECASE)
        svg_code = re.sub(r'\bwidth\s*=\s*["\']auto["\']', 'width="100%"', svg_code, flags=re.IGNORECASE)

        # Simple validation: make sure it has basic tags
        if "<svg" in svg_code and "</svg>" in svg_code:
            print("[SVG-Flowchart] SVG generation SUCCESS.")
            return svg_code
        else:
            raise ValueError("Invalid SVG XML generated by model")

    except Exception as e:
        print(f"[SVG-Flowchart] Agent 2 failed: {e}. Generating manual SVG fallback.")
        # Manual fallback builder using the layout plan JSON
        return build_fallback_svg(layout_plan)


def build_fallback_svg(layout_plan: dict) -> str:
    """Emergency fallback to build the SVG diagram programmatically in Python if Agent 2 fails."""
    try:
        viewbox = layout_plan.get("viewBox", "0 0 1000 600")
        nodes_html = []
        edges_html = []
        
        # Defs
        defs = """
        <defs>
            <filter id="shadow" x="-10%" y="-10%" width="120%" height="120%">
                <feDropShadow dx="2" dy="2" stdDeviation="3" flood-color="#0F172A" flood-opacity="0.15" />
            </filter>
            <linearGradient id="start-end" x1="0%" y1="0%" x2="100%" y2="100%">
                <stop offset="0%" stop-color="#10B981" />
                <stop offset="100%" stop-color="#059669" />
            </linearGradient>
            <linearGradient id="automated" x1="0%" y1="0%" x2="100%" y2="100%">
                <stop offset="0%" stop-color="#3B82F6" />
                <stop offset="100%" stop-color="#1D4ED8" />
            </linearGradient>
            <linearGradient id="decision" x1="0%" y1="0%" x2="100%" y2="100%">
                <stop offset="0%" stop-color="#F59E0B" />
                <stop offset="100%" stop-color="#D97706" />
            </linearGradient>
            <linearGradient id="manual" x1="0%" y1="0%" x2="100%" y2="100%">
                <stop offset="0%" stop-color="#6B7280" />
                <stop offset="100%" stop-color="#374151" />
            </linearGradient>
            <marker id="arrow" viewBox="0 0 10 10" refX="10" refY="5" markerWidth="6" markerHeight="6" orient="auto-start-reverse">
                <path d="M 0 1.5 L 10 5 L 0 8.5 z" fill="#475569" />
            </marker>
        </defs>
        """
        
        nodes_dict = {}
        for n in layout_plan.get("nodes", []):
            nid = n["id"]
            ntype = n["type"]
            label = n["label"]
            x = n["x"]
            y = n["y"]
            w = n["width"]
            h = n["height"]
            
            nodes_dict[nid] = n
            
            # Draw shapes
            if ntype in ("start", "end"):
                shape = f'<rect x="{x - w/2}" y="{y - h/2}" width="{w}" height="{h}" rx="20" ry="20" fill="url(#start-end)" filter="url(#shadow)" stroke="#047857" stroke-width="1.5" />'
            elif ntype == "decision":
                pts = f"{x},{y - h/2} {x + w/2},{y} {x},{y + h/2} {x - w/2},{y}"
                shape = f'<polygon points="{pts}" fill="url(#decision)" filter="url(#shadow)" stroke="#B45309" stroke-width="1.5" />'
            elif ntype == "manual":
                shape = f'<rect x="{x - w/2}" y="{y - h/2}" width="{w}" height="{h}" rx="8" ry="8" fill="url(#manual)" filter="url(#shadow)" stroke="#374151" stroke-width="1.5" />'
            else: # automated
                shape = f'<rect x="{x - w/2}" y="{y - h/2}" width="{w}" height="{h}" rx="8" ry="8" fill="url(#automated)" filter="url(#shadow)" stroke="#1D4ED8" stroke-width="1.5" />'
            
            # Simple text wrap logic for Python fallback
            words = label.split(" ")
            tspan_html = []
            if len(words) > 2:
                # split in half
                mid = len(words) // 2
                line1 = " ".join(words[:mid])
                line2 = " ".join(words[mid:])
                tspan_html.append(f'<tspan x="{x}" dy="-0.3em">{line1}</tspan>')
                tspan_html.append(f'<tspan x="{x}" dy="1.2em">{line2}</tspan>')
            else:
                tspan_html.append(f'<tspan x="{x}" dy="0.3em">{label}</tspan>')
            
            text_el = f"""
            <text x="{x}" y="{y}" text-anchor="middle" fill="#FFFFFF" font-family="system-ui, -apple-system, sans-serif" font-size="11" font-weight="600">
                {"".join(tspan_html)}
            </text>
            """
            nodes_html.append(shape + "\n" + text_el)
            
        for e in layout_plan.get("edges", []):
            from_id = e["from_node"]
            to_id = e["to_node"]
            label = e.get("label", "")
            
            if from_id not in nodes_dict or to_id not in nodes_dict:
                continue
                
            fn = nodes_dict[from_id]
            tn = nodes_dict[to_id]
            
            # Calculate coordinates based on relative position
            # Determine flow direction
            dx = tn["x"] - fn["x"]
            dy = tn["y"] - fn["y"]
            
            if abs(dx) >= abs(dy):
                # Horizontal flow
                if dx > 0:
                    x1 = fn["x"] + fn["width"] / 2
                    y1 = fn["y"]
                    x2 = tn["x"] - tn["width"] / 2
                    y2 = tn["y"]
                else:
                    x1 = fn["x"] - fn["width"] / 2
                    y1 = fn["y"]
                    x2 = tn["x"] + tn["width"] / 2
                    y2 = tn["y"]
            else:
                # Vertical flow
                if dy > 0:
                    x1 = fn["x"]
                    y1 = fn["y"] + fn["height"] / 2
                    x2 = tn["x"]
                    y2 = tn["y"] - tn["height"] / 2
                else:
                    x1 = fn["x"]
                    y1 = fn["y"] - fn["height"] / 2
                    x2 = tn["x"]
                    y2 = tn["y"] + tn["height"] / 2
            
            # Draw path
            path = f'<path d="M {x1} {y1} L {x2} {y2}" stroke="#475569" stroke-width="2" fill="none" marker-end="url(#arrow)" />'
            
            # Draw label
            label_el = ""
            if label:
                lx = (x1 + x2) / 2
                ly = (y1 + y2) / 2 - 6
                label_el = f'<text x="{lx}" y="{ly}" text-anchor="middle" fill="#475569" font-family="system-ui, sans-serif" font-size="9" font-weight="bold">{label}</text>'
                
            edges_html.append(path + "\n" + label_el)
            
        svg_content = f"""<svg xmlns="http://www.w3.org/2000/svg" viewBox="{viewbox}" width="100%" height="100%">
            {defs}
            {"".join(edges_html)}
            {"".join(nodes_html)}
        </svg>"""
        return svg_content
    except Exception as e:
        print(f"[build_fallback_svg] Error generating fallback SVG: {e}")
        # Hard fallback
        return '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 50"><text x="10" y="25" fill="red">SVG Error</text></svg>'
