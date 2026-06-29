import { useState } from 'react';
import {
  BookOpen, X, Copy, Check, KeyRound, Cpu, FileText, Workflow,
  ShieldCheck, AlertCircle, Terminal, Layers,
} from 'lucide-react';

// ── Small reusable copy-able code block ──────────────────────────────────────
function CodeBlock({ code, label }) {
  const [copied, setCopied] = useState(false);
  const copy = async () => {
    try {
      await navigator.clipboard.writeText(code);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      /* clipboard unavailable */
    }
  };
  return (
    <div className="relative group my-3">
      {label && (
        <div className="text-[10px] uppercase tracking-widest text-slate-500 mb-1.5 font-semibold">{label}</div>
      )}
      <button
        onClick={copy}
        className="absolute top-2 right-2 flex items-center gap-1 px-2 py-1 rounded-md bg-slate-700/80 hover:bg-slate-600 text-[11px] text-slate-200 transition-colors opacity-0 group-hover:opacity-100"
      >
        {copied ? <Check size={12} /> : <Copy size={12} />}
        {copied ? 'Copied' : 'Copy'}
      </button>
      <pre className="px-4 py-3 rounded-lg bg-slate-950 border border-white/10 text-xs text-slate-300 font-mono overflow-x-auto whitespace-pre">{code}</pre>
    </div>
  );
}

function Method({ m }) {
  const colors = {
    GET: 'bg-emerald-500/15 text-emerald-300 border-emerald-500/30',
    POST: 'bg-indigo-500/15 text-indigo-300 border-indigo-500/30',
    DELETE: 'bg-rose-500/15 text-rose-300 border-rose-500/30',
  };
  return (
    <span className={`inline-block px-2 py-0.5 rounded text-[10px] font-bold font-mono border ${colors[m] || 'bg-slate-700 text-slate-300'}`}>{m}</span>
  );
}

function Section({ id, icon: Icon, title, children }) {
  return (
    <section id={id} className="scroll-mt-20">
      <div className="flex items-center gap-2 mb-3">
        <Icon size={18} className="text-indigo-300" />
        <h3 className="text-lg font-bold text-white">{title}</h3>
      </div>
      <div className="space-y-3 text-sm text-slate-300 leading-relaxed">{children}</div>
    </section>
  );
}

const NAV = [
  { id: 'overview', label: 'Overview' },
  { id: 'auth', label: 'Authentication' },
  { id: 'endpoints', label: 'Endpoints' },
  { id: 'models', label: 'Models' },
  { id: 'keys-api', label: 'Key management' },
  { id: 'errors', label: 'Errors' },
];

export default function ApiDocs({ isOpen, onClose }) {
  if (!isOpen) return null;

  const scrollTo = (id) => {
    const el = document.getElementById(id);
    if (el) el.scrollIntoView({ behavior: 'smooth', block: 'start' });
  };

  return (
    <div className="fixed inset-0 z-[70] flex justify-center">
      <div className="absolute inset-0 bg-black/70 backdrop-blur-sm" onClick={onClose} />

      <div className="relative w-full max-w-4xl h-full bg-slate-900 border-x border-white/10 shadow-2xl overflow-y-auto">
        {/* Header */}
        <div className="sticky top-0 z-10 flex items-center justify-between px-6 h-16 bg-slate-900/95 backdrop-blur border-b border-white/10">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-lg bg-indigo-500/20 border border-indigo-500/30 flex items-center justify-center">
              <BookOpen size={18} className="text-indigo-300" />
            </div>
            <div>
              <h2 className="text-base font-bold text-white">API Documentation</h2>
              <p className="text-[11px] text-slate-500">AlphaFold Developer API · v1</p>
            </div>
          </div>
          <button onClick={onClose} className="p-2 rounded-lg text-slate-400 hover:text-white hover:bg-white/5 transition-colors">
            <X size={18} />
          </button>
        </div>

        {/* Sticky in-page nav */}
        <div className="sticky top-16 z-10 flex flex-wrap gap-2 px-6 py-3 bg-slate-900/90 backdrop-blur border-b border-white/5">
          {NAV.map((n) => (
            <button
              key={n.id}
              onClick={() => scrollTo(n.id)}
              className="px-3 py-1 rounded-full text-xs font-medium text-slate-300 bg-slate-800/70 hover:bg-indigo-500/20 hover:text-indigo-200 border border-white/5 transition-colors"
            >
              {n.label}
            </button>
          ))}
        </div>

        <div className="px-6 py-8 space-y-12">
          {/* ── Overview ─────────────────────────────────────────────── */}
          <Section id="overview" icon={Layers} title="Overview">
            <p>
              The AlphaFold Developer API lets you run our AP-process intelligence models programmatically
              from any tool or backend. There is a single execution endpoint, <code className="text-indigo-300">POST /v1/run</code>,
              that accepts a <code className="text-indigo-300">model</code> name and an <code className="text-indigo-300">input</code> object.
            </p>
            <div className="p-4 rounded-xl bg-slate-800/50 border border-white/10">
              <div className="text-[10px] uppercase tracking-widest text-slate-500 mb-1 font-semibold">Base URL</div>
              <code className="text-sm text-emerald-300 font-mono">http://localhost:8000</code>
              <p className="text-xs text-slate-500 mt-2">
                Use your deployed domain in production (e.g. <code className="text-slate-400">https://api.yourdomain.com</code>).
                The run endpoint is served at the root (<code className="text-slate-400">/v1/run</code>), while key-management
                endpoints live under <code className="text-slate-400">/api/keys</code>.
              </p>
            </div>
            <div className="flex items-start gap-2 p-3 rounded-lg bg-indigo-500/10 border border-indigo-500/20">
              <Workflow size={16} className="text-indigo-300 shrink-0 mt-0.5" />
              <p className="text-xs text-indigo-200">
                <strong>Chaining:</strong> run <code>ap_analysis</code> first, then pass its returned
                <code> data</code> object as the <code>analysis</code> input to <code>ap_pdd-sdd</code> or
                <code> ap_bpmn</code>. The document and diagram models reuse the exact same internal
                orchestration as the app, so results are identical.
              </p>
            </div>
          </Section>

          {/* ── Authentication ───────────────────────────────────────── */}
          <Section id="auth" icon={ShieldCheck} title="Authentication">
            <p>
              Every request to <code className="text-indigo-300">/v1/run</code> must include an API key as a
              Bearer token. Keys look like <code className="text-indigo-300">ap_sk_…</code> and are created from the
              <strong> API Keys</strong> panel (profile menu). The full secret is shown only once at creation —
              store it somewhere safe.
            </p>
            <CodeBlock label="Required header" code={`Authorization: Bearer ap_sk_your_secret_key_here`} />
            <div className="flex items-start gap-2 p-3 rounded-lg bg-amber-500/10 border border-amber-500/20 font-sans">
              <AlertCircle size={16} className="text-amber-300 shrink-0 mt-0.5" />
              <p className="text-xs text-amber-200">
                The <code>Bearer</code> prefix (with a trailing space) is required. Sending only the raw key
                returns <code>401 Missing API key</code>. In Postman you can use the Authorization tab → type
                <strong> Bearer Token</strong> and it adds the prefix for you.
              </p>
            </div>
            <div className="flex items-start gap-2 p-3 rounded-lg bg-indigo-500/10 border border-indigo-500/20 mt-3">
              <ShieldCheck size={16} className="text-indigo-300 shrink-0 mt-0.5" />
              <p className="text-xs text-indigo-200">
                <strong>Rate Limit:</strong> Each user can send or hit the API up to <strong>7 requests per day</strong> across all generated keys.
              </p>
            </div>
          </Section>

          {/* ── Endpoints summary ────────────────────────────────────── */}
          <Section id="endpoints" icon={Terminal} title="Endpoints">
            <div className="overflow-x-auto rounded-xl border border-white/10">
              <table className="w-full text-xs">
                <thead className="bg-slate-800/70 text-slate-400">
                  <tr>
                    <th className="text-left px-3 py-2 font-semibold">Method</th>
                    <th className="text-left px-3 py-2 font-semibold">Endpoint</th>
                    <th className="text-left px-3 py-2 font-semibold">Auth</th>
                    <th className="text-left px-3 py-2 font-semibold">Purpose</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-white/5">
                  <tr>
                    <td className="px-3 py-2"><Method m="POST" /></td>
                    <td className="px-3 py-2 font-mono text-slate-300">/v1/run</td>
                    <td className="px-3 py-2 text-slate-400">API key</td>
                    <td className="px-3 py-2 text-slate-400">Run a named model</td>
                  </tr>
                  <tr>
                    <td className="px-3 py-2"><Method m="GET" /></td>
                    <td className="px-3 py-2 font-mono text-slate-300">/api/keys</td>
                    <td className="px-3 py-2 text-slate-400">Login session</td>
                    <td className="px-3 py-2 text-slate-400">List your API keys</td>
                  </tr>
                  <tr>
                    <td className="px-3 py-2"><Method m="POST" /></td>
                    <td className="px-3 py-2 font-mono text-slate-300">/api/keys</td>
                    <td className="px-3 py-2 text-slate-400">Login session</td>
                    <td className="px-3 py-2 text-slate-400">Create a key (returns secret once)</td>
                  </tr>
                  <tr>
                    <td className="px-3 py-2"><Method m="DELETE" /></td>
                    <td className="px-3 py-2 font-mono text-slate-300">/api/keys/&#123;id&#125;</td>
                    <td className="px-3 py-2 text-slate-400">Login session</td>
                    <td className="px-3 py-2 text-slate-400">Revoke a key</td>
                  </tr>
                </tbody>
              </table>
            </div>
            <CodeBlock label="Run request shape" code={`POST /v1/run\nAuthorization: Bearer ap_sk_...\nContent-Type: application/json\n\n{\n  \"model\": \"ap_analysis\" | \"ap_pdd-sdd\" | \"ap_bpmn\",\n  \"input\": { ... model-specific ... }\n}`} />
            <p className="text-xs text-slate-500">Every successful run responds with <code>{`{ "model": "...", "data": { ... } }`}</code>.</p>
          </Section>

          {/* ── Models ───────────────────────────────────────────────── */}
          <Section id="models" icon={Cpu} title="Models">
            {/* ap_analysis */}
            <div className="p-5 rounded-xl bg-slate-800/40 border border-white/10">
              <div className="flex items-center gap-2 mb-2">
                <span className="font-mono text-sm font-bold text-indigo-300">ap_analysis</span>
                <span className="text-[10px] px-2 py-0.5 rounded-full bg-emerald-500/15 text-emerald-300">multi-input</span>
              </div>
              <p className="text-sm text-slate-300 mb-3">
                Analyzes an Accounts Payable process and returns a structured assessment: process map, scored
                steps, automation opportunities, systems, roles, pain points, ROI estimate and a markdown report.
                Accepts plain text <strong>or</strong> an uploaded file (audio / video / docx / txt), which is
                transcribed and analyzed through the same pipeline as the app.
              </p>
              <div className="text-[10px] uppercase tracking-widest text-slate-500 mb-1 font-semibold">Input fields</div>
              <ul className="text-xs text-slate-400 list-disc pl-5 space-y-1 mb-2">
                <li><code className="text-slate-200">text</code> — string (min 50 chars). Use this <em>or</em> a file.</li>
                <li><code className="text-slate-200">file_b64</code> — base64-encoded file contents.</li>
                <li><code className="text-slate-200">filename</code> — original name incl. extension (required with file_b64).</li>
              </ul>
              <p className="text-[11px] text-slate-500 mb-2">Supported files: <code>.mp3 .wav .m4a .ogg .webm .mp4 .mov .docx .txt</code> (max 100&nbsp;MB).</p>
              <CodeBlock label="Example — text input" code={`curl -X POST http://localhost:8000/v1/run \\\n  -H \"Authorization: Bearer ap_sk_...\" \\\n  -H \"Content-Type: application/json\" \\\n  -d '{\n    \"model\": \"ap_analysis\",\n    \"input\": { \"text\": \"Our AP process starts when an invoice arrives by email...\" }\n  }'`} />
              <CodeBlock label="Example — file input" code={`{\n  \"model\": \"ap_analysis\",\n  \"input\": {\n    \"filename\": \"interview.mp3\",\n    \"file_b64\": \"<base64-encoded-bytes>\"\n  }\n}`} />
              <CodeBlock label="Response (truncated)" code={`{\n  \"model\": \"ap_analysis\",\n  \"data\": {\n    \"executive_summary\": \"...\",\n    \"process_map\": [ ... ],\n    \"scored_steps\": [ ... ],\n    \"opportunities\": [ ... ],\n    \"roi_estimate\": { ... },\n    \"markdown_report\": \"...\"\n  }\n}`} />
            </div>

            {/* ap_pdd-sdd */}
            <div className="p-5 rounded-xl bg-slate-800/40 border border-white/10">
              <div className="flex items-center gap-2 mb-2">
                <span className="font-mono text-sm font-bold text-indigo-300">ap_pdd-sdd</span>
                <span className="text-[10px] px-2 py-0.5 rounded-full bg-purple-500/15 text-purple-300">document</span>
              </div>
              <p className="text-sm text-slate-300 mb-3">
                Generates a full <strong>PDD</strong> (Process Definition Document) or <strong>SDD</strong>
                (Solution Design Document) from an analysis result. Internally runs the identical app
                orchestration — including the BPMN agent and SVG flowchart generation — so embedded diagrams are
                produced exactly as in the product.
              </p>
              <div className="text-[10px] uppercase tracking-widest text-slate-500 mb-1 font-semibold">Input fields</div>
              <ul className="text-xs text-slate-400 list-disc pl-5 space-y-1 mb-2">
                <li><code className="text-slate-200">doc_type</code> — <code>"pdd"</code> or <code>"sdd"</code> (default <code>"pdd"</code>).</li>
                <li><code className="text-slate-200">analysis</code> — the <code>data</code> object returned by <code>ap_analysis</code>.</li>
                <li><code className="text-slate-200">text</code> / <code>file_b64</code> + <code>filename</code> — alternatively pass raw input instead of <code>analysis</code>; it is analyzed automatically first (slower, costs an extra analysis).</li>
              </ul>
              <CodeBlock label="Example" code={`{\n  \"model\": \"ap_pdd-sdd\",\n  \"input\": {\n    \"doc_type\": \"pdd\",\n    \"analysis\": { /* output of ap_analysis */ }\n  }\n}`} />
              <CodeBlock label="Response" code={`{\n  \"model\": \"ap_pdd-sdd\",\n  \"data\": { \"doc_type\": \"pdd\", \"content\": \"<full document content>\" }\n}`} />
            </div>

            {/* ap_bpmn */}
            <div className="p-5 rounded-xl bg-slate-800/40 border border-white/10">
              <div className="flex items-center gap-2 mb-2">
                <span className="font-mono text-sm font-bold text-indigo-300">ap_bpmn</span>
                <span className="text-[10px] px-2 py-0.5 rounded-full bg-cyan-500/15 text-cyan-300">diagram</span>
              </div>
              <p className="text-sm text-slate-300 mb-3">
                Generates standards-compliant <strong>BPMN 2.0 XML</strong> for the process, ready to import into
                any BPMN editor. Uses the same diagram engine as the app.
              </p>
              <div className="text-[10px] uppercase tracking-widest text-slate-500 mb-1 font-semibold">Input fields</div>
              <ul className="text-xs text-slate-400 list-disc pl-5 space-y-1 mb-2">
                <li><code className="text-slate-200">scored_steps</code> — array of process steps, <em>or</em></li>
                <li><code className="text-slate-200">analysis</code> — an <code>ap_analysis</code> result object containing <code>scored_steps</code>.</li>
                <li><code className="text-slate-200">text</code> / <code>file_b64</code> + <code>filename</code> — if no steps are supplied, they are auto-derived by running <code>ap_analysis</code> first (slower, costs an extra analysis).</li>
              </ul>
              <CodeBlock label="Example" code={`{\n  \"model\": \"ap_bpmn\",\n  \"input\": { \"analysis\": { /* output of ap_analysis */ } }\n}`} />
              <CodeBlock label="Response" code={`{\n  \"model\": \"ap_bpmn\",\n  \"data\": { \"bpmn_xml\": \"<?xml version=...>\" }\n}`} />
            </div>
          </Section>

          {/* ── Key management API ───────────────────────────────────── */}
          <Section id="keys-api" icon={KeyRound} title="Key management API">
            <p>
              These endpoints are used by the app UI and are authenticated by your normal
              login session (cookie), <strong>not</strong> by an API key. Use the
              <strong> API Keys</strong> panel for the easiest experience.
            </p>
            <CodeBlock label="Create a key" code={`POST /api/keys\nContent-Type: application/json\n\n{\n  \"name\": \"Zapier integration\",\n  \"allowed_models\": [\"ap_analysis\", \"ap_pdd-sdd\"]\n}\n\n// Response (secret shown ONCE):\n{\n  \"id\": \"...\",\n  \"name\": \"Zapier integration\",\n  \"secret\": \"ap_sk_...\",\n  \"display\": \"ap_sk_xy...8fa2\",\n  \"allowed_models\": [\"ap_analysis\", \"ap_pdd-sdd\"]\n}`} />
            <p className="text-xs text-slate-500">
              Omit <code>allowed_models</code> to grant access to all models. <code>GET /api/keys</code> lists
              masked keys; <code>DELETE /api/keys/&#123;id&#125;</code> revokes one.
            </p>
          </Section>

          {/* ── Errors ───────────────────────────────────────────────── */}
          <Section id="errors" icon={AlertCircle} title="Error reference">
            <div className="overflow-x-auto rounded-xl border border-white/10">
              <table className="w-full text-xs">
                <thead className="bg-slate-800/70 text-slate-400">
                  <tr>
                    <th className="text-left px-3 py-2 font-semibold">Status</th>
                    <th className="text-left px-3 py-2 font-semibold">Meaning</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-white/5 text-slate-400">
                  <tr><td className="px-3 py-2 font-mono text-amber-300">400</td><td className="px-3 py-2">Bad input — unknown model, missing/short text, or malformed body.</td></tr>
                  <tr><td className="px-3 py-2 font-mono text-rose-300">401</td><td className="px-3 py-2">Missing, malformed, invalid, or revoked API key.</td></tr>
                  <tr><td className="px-3 py-2 font-mono text-rose-300">403</td><td className="px-3 py-2">Key is valid but not allowed to use the requested model.</td></tr>
                  <tr><td className="px-3 py-2 font-mono text-rose-300">429</td><td className="px-3 py-2">Rate limit exceeded — maximum 7 requests per day per user.</td></tr>
                  <tr><td className="px-3 py-2 font-mono text-amber-300">413</td><td className="px-3 py-2">Uploaded file exceeds the size limit (100&nbsp;MB).</td></tr>
                  <tr><td className="px-3 py-2 font-mono text-amber-300">415</td><td className="px-3 py-2">Unsupported file type.</td></tr>
                  <tr><td className="px-3 py-2 font-mono text-rose-300">500</td><td className="px-3 py-2">Server error during model execution.</td></tr>
                </tbody>
              </table>
            </div>
            <p className="text-xs text-slate-500">Errors return JSON of the form <code>{`{ "detail": "message" }`}</code>.</p>
          </Section>
        </div>
      </div>
    </div>
  );
}
