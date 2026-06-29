# Custom PDD / SDD Template Feature

Upload your own PDD or SDD Word template (with the Auxiliobits logo, header/footer,
fonts and section structure). When you generate and download the document, the
output follows **your template's structure and design** instead of the built-in
default layout.

## How it works

1. **Upload** – In the Documents view, pick **PDD** or **SDD**, then click
   **Upload Template** and choose a `.docx` file. The button turns green and shows
   `PDD Template ✓` / `SDD Template ✓` once stored. Click the **✕** next to it to
   remove the template and revert to the default layout.

2. **Generate** – When a template exists for the selected doc type, the generator
   is given the template's exact heading outline and is instructed to produce
   content that mirrors those sections (same wording, numbering and order).

3. **Download → Word Document** – Instead of building a blank `.docx`, the backend
   opens a **copy of your uploaded template** and:
   - keeps everything before the first heading (the cover / **logo** / title block),
   - keeps the template's **header & footer** and **named styles** (Heading 1/2/3,
     Normal, Table Grid),
   - replaces the template's placeholder body with the generated content rendered
     using those same styles,
   - embeds BPMN / flowchart diagrams from the PNG snapshots captured in the UI.

   Because the original file is reused as the skeleton, the logo, footer and fonts
   are preserved automatically — they are never re-created.

## What changed

### Backend (`backend/`)
- **`utils/template_renderer.py`** (new) – `analyze_template`, `build_template_outline`,
  and `render_markdown_into_template` (the structure + design renderer).
- **`utils/template_store.py`** (new) – stores one template per assessment + doc type
  under `backend/templates/{assessment_id}/{doc_type}.docx`.
- **`main.py`**
  - `POST /api/history/{assessment_id}/upload-template` (multipart: `file`, `doc_type`)
  - `GET  /api/history/{assessment_id}/template-status`
  - `DELETE /api/history/{assessment_id}/template?doc_type=pdd|sdd`
  - `generate-document` now builds a template-aware prompt when a template exists.
  - `download-document` now renders into the uploaded template when one exists,
    otherwise falls back to the original blank-document builder (unchanged behaviour).

### Frontend (`frontend/src/`)
- **`services/api.js`** – `uploadTemplate`, `getTemplateStatus`, `deleteTemplate`.
- **`components/DocumentView.jsx`** – an **Upload Template** control next to the
  PDD/SDD toggle, with status indicator and remove button.

## Notes
- Templates are stored on disk under `backend/templates/` (created automatically;
  a `.gitkeep` is included). For multi-instance / serverless deployments, point
  `TEMPLATES_DIR` in `template_store.py` at shared storage (e.g. S3-backed volume).
- No new Python dependencies are required (`python-docx` is already used). Pillow is
  used only if present, to fit diagram images; it degrades gracefully if absent.
- The renderer fills the template structurally. A future enhancement could use
  `docxtpl`/Jinja placeholders inside the template for token-level binding.
