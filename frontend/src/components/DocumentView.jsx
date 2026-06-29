import React, { useState, useRef, useEffect, useMemo } from 'react';
import { createPortal } from 'react-dom';
import SelectionCommentWrapper from './SelectionCommentWrapper';
import { FileText, FileDown, Loader2, Send, RefreshCw, Download, BookOpen, Settings, ChevronDown, List, ChevronRight, Edit, X, MessageSquare, Sparkles, CheckCircle2 } from 'lucide-react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import rehypeRaw from 'rehype-raw';
import mermaid from 'mermaid';
import BpmnViewer from 'bpmn-js/lib/Viewer';
import { generateDocument, updateDocument, downloadDocumentDocx, saveDocumentManual, uploadTemplate, getTemplateStatus, deleteTemplate } from '../services/api';
import {
  MDXEditor,
  headingsPlugin,
  listsPlugin,
  quotePlugin,
  thematicBreakPlugin,
  markdownShortcutPlugin,
  tablePlugin,
  codeBlockPlugin,
  codeMirrorPlugin,
  toolbarPlugin,
  BlockTypeSelect,
  BoldItalicUnderlineToggles,
  UndoRedo,
  CreateLink,
  InsertTable,
  InsertCodeBlock,
  diffSourcePlugin,
  DiffSourceToggleWrapper
} from '@mdxeditor/editor';
import '@mdxeditor/editor/style.css';

/* ── helpers ─────────────────────────────────────────────────── */

/**
 * Pre-process AI-generated markdown to fix common issues:
 * 1. Remove literal <br> / <br/> / &lt;br&gt; tags that AI puts in table cells.
 *    Inside table rows (lines containing |) replace with a bullet separator.
 *    In regular text replace with a proper newline.
 * 2. Normalise escaped HTML entities that can appear in output.
 * 3. Defensively repair broken/cached SVG diagrams: any multiline <svg>...</svg>
 *    block is collapsed to a single line and invalid attrs (height/width="auto")
 *    are fixed. Without this, markdown's CommonMark spec would split the SVG
 *    into multiple HTML blocks at every blank line, leaving raw XML on the page.
 */
function sanitizeContent(md) {
  if (!md) return md;

  // ── Step 1: Repair SVG diagrams (handles cached docs from before backend fix)
  // Match any <svg ...>...</svg> block, even if it spans many lines or sits
  // outside a <figure>. Collapse whitespace, fix invalid attrs, ensure it's
  // wrapped in a <figure class="doc-flowchart"> so styling stays consistent.
  md = md.replace(/<svg\b[\s\S]*?<\/svg>/gi, (match) => {
    let svg = match
      // Strip leading XML declaration if it leaked in
      .replace(/^<\?xml[^?]*\?>\s*/, '')
      // Fix invalid SVG length attrs that React DOM rejects
      .replace(/\bheight\s*=\s*["']auto["']/gi, 'height="100%"')
      .replace(/\bwidth\s*=\s*["']auto["']/gi, 'width="100%"');
    // Decode HTML entities the AI sometimes emits literally
    svg = svg
      .replace(/&lt;/g, '<')
      .replace(/&gt;/g, '>')
      .replace(/&quot;/g, '"')
      .replace(/&#39;/g, "'");
    // Collapse all whitespace to a single space — this is the critical fix.
    // CommonMark ends raw HTML blocks at the first blank line, so any newline
    // inside the SVG would cause it to be torn into separate <pre><code>
    // fragments. One line = one HTML block = renders correctly.
    svg = svg.replace(/\s+/g, ' ').trim();
    return svg;
  });

  // ── Step 2: Wrap any bare <svg>...</svg> in a <figure> if it isn't already.
  // After Step 1 the SVG is on one line. If it's not already preceded by
  // <figure...>, wrap it so it gets the same styling (margin, centered).
  md = md.replace(/(^|\n)(?!<figure[^>]*>)\s*(<svg\b[^<]*<\/svg>)/gi, (m, lead, svg) => {
    return `${lead}\n<figure class="doc-flowchart" style="margin:2rem 0;text-align:center;">${svg}</figure>\n`;
  });

  // ── Step 3: Strip stray code fences that AI wrapped around the SVG.
  // E.g. ```svg\n<svg>...</svg>\n``` or ```xml or ```html — collapse to just
  // the <svg> so the SVG handler can render it.
  md = md.replace(/```(?:svg|xml|html)\s*\n?(<svg\b[\s\S]*?<\/svg>)\s*\n?```/gi,
    (m, svg) => svg.replace(/\s+/g, ' ').trim()
  );

  // ── Step 4: Per-line <br> normalisation (existing behaviour)
  return md
    .split('\n')
    .map(line => {
      // Table row: contains pipe chars — replace <br> with " · " separator
      if (line.includes('|')) {
        return line
          .replace(/<br\s*\/?>/gi, ' · ')
          .replace(/&lt;br\s*\/?&gt;/gi, ' · ');
      }
      // Non-table line: replace <br> with a proper newline
      return line
        .replace(/<br\s*\/?>/gi, '  \n')
        .replace(/&lt;br\s*\/?&gt;/gi, '  \n');
    })
    .join('\n');
}

mermaid.initialize({
  startOnLoad: false,
  theme: 'default',
  securityLevel: 'loose',
  fontFamily: 'Inter, Segoe UI, sans-serif'
});

/* ── Diagram → PNG capture (used by Word download) ──────────────
   Walks the rendered DocumentView DOM, finds every BPMN-rendered
   SVG (inside .doc-diagram) and every To-Be SVG flowchart (inside
   .doc-flowchart), serializes each to a Blob, paints it on a 2x
   canvas, and returns a base64 PNG. The backend embeds these
   PNGs in the Word doc instead of the raw XML/HTML markup. */
async function captureRenderedDiagrams(rootEl) {
  const root = rootEl || document;
  const out = [];

  // BPMN diagrams (As-Is process). bpmn-js renders into .doc-diagram.
  const bpmnSvgs = root.querySelectorAll('.doc-diagram svg');
  for (const svg of bpmnSvgs) {
    const png = await svgToPngBase64(svg);
    if (png) out.push({ type: 'bpmn', png_base64: png });
  }

  // SVG flowcharts (To-Be process). Wrapped in .doc-flowchart figure.
  const flowSvgs = root.querySelectorAll('.doc-flowchart svg');
  for (const svg of flowSvgs) {
    const png = await svgToPngBase64(svg);
    if (png) out.push({ type: 'svg', png_base64: png });
  }

  return out;
}

async function svgToPngBase64(svgEl, { scale = 2, bgColor = '#ffffff' } = {}) {
  return new Promise((resolve) => {
    try {
      const cloned = svgEl.cloneNode(true);
      cloned.setAttribute('xmlns', 'http://www.w3.org/2000/svg');
      cloned.setAttribute('xmlns:xlink', 'http://www.w3.org/1999/xlink');

      // Determine size: prefer bounding rect, fall back to viewBox.
      const rect = svgEl.getBoundingClientRect();
      let w = rect.width, h = rect.height;
      if ((!w || !h) && cloned.viewBox && cloned.viewBox.baseVal) {
        w = cloned.viewBox.baseVal.width || 0;
        h = cloned.viewBox.baseVal.height || 0;
      }
      if (!w) w = 1200;
      if (!h) h = 700;
      cloned.setAttribute('width', String(w));
      cloned.setAttribute('height', String(h));

      const svgString = new XMLSerializer().serializeToString(cloned);
      const blob = new Blob([svgString], { type: 'image/svg+xml;charset=utf-8' });
      const url = URL.createObjectURL(blob);

      const img = new Image();
      img.crossOrigin = 'anonymous';
      img.onload = () => {
        try {
          const canvas = document.createElement('canvas');
          canvas.width = Math.round(w * scale);
          canvas.height = Math.round(h * scale);
          const ctx = canvas.getContext('2d');
          ctx.fillStyle = bgColor;
          ctx.fillRect(0, 0, canvas.width, canvas.height);
          ctx.scale(scale, scale);
          ctx.drawImage(img, 0, 0, w, h);
          URL.revokeObjectURL(url);
          const dataUrl = canvas.toDataURL('image/png');
          resolve(dataUrl.split(',')[1]);
        } catch (e) {
          console.error('[svgToPng] canvas serialize failed', e);
          URL.revokeObjectURL(url);
          resolve(null);
        }
      };
      img.onerror = (e) => {
        console.error('[svgToPng] image load failed', e);
        URL.revokeObjectURL(url);
        resolve(null);
      };
      img.src = url;
    } catch (e) {
      console.error('[svgToPng] error', e);
      resolve(null);
    }
  });
}


function MermaidDiagram({ chart }) {
  const [svg, setSvg] = useState('');
  const [error, setError] = useState(false);
  const id = useMemo(() => `mermaid-${Math.random().toString(36).substr(2, 9)}`, []);

  useEffect(() => {
    let isMounted = true;
    const renderDiagram = async () => {
      try {
        if (!chart || chart.trim() === '') return;
        const { svg: renderedSvg } = await mermaid.render(id, chart);
        if (isMounted) {
          setSvg(renderedSvg);
          setError(false);
        }
      } catch (err) {
        console.error("Mermaid rendering failed:", err);
        if (isMounted) setError(true);
      }
    };
    if (chart) renderDiagram();
    return () => { isMounted = false; };
  }, [chart, id]);

  if (error) {
    return (
      <div className="p-4 bg-red-50 text-red-500 rounded border border-red-200 text-xs overflow-auto my-4">
        <strong>Diagram rendering error:</strong>
        <pre className="mt-2 text-[10px] bg-transparent border-none p-0">{chart}</pre>
      </div>
    );
  }

  return svg ? (
    <div dangerouslySetInnerHTML={{ __html: svg }} className="my-8 flex justify-center w-full doc-diagram" />
  ) : (
    <div className="my-8 py-10 bg-slate-50 border border-slate-200 rounded text-slate-400 text-center text-xs animate-pulse flex items-center justify-center gap-2">
      <Loader2 size={14} className="animate-spin" />
      Rendering diagram...
    </div>
  );
}

function BpmnDiagram({ xml }) {
  const containerRef = useRef(null);
  const [error, setError] = useState(false);

  useEffect(() => {
    if (!containerRef.current || !xml || xml.trim() === '') return;

    // Defensive XML cleanup — cached docs sometimes carry a BOM or stray
    // whitespace before <?xml that breaks bpmn-js's strict parser.
    const cleanXml = xml.replace(/^\uFEFF/, '').trim();

    const viewer = new BpmnViewer({ container: containerRef.current });
    let isMounted = true;
    let resizeObserver = null;
    let zoomTimer = null;

    // Run fit-viewport in its own try/catch — if the container is 0x0
    // (very common when loading a cached doc before layout settles),
    // bpmn-js throws "scale on SVGMatrix non-finite" and we DON'T want
    // that to mark the whole diagram as failed; the import itself is
    // already successful, the diagram just isn't sized yet.
    const fitToViewport = () => {
      if (!isMounted) return false;
      try {
        const canvas = viewer.get('canvas');
        canvas.zoom('fit-viewport');
        return true;
      } catch (zoomErr) {
        console.warn('[BpmnDiagram] fit-viewport deferred (container still 0x0)', zoomErr.message);
        return false;
      }
    };

    viewer.importXML(cleanXml).then(() => {
      if (!isMounted) return;

      // Try once on the next frame (gives the parent layout one tick
      // to apply width/height to our container).
      zoomTimer = requestAnimationFrame(() => {
        if (!isMounted) return;
        const rect = containerRef.current?.getBoundingClientRect();
        const sized = rect && rect.width > 0 && rect.height > 0;
        if (sized && fitToViewport()) return;

        // Still 0x0 OR zoom threw — watch for the container to grow,
        // then fit. This is what makes cached documents render reliably:
        // we wait for the layout to settle instead of giving up.
        resizeObserver = new ResizeObserver(entries => {
          const entry = entries[0];
          if (!entry) return;
          const { width, height } = entry.contentRect;
          if (width > 0 && height > 0 && fitToViewport()) {
            resizeObserver.disconnect();
            resizeObserver = null;
          }
        });
        resizeObserver.observe(containerRef.current);
      });
    }).catch(err => {
      // Only a real importXML failure (malformed BPMN) should mark error.
      console.error('BPMN rendering error', err);
      if (isMounted) setError(true);
    });

    return () => {
      isMounted = false;
      if (zoomTimer) cancelAnimationFrame(zoomTimer);
      if (resizeObserver) resizeObserver.disconnect();
      viewer.destroy();
    };
  }, [xml]);

  if (error) {
    return (
      <div className="p-4 bg-red-50 text-red-500 rounded border border-red-200 text-xs overflow-auto my-4">
        <strong>BPMN rendering error</strong>
      </div>
    );
  }

  return (
    <div className="my-8 w-full doc-diagram border border-slate-200 bg-slate-50 rounded-xl overflow-hidden pointer-events-none shadow-sm" style={{ height: '400px' }}>
      <div ref={containerRef} className="w-full h-full" />
    </div>
  );
}

/* ── SVG Flowchart Diagram (for To-Be process diagrams) ───────────
   Renders raw SVG XML as an actual diagram image.
   Used when the AI outputs SVG inside a code block (```svg / ```xml / ```html)
   instead of using the [[FLOWCHART: ...]] placeholder, OR when the wrapped
   <figure> raw HTML didn't make it through markdown parsing intact.
*/
function SvgDiagram({ svg }) {
  if (!svg) return null;

  // Extract the <svg>...</svg> portion if it's wrapped in other content.
  // Trims any prefix (e.g. "Here is the SVG:" or stray "<?xml...?>") and any suffix.
  let cleanSvg = String(svg).trim();
  const svgStart = cleanSvg.indexOf('<svg');
  const svgEnd = cleanSvg.lastIndexOf('</svg>');
  if (svgStart >= 0 && svgEnd > svgStart) {
    cleanSvg = cleanSvg.slice(svgStart, svgEnd + 6);
  }

  // Decode common HTML entities the markdown parser may have escaped (&lt; / &gt; / &amp; / &quot;)
  cleanSvg = cleanSvg
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&amp;/g, '&');

  // Defensive: replace invalid SVG attributes (height="auto" / width="auto")
  // that React DOM rejects with "Expected length, 'auto'" errors.
  // Required for already-cached documents that were generated before the
  // backend fix landed.
  cleanSvg = cleanSvg
    .replace(/\bheight\s*=\s*["']auto["']/gi, 'height="100%"')
    .replace(/\bwidth\s*=\s*["']auto["']/gi, 'width="100%"');

  if (!cleanSvg.startsWith('<svg')) {
    return (
      <div className="p-4 bg-amber-50 text-amber-700 rounded border border-amber-200 text-xs overflow-auto my-4">
        <strong>SVG diagram could not be parsed</strong>
        <pre className="mt-2 text-[10px] bg-transparent border-none p-0 max-h-40 overflow-auto">{String(svg).slice(0, 400)}</pre>
      </div>
    );
  }

  return (
    <figure className="doc-flowchart doc-diagram my-8" style={{ margin: '2rem 0', textAlign: 'center' }}>
      <div dangerouslySetInnerHTML={{ __html: cleanSvg }} />
    </figure>
  );
}

// Extract headings from markdown for the Table of Contents
function extractHeadings(md) {
  if (!md) return [];
  const lines = md.split('\n');
  const headings = [];
  let inCodeBlock = false;

  for (const line of lines) {
    if (line.trim().startsWith('```')) { inCodeBlock = !inCodeBlock; continue; }
    if (inCodeBlock) continue;

    const match = line.match(/^(#{1,4})\s+(.+)/);
    if (match) {
      const level = match[1].length;
      const text = match[2].replace(/\*\*/g, '').trim();
      const id = text.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '');
      headings.push({ level, text, id });
    }
  }
  return headings;
}

// Custom heading renderer that adds IDs for scroll-to linking
function HeadingRenderer({ level, children }) {
  const text = typeof children === 'string' ? children :
    (Array.isArray(children) ? children.map(c => typeof c === 'string' ? c : c?.props?.children || '').join('') : '');
  const id = String(text).toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '');
  const Tag = `h${level}`;
  return <Tag id={id}>{children}</Tag>;
}

/* ── Tree block — renders plain code blocks as a visual file-tree ── */
function TreeBlock({ content }) {
  const lines = content.split('\n').filter(l => l.trim());
  return (
    <div className="doc-tree">
      {lines.map((line, i) => {
        const isRoot = !line.match(/^[\s│├└]/);
        const depth = (line.match(/^(\s{4}|    )+/) || [''])[0].length / 4;
        const isDir = line.includes('/');
        const connector = line.match(/[├└─│]/g);
        // Separate path from comment
        const commentIdx = line.indexOf('#');
        const pathPart = commentIdx >= 0 ? line.slice(0, commentIdx) : line;
        const comment = commentIdx >= 0 ? line.slice(commentIdx) : '';
        return (
          <div key={i} className={`doc-tree-row ${isRoot ? 'doc-tree-root' : ''}`}
            style={{ paddingLeft: isRoot ? '0' : `${depth * 16}px` }}>
            {!isRoot && <span className="doc-tree-connector">{connector ? (line.includes('└') ? '└─' : '├─') : '  '}</span>}
            <span className={`doc-tree-name ${isDir ? 'doc-tree-dir' : 'doc-tree-file'}`}>
              {isDir ? '📁' : '📄'} {pathPart.replace(/[├└─│\s]/g, '').trim()}
            </span>
            {comment && <span className="doc-tree-comment">{comment}</span>}
          </div>
        );
      })}
    </div>
  );
}

/* ── custom markdown components for document styling ─────── */
const markdownComponents = {
  h1: ({ children }) => <HeadingRenderer level={1}>{children}</HeadingRenderer>,
  h2: ({ children }) => <HeadingRenderer level={2}>{children}</HeadingRenderer>,
  h3: ({ children }) => <HeadingRenderer level={3}>{children}</HeadingRenderer>,
  h4: ({ children }) => <HeadingRenderer level={4}>{children}</HeadingRenderer>,
  table: ({ children }) => (
    <div className="doc-table-wrapper">
      <table className="doc-table">{children}</table>
    </div>
  ),
  th: ({ children }) => <th className="doc-th">{children}</th>,
  td: ({ children }) => <td className="doc-td">{children}</td>,
  hr: () => <div className="doc-divider" />,
  pre: ({ children, ...props }) => {
    const childArray = React.Children.toArray(children);
    const firstChild = childArray[0];
    const className = (React.isValidElement(firstChild) && firstChild.props.className) || '';
    const rawText = React.isValidElement(firstChild)
      ? String(firstChild.props.children || '')
      : String(children || '');

    // ── Mermaid diagram ─────────────────────────────────────────
    if (className.includes('language-mermaid')) {
      return <MermaidDiagram chart={rawText.replace(/\n$/, '')} />;
    }
    // ── BPMN diagram (used by As-Is process — DO NOT CHANGE) ────
    if (className.includes('language-bpmn')) {
      return <BpmnDiagram xml={rawText.replace(/\n$/, '')} />;
    }

    // ── SVG diagram (To-Be process) ─────────────────────────────
    // Render any code block whose language hint is svg/xml/html OR whose
    // content starts with <svg ...> as a real SVG diagram. This catches the
    // case where the AI wraps SVG in ```svg / ```xml / ```html fences instead
    // of using the [[FLOWCHART: ...]] placeholder.
    const looksLikeSvg = /^\s*<svg[\s>]/i.test(rawText);
    if (
      className.includes('language-svg') ||
      className.includes('language-xml') ||
      className.includes('language-html') ||
      looksLikeSvg
    ) {
      return <SvgDiagram svg={rawText.replace(/\n$/, '')} />;
    }

    // ── Tree-style code block ───────────────────────────────────
    // Earlier heuristic falsely matched SVG (which has many `/>` tags) as a
    // directory tree. Tighten it: require actual tree-drawing characters,
    // and explicitly skip anything that looks like XML/HTML markup.
    const looksLikeMarkup = /<\/?[a-zA-Z][^>]*>/.test(rawText);
    const hasTreeChars = rawText.includes('├') || rawText.includes('└') || rawText.includes('──') || rawText.includes('│');
    const isTree = hasTreeChars && !looksLikeMarkup;
    if (isTree) return <TreeBlock content={rawText.replace(/\n$/, '')} />;

    return <pre {...props}>{children}</pre>;
  },
};

/* ── component ───────────────────────────────────────────────── */

export default function DocumentView({ result, onUpdateResult, pendingDocEdits = [], setPendingDocEdits, onAgentEditRequest }) {
  const [docType, setDocType] = useState('pdd');
  const [content, setContent] = useState(null);
  const [isGenerating, setIsGenerating] = useState(false);
  const [isUpdating, setIsUpdating] = useState(false);
  const [updateInput, setUpdateInput] = useState('');
  const [error, setError] = useState(null);
  const [showDownloadMenu, setShowDownloadMenu] = useState(false);
  const [showToc, setShowToc] = useState(true);
  const [pageNumbers, setPageNumbers] = useState({});
  const contentRef = useRef(null);
  const downloadMenuRef = useRef(null);
  const templateInputRef = useRef(null);
  const [templateStatus, setTemplateStatus] = useState({ pdd: false, sdd: false });
  const [isUploadingTemplate, setIsUploadingTemplate] = useState(false);

  // Load which doc types already have a custom template uploaded.
  useEffect(() => {
    if (!result?.id) return;
    getTemplateStatus(result.id).then(setTemplateStatus).catch(() => {});
  }, [result?.id]);

  const handleUploadTemplate = async (e) => {
    const file = e.target.files?.[0];
    if (e.target) e.target.value = '';
    if (!file || !result?.id) return;
    setIsUploadingTemplate(true);
    setError(null);
    try {
      await uploadTemplate(result.id, docType, file);
      setTemplateStatus(prev => ({ ...prev, [docType]: true }));
    } catch (err) {
      setError(err.message || 'Failed to upload template');
    } finally {
      setIsUploadingTemplate(false);
    }
  };

  const handleRemoveTemplate = async () => {
    if (!result?.id) return;
    try {
      await deleteTemplate(result.id, docType);
      setTemplateStatus(prev => ({ ...prev, [docType]: false }));
    } catch (err) {
      setError(err.message || 'Failed to remove template');
    }
  };

  // targeted selection editing states removed, now using SelectionCommentWrapper
  
  // manual editing mode
  const [isEditingMode, setIsEditingMode] = useState(false);
  const [draftContent, setDraftContent] = useState('');
  const [isSavingManual, setIsSavingManual] = useState(false);

  // MDXEditor chokes on raw HTML (<figure>, <svg>, <!-- -->, etc.) because it
  // parses as MDX which forbids `!` and other chars in tag-like constructs.
  // Strategy: strip them to safe placeholders before entering edit mode, then
  // restore them on save so the real content is never lost.
  const stashedDiagramsRef = useRef([]);

  /** Replace HTML diagram blocks with MDX-safe placeholders and escape invalid JSX tags. */
  const stripHtmlForEditor = (md) => {
    if (!md) return md;
    const stash = [];

    // 0. Sanitize SVG diagrams first so they are normalized
    let cleaned = sanitizeContent(md);

    // 1. <figure class="doc-flowchart">…</figure> blocks (SVG diagrams)
    cleaned = cleaned.replace(
      /<figure[^>]*class=["']doc-flowchart["'][^>]*>[\s\S]*?<\/figure>/gi,
      (m) => { const idx = stash.length; stash.push(m); return `\n\n> **[Embedded Diagram ${idx + 1}]** *(preserved — not editable in rich-text mode)*\n\n`; }
    );
    // 2. Bare <svg>…</svg> blocks
    cleaned = cleaned.replace(
      /<svg\b[\s\S]*?<\/svg>/gi,
      (m) => { const idx = stash.length; stash.push(m); return `\n\n> **[Embedded SVG ${idx + 1}]** *(preserved — not editable in rich-text mode)*\n\n`; }
    );
    // 3. HTML comments <!-- … -->
    cleaned = cleaned.replace(
      /<!--[\s\S]*?-->/g,
      (m) => { const idx = stash.length; stash.push(m); return ''; }
    );
    stashedDiagramsRef.current = stash;

    // 4. Escape unescaped `<` that break MDX parsing (e.g. `<3`, `<3-way matching>`, `<30%`, or invalid JSX tag names)
    const validTags = new Set([
      'a','abbr','address','article','aside','b','bdi','bdo','blockquote','br','caption','cite',
      'code','col','colgroup','data','dd','del','details','dfn','div','dl','dt','em','figcaption',
      'figure','footer','header','hgroup','h1','h2','h3','h4','h5','h6','hr','i','img','ins','kbd',
      'li','main','mark','ol','p','pre','q','rp','rt','ruby','s','samp','section','small','span',
      'strong','sub','summary','sup','table','tbody','td','tfoot','th','thead','time','tr','u','ul','var','wbr'
    ]);

    // Tokenize by code blocks (```...```) and inline code (`...`) to preserve code snippets
    const parts = cleaned.split(/(```[\s\S]*?```|`[^`\n]+`)/g);
    cleaned = parts.map((part, index) => {
      if (index % 2 === 1) return part; // Inside code block or inline code span

      // Replace any `<` that does not form a valid standard HTML tag
      return part.replace(/<([a-zA-Z0-9_-]+)?/g, (match, tagCandidate, offset, fullStr) => {
        if (tagCandidate) {
          const lower = tagCandidate.toLowerCase();
          const remainder = fullStr.slice(offset);
          const tagRegex = new RegExp(`^<\\/?${tagCandidate}\\b[^>]*\\/?>`, 'i');
          if (validTags.has(lower) && tagRegex.test(remainder)) {
            return match; // Keep valid HTML tag
          }
        }
        return '&lt;' + (tagCandidate || '');
      });
    }).join('');

    return cleaned;
  };

  /** Re-inject stashed diagrams before saving. */
  const restoreHtmlFromEditor = (md) => {
    const stash = stashedDiagramsRef.current;
    let restored = md;
    stash.forEach((original, idx) => {
      // Replace the blockquote placeholder with the real HTML
      const placeholderRe = new RegExp(
        `>\\s*\\*\\*\\[Embedded (?:Diagram|SVG) ${idx + 1}\\]\\*\\*[^\\n]*`,
        'g'
      );
      restored = restored.replace(placeholderRe, original);
    });
    return restored;
  };

  // Toggle manual edit mode
  const handleToggleEditMode = () => {
    if (!isEditingMode) {
      setDraftContent(stripHtmlForEditor(content));
      setIsEditingMode(true);
    } else {
      setIsEditingMode(false);
      stashedDiagramsRef.current = [];
    }
  };

  // Save manual edits
  const handleSaveManualEdits = async () => {
    if (!draftContent.trim() || isSavingManual) return;
    setIsSavingManual(true);
    setError(null);
    try {
      const finalContent = restoreHtmlFromEditor(draftContent);
      const data = await saveDocumentManual(result.id, docType, finalContent);
      setContent(data.content);
      setIsEditingMode(false);
      if (onUpdateResult) {
        onUpdateResult(prev => ({
          ...prev,
          documents: { ...(prev.documents || {}), [docType]: data.content }
        }));
      }
    } catch (err) {
      setError(err.message);
    } finally {
      setIsSavingManual(false);
    }
  };

  // Selection and edit queue logic is now handled by SelectionCommentWrapper

  // Load cached document if it exists, and sync whenever parent updates it
  useEffect(() => {
    const docs = result?.documents || {};
    const cached = docs[docType];
    setContent(cached || null);
    setError(null);
  }, [docType, result]);

  // Poll backend for flowchart completion if document is currently rendering background diagrams
  useEffect(() => {
    if (!content || !content.includes('doc-flowchart-loading') || !result?.id) return;

    const pollInterval = setInterval(async () => {
      try {
        const data = await generateDocument(result.id, docType, false);
        if (data?.content && data.content !== content) {
          setContent(data.content);
          if (onUpdateResult) {
            onUpdateResult(prev => ({
              ...prev,
              documents: { ...(prev.documents || {}), [docType]: data.content }
            }));
          }
        }
      } catch (err) {
        console.warn('Failed polling for flowchart updates', err);
      }
    }, 3000);

    return () => clearInterval(pollInterval);
  }, [content, docType, result?.id, onUpdateResult]);

  // Close download menu on outside click
  useEffect(() => {
    const handleClick = (e) => {
      if (downloadMenuRef.current && !downloadMenuRef.current.contains(e.target)) {
        setShowDownloadMenu(false);
      }
    };
    document.addEventListener('mousedown', handleClick);
    return () => document.removeEventListener('mousedown', handleClick);
  }, []);

  // Extract headings for Table of Contents
  const headings = useMemo(() => extractHeadings(content), [content]);

  // Calculate dynamic page numbers for the inline TOC
  useEffect(() => {
    if (!content || !contentRef.current) return;

    const calculatePages = () => {
      const pageEl = contentRef.current;
      if (!pageEl) return;

      // Calculate virtual A4 page height based on current width and standard A4 aspect ratio (with margins)
      // width: 7.27in, height: 10.49in -> ratio = 1.4429
      const pageHeightPx = pageEl.clientWidth * 1.4429;
      const newPageNumbers = {};

      let virtualShift = 0;

      // Simulate page break after TOC
      const tocEl = pageEl.querySelector('.doc-inline-toc');
      if (tocEl) {
        const tocBottom = tocEl.offsetTop + tocEl.offsetHeight;
        if (tocBottom < pageHeightPx) {
          virtualShift += (pageHeightPx - tocBottom);
        }
      }

      const headingElements = Array.from(pageEl.querySelectorAll('h1, h2, h3, h4'));
      headingElements.forEach(el => {
        if (!el.id) return;

        let rawY = el.offsetTop;
        let shiftedY = rawY + virtualShift;

        // Simulate page break before H1
        if (el.tagName.toLowerCase() === 'H1') {
          let pageOffset = shiftedY % pageHeightPx;
          if (pageOffset > 10) {
            virtualShift += (pageHeightPx - pageOffset);
            shiftedY = rawY + virtualShift;
          }
        }

        newPageNumbers[el.id] = Math.floor(shiftedY / pageHeightPx) + 1;
      });
      setPageNumbers(newPageNumbers);
    };

    // Wait for diagrams (Mermaid, BPMN) to render so heights are accurate
    const timer = setTimeout(calculatePages, 1000);
    window.addEventListener('resize', calculatePages);

    return () => {
      clearTimeout(timer);
      window.removeEventListener('resize', calculatePages);
    };
  }, [content]);

  const handleGenerate = async (force = false) => {
    setIsGenerating(true);
    setError(null);
    try {
      const data = await generateDocument(result.id, docType, force);
      setContent(data.content);
      if (onUpdateResult) {
        onUpdateResult(prev => ({
          ...prev,
          documents: { ...(prev.documents || {}), [docType]: data.content }
        }));
      }
    } catch (err) {
      setError(err.message);
    } finally {
      setIsGenerating(false);
    }
  };

  // The handleUpdate function is removed since the update bar is gone. Updates are handled by the Floating Agent now.

  const handleDownloadMd = () => {
    const blob = new Blob([content], { type: 'text/markdown' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `AP_${docType.toUpperCase()}_Document.md`;
    a.click();
    URL.revokeObjectURL(url);
    setShowDownloadMenu(false);
  };

  const handleDownloadDocx = async () => {
    setShowDownloadMenu(false);
    try {
      // Snapshot rendered BPMN + SVG diagrams as PNGs from the DOM, so the
      // Word doc gets actual images instead of raw XML/HTML text.
      const images = await captureRenderedDiagrams(contentRef.current);
      await downloadDocumentDocx(result.id, docType, images);
    } catch (err) {
      setError(err.message);
    }
  };

  const handleDownloadPdf = async () => {
    setShowDownloadMenu(false);

    try {
      const html2pdf = (await import('html2pdf.js')).default;
      const element = contentRef.current;
      if (!element) return;

      // Fix html2pdf freezing & scaling bugs: Convert SVGs to Images temporarily
      const svgs = element.querySelectorAll('svg');
      const replacements = [];

      await Promise.all(Array.from(svgs).map(svg => {
        return new Promise((resolve) => {
          const rect = svg.getBoundingClientRect();

          // Save original attributes
          const originalWidth = svg.getAttribute('width');
          const originalHeight = svg.getAttribute('height');

          // Force intrinsic dimensions so html2canvas doesn't scale it up massively
          svg.setAttribute('width', rect.width);
          svg.setAttribute('height', rect.height);

          const xml = new XMLSerializer().serializeToString(svg);
          const svg64 = btoa(unescape(encodeURIComponent(xml)));
          const image64 = 'data:image/svg+xml;base64,' + svg64;

          const img = document.createElement('img');
          img.onload = resolve;
          img.onerror = resolve; // Continue even if one fails
          img.src = image64;

          // Match SVG dimensions
          img.style.width = rect.width + 'px';
          img.style.height = rect.height + 'px';
          img.style.maxWidth = '100%';
          img.style.objectFit = 'contain';

          svg.parentNode.insertBefore(img, svg);
          svg.style.display = 'none';
          replacements.push({ svg, img, originalWidth, originalHeight });
        });
      }));

      // Create a hidden iframe to COMPLETELY isolate html2canvas from Tailwind's oklch colors.
      // html2canvas parses ALL stylesheets in the document's styleSheets array. 
      const iframe = document.createElement('iframe');
      iframe.style.position = 'absolute';
      iframe.style.width = '1200px';
      iframe.style.height = '100vh';
      iframe.style.left = '-9999px';
      iframe.style.top = '0';
      iframe.style.visibility = 'hidden';
      document.body.appendChild(iframe);

      const iframeDoc = iframe.contentDocument || iframe.contentWindow.document;

      // Copy ONLY the DocumentView scoped styles
      const originalStyles = Array.from(document.querySelectorAll('style'));
      const docStyle = originalStyles.find(s => s.innerHTML && s.innerHTML.includes('.doc-page {'));
      if (docStyle) {
        const newStyle = iframeDoc.createElement('style');
        newStyle.innerHTML = docStyle.innerHTML;
        iframeDoc.head.appendChild(newStyle);
      }

      // ── PDF-specific overrides ────────────────────────────────
      // These rules override the screen styles to make wide tables fit
      // within the A4 page width without a scrollbar (which doesn't exist in PDF).
      const pdfOverrides = iframeDoc.createElement('style');
      pdfOverrides.innerHTML = `
        /* Remove horizontal scroll — tables must fit the page */
        .doc-table-wrapper {
          overflow: visible !important;
          overflow-x: visible !important;
          width: 100% !important;
        }
        /* Force the table to FIT the page width so no column is ever clipped.
           table-layout: fixed guarantees the table never exceeds 100% width,
           and min-width:0 cancels the on-screen max-content/min-width sizing. */
        .doc-table {
          width: 100% !important;
          min-width: 0 !important;
          table-layout: fixed !important;
          font-size: 8.5px !important;
        }
        /* Header cells: wrap (not nowrap) so headings can't be cut off */
        .doc-th {
          font-size: 7.5px !important;
          padding: 5px 6px !important;
          white-space: normal !important;
          word-break: break-word !important;
          overflow-wrap: anywhere !important;
        }
        /* Data cells: wrap long content; drop the fixed width caps */
        .doc-td {
          font-size: 8.5px !important;
          padding: 5px 6px !important;
          min-width: 0 !important;
          max-width: none !important;
          word-break: break-word !important;
          overflow-wrap: anywhere !important;
        }
        /* Tree block — keep it from being cut mid-block */
        .doc-tree {
          page-break-inside: avoid;
          break-inside: avoid;
        }
      `;
      iframeDoc.head.appendChild(pdfOverrides);

      // Import the content into the iframe so its ownerDocument is iframeDoc
      const clonedContent = iframeDoc.importNode(element, true);

      // Force width to 1200px so it doesn't wrap differently in html2pdf
      clonedContent.style.width = '1200px';
      clonedContent.style.margin = '0';
      clonedContent.style.padding = '0';
      iframeDoc.body.appendChild(clonedContent);

      // ── Cap diagram images to at most 85% of one PDF page height ────────
      // This prevents any single Mermaid diagram from being taller than a page,
      // which is what causes the "diagram split across two pages" problem.
      // A4 with 0.5in top/bottom margins at 1200px wide → content ≈ 1556px tall.
      // pageHeightPx below is calculated from the actual html2pdf slice height.
      const A4_RATIO = 297 / 210;           // 1.4142857
      // html2pdf slices the canvas at (contentWidth × A4_RATIO) accounting for margins.
      // Empirically: margin 0.5in at 96dpi ≈ 48px each side → 96px less per page.
      // But html2pdf uses the full-page ratio without margin for slicing, then adds
      // margin white space inside jsPDF. Safe approximation:
      const pageHeightPx = Math.round(1200 * A4_RATIO) - 96; // ≈ 1601px
      const maxDiagramHeight = Math.round(pageHeightPx * 0.85); // ≈ 1361px

      Array.from(clonedContent.querySelectorAll('.doc-diagram img')).forEach(img => {
        img.style.maxHeight = maxDiagramHeight + 'px';
        img.style.maxWidth  = '100%';
        img.style.width     = 'auto';
        img.style.height    = 'auto';
        img.style.display   = 'block';
        img.style.margin    = '0 auto';
      });

      // ── CRITICAL: wait for all <img> elements to load in the iframe ─────
      // SVG→img conversions have data-URL srcs that need to be decoded and
      // laid out in the iframe's document. If we measure before they load,
      // getBoundingClientRect().height returns 0 and our spacer guard is skipped.
      await Promise.all(
        Array.from(clonedContent.querySelectorAll('img')).map(img =>
          new Promise(resolve => {
            if (img.complete && img.naturalHeight > 0) { resolve(); return; }
            img.onload  = resolve;
            img.onerror = resolve; // still resolve on error so we don't hang
          })
        )
      );
      // Small additional delay: give the browser time to reflow layout after loads
      await new Promise(r => setTimeout(r, 300));

      // --- 4. Calculate exact PDF page numbers and MANUALLY PAGINATE ---
      const contentRectTop = clonedContent.getBoundingClientRect().top;
      const docPage = clonedContent.querySelector('.doc-page') || clonedContent;

      // ── Pass 3: Prevent tables/diagrams/trees from starting in the ────────
      // last 15% of a page (where they'd immediately get cut).
      // We only insert a small spacer to bump the element to the next page.
      // We do NOT insert spacers before headings — that was causing blank pages.
      const BOTTOM_ZONE = pageHeightPx * 0.15; // bottom 15% of each page

      Array.from(
        // Manual spacer pagination disabled — html2pdf pagebreak.avoid handles this now.
        docPage.querySelectorAll('.__manual_pagination_disabled__')
      ).forEach(el => {
        const rect = el.getBoundingClientRect();
        const currentY        = rect.top - contentRectTop;
        const elHeight        = rect.height;
        const pageOffset      = currentY % pageHeightPx;
        const remainingOnPage = pageHeightPx - pageOffset;

        // Guard: element must have height (img loaded) AND
        // it must not fit in the remaining space (would be split).
        // Only push when remaining space is less than 25% of page OR
        // less than the element's own height — whichever is smaller threshold.
        const tooCloseToBottom = remainingOnPage < BOTTOM_ZONE;
        const wontFit = elHeight > 0 && elHeight > remainingOnPage;

        if ((tooCloseToBottom || wontFit) && pageOffset > 30) {
          const spacer = iframeDoc.createElement('div');
          spacer.style.height = remainingOnPage + 'px';
          el.parentNode.insertBefore(spacer, el);
        }
      });

      // ── Pass 4: Update inline TOC page numbers after all spacers ───────
      Array.from(docPage.querySelectorAll('h1, h2, h3, h4')).forEach(el => {
        if (!el.id) return;
        const currentY = el.getBoundingClientRect().top - contentRectTop;
        const pageNum = Math.floor(currentY / pageHeightPx) + 1;
        const tocPageSpan = clonedContent.querySelector(
          `.doc-inline-toc .toc-item[data-heading-id="${el.id}"] .toc-page`
        );
        if (tocPageSpan) tocPageSpan.innerText = pageNum;
      });

      // --- 5. Generate PDF and add footer ---
      const opt = {
        margin: [0.5, 0.6, 0.5, 0.6],
        filename: `${docType.toUpperCase()}_Document.pdf`,
        image: { type: 'jpeg', quality: 0.98 },
        html2canvas: {
          scale: 2,
          useCORS: true,
          logging: false,
          windowWidth: 1200,
          width: 1200
        },
        jsPDF: { unit: 'in', format: 'a4', orientation: 'portrait' },
        // Let html2pdf insert page breaks BEFORE elements that would be split,
        // so diagrams, images and table rows always stay whole on one page.
        pagebreak: {
          mode: ['css', 'legacy'],
          avoid: ['.doc-diagram', '.doc-flowchart', '.doc-tree', 'img', 'tr']
        }
      };

      await html2pdf().from(clonedContent).set(opt).toPdf().get('pdf').then((pdf) => {
        const totalPages = pdf.internal.getNumberOfPages();
        for (let i = 1; i <= totalPages; i++) {
          pdf.setPage(i);
          pdf.setFontSize(9);
          pdf.setTextColor(120);
          // Add "Page X of Y" at the bottom right corner
          pdf.text(`Page ${i} of ${totalPages}`, pdf.internal.pageSize.getWidth() - 1.5, pdf.internal.pageSize.getHeight() - 0.3);
        }
      }).save();

      // Clean up
      document.body.removeChild(iframe);

      // Restore original SVGs
      replacements.forEach(({ svg, img, originalWidth, originalHeight }) => {
        svg.style.display = '';

        if (originalWidth !== null) svg.setAttribute('width', originalWidth);
        else svg.removeAttribute('width');

        if (originalHeight !== null) svg.setAttribute('height', originalHeight);
        else svg.removeAttribute('height');

        if (img.parentNode) {
          img.parentNode.removeChild(img);
        }
      });

    } catch (err) {
      setError('PDF generation failed: ' + err.message);
    }
  };

  const handleRegenerate = async () => {
    // Clear out the current cached view on the frontend
    if (onUpdateResult) {
      onUpdateResult(prev => {
        const docs = { ...(prev.documents || {}) };
        delete docs[docType];
        return { ...prev, documents: docs };
      });
    }
    setContent(null);

    // Call generate with force=true to bypass the MongoDB cache
    await handleGenerate(true);
  };

  const scrollToHeading = (id) => {
    const el = document.getElementById(id);
    if (el) el.scrollIntoView({ behavior: 'smooth', block: 'start' });
  };

  const docLabel = docType === 'pdd' ? 'Process Design Document' : 'Solution Design Document';

  return (
    <div className="space-y-4" style={{ animation: 'fade-in-up 0.4s ease-out forwards' }}>
      {/* ── Top Controls ─────────────────────────────────────── */}
      <div className="flex items-center justify-between flex-wrap gap-4">
        {/* Doc Type Toggle */}
        <div className="flex gap-1 p-1 rounded-xl bg-slate-800/60 border border-white/5">
          {[
            { id: 'pdd', label: 'PDD', full: 'Process Design Document' },
            { id: 'sdd', label: 'SDD', full: 'Solution Design Document' },
          ].map(opt => (
            <button
              key={opt.id}
              onClick={() => setDocType(opt.id)}
              className={`flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-semibold transition-all duration-200 ${docType === opt.id
                ? 'bg-violet-500 text-white shadow-lg shadow-violet-500/25'
                : 'text-slate-400 hover:text-white hover:bg-white/5'
                }`}
              title={opt.full}
            >
              <BookOpen size={14} />
              {opt.label}
            </button>
          ))}
        </div>

        {/* Custom template upload — generated doc follows its structure & design */}
        <div className="flex items-center gap-2">
          <input
            ref={templateInputRef}
            type="file"
            accept=".docx"
            onChange={handleUploadTemplate}
            className="hidden"
          />
          <button
            onClick={() => templateInputRef.current?.click()}
            disabled={isUploadingTemplate}
            title="Upload a .docx template; the generated document will follow its structure and design"
            className={`flex items-center gap-2 px-3 py-2 rounded-lg text-xs font-semibold border transition-all ${templateStatus[docType] ? 'bg-emerald-500/20 text-emerald-300 border-emerald-500/30' : 'text-slate-400 hover:text-white bg-slate-800/50 hover:bg-slate-700/60 border-white/5'}`}
          >
            <FileText size={13} />
            {isUploadingTemplate ? 'Uploading…' : templateStatus[docType] ? `${docType.toUpperCase()} Template ✓` : 'Upload Template'}
          </button>
          {templateStatus[docType] && (
            <button
              onClick={handleRemoveTemplate}
              title="Remove uploaded template"
              className="flex items-center gap-1 px-2 py-2 rounded-lg text-xs font-semibold text-slate-400 hover:text-red-300 bg-slate-800/50 hover:bg-slate-700/60 border border-white/5 transition-all"
            >
              <X size={13} />
            </button>
          )}
        </div>

        {/* Action Buttons */}
        {content && (
          <div className="flex items-center gap-2">
            {/* TOC toggle */}
            <button
              onClick={() => setShowToc(!showToc)}
              className={`flex items-center gap-2 px-3 py-2 rounded-lg text-xs font-semibold border border-white/5 transition-all ${showToc ? 'bg-violet-500/20 text-violet-300 border-violet-500/30' : 'text-slate-400 hover:text-white bg-slate-800/50 hover:bg-slate-700/60'
                }`}
            >
              <List size={13} />
              Index
            </button>

            <button
              onClick={handleRegenerate}
              disabled={isGenerating}
              className="flex items-center gap-2 px-3 py-2 rounded-lg text-xs font-semibold text-slate-400 hover:text-white bg-slate-800/50 hover:bg-slate-700/60 border border-white/5 transition-all"
            >
              <RefreshCw size={13} className={isGenerating ? 'animate-spin' : ''} />
              Regenerate
            </button>

            {/* Download — directly downloads Word document */}
            <button
              onClick={handleDownloadDocx}
              className="flex items-center gap-2 px-4 py-2 rounded-lg text-xs font-semibold text-white bg-violet-500/80 hover:bg-violet-500 transition-all shadow-md shadow-violet-500/20"
            >
              <Download size={13} />
              Download
            </button>
            
            {/* Manual Edit Button */}
            <button
              onClick={handleToggleEditMode}
              className={`flex items-center gap-2 px-4 py-2 rounded-lg text-xs font-semibold transition-all border ${
                isEditingMode
                  ? 'bg-amber-500/20 text-amber-300 border-amber-500/30'
                  : 'text-slate-400 hover:text-white bg-slate-800/50 hover:bg-slate-700/60 border-white/5'
              }`}
            >
              <Edit size={13} />
              {isEditingMode ? 'Exit Edit Mode' : 'Edit Manually'}
            </button>
          </div>
        )}
      </div>

      {/* Error */}
      {error && (
        <div className="px-4 py-3 rounded-xl bg-red-500/10 border border-red-500/20 text-red-400 text-sm font-medium">{error}</div>
      )}

      {/* ── Empty State ──────────────────────────────────────── */}
      {!content && !isGenerating && (
        <div className="flex flex-col items-center justify-center py-20 rounded-2xl border border-dashed border-slate-700 bg-slate-900/30">
          <div className="w-16 h-16 rounded-2xl bg-violet-500/10 border border-violet-500/20 flex items-center justify-center mb-5">
            <BookOpen size={28} className="text-violet-400" />
          </div>
          <h3 className="text-lg font-bold text-white mb-2">Generate {docLabel}</h3>
          <p className="text-sm text-slate-400 mb-6 max-w-md text-center">
            Our AI agent will analyze your assessment data and create a comprehensive, professional-grade {docType.toUpperCase()} document.
          </p>
          <button onClick={() => handleGenerate()}
            className="flex items-center gap-2 px-6 py-3 rounded-xl bg-violet-500 text-white font-semibold hover:bg-violet-600 transition-all shadow-lg shadow-violet-500/25 hover:shadow-xl hover:shadow-violet-500/30">
            <Settings size={16} className="animate-pulse" />
            Generate {docType.toUpperCase()}
          </button>
        </div>
      )}

      {/* ── Loading State: Generate ───────────────────────────── */}
      {isGenerating && !content && (
        <div className="flex flex-col items-center justify-center py-20 rounded-2xl border border-slate-800 bg-slate-900/50" style={{ animation: 'fade-in-up 0.3s ease-out forwards' }}>
          <div className="relative mb-5">
            <div className="w-16 h-16 rounded-2xl bg-violet-500/10 border border-violet-500/20 flex items-center justify-center">
              <Sparkles size={28} className="text-violet-400" />
            </div>
            <div className="absolute -bottom-1 -right-1 w-6 h-6 rounded-full bg-slate-900 border border-slate-700 flex items-center justify-center">
              <Loader2 size={14} className="text-violet-400 animate-spin" />
            </div>
          </div>
          <h3 className="text-lg font-bold text-white mb-1">Generating {docType.toUpperCase()}...</h3>
          <p className="text-sm text-slate-400">AlphaFold AI is writing your document</p>
          <div className="flex items-center gap-4 mt-5 text-xs text-slate-500">
            <span className="flex items-center gap-1.5"><CheckCircle2 size={11} className="text-emerald-400" /> Analysing assessment</span>
            <span className="text-slate-700">→</span>
            <span className="flex items-center gap-1.5"><Loader2 size={11} className="animate-spin text-violet-400" /> Writing document</span>
            <span className="text-slate-700">→</span>
            <span className="flex items-center gap-1.5 text-slate-600">Generating flowcharts</span>
          </div>
          <p className="text-xs text-slate-600 mt-3">It will take a moment to generate your report...</p>
        </div>
      )}




      {/* ── Document Viewer ──────────────────────────────────── */}
      {content && (
        <div className="flex gap-5">
          {/* ── Sidebar: Table of Contents ────────────────────── */}
          {showToc && headings.length > 0 && (
            <aside className="w-64 flex-shrink-0 sticky top-4 self-start max-h-[calc(100vh-120px)] overflow-y-auto rounded-2xl border border-white/5 bg-slate-900/70 backdrop-blur-md"
              style={{ animation: 'fade-in-up 0.3s ease-out forwards' }}>
              <div className="px-4 py-3 border-b border-white/5">
                <h4 className="text-xs font-bold text-slate-300 uppercase tracking-widest flex items-center gap-2">
                  <List size={12} />
                  Table of Contents
                </h4>
              </div>
              <nav className="p-2">
                {headings.map((h, i) => (
                  <button
                    key={i}
                    onClick={() => scrollToHeading(h.id)}
                    className="w-full text-left flex items-start gap-1.5 px-2 py-1.5 rounded-lg text-slate-400 hover:text-white hover:bg-white/5 transition-colors group"
                    style={{ paddingLeft: `${(h.level - 1) * 12 + 8}px` }}
                  >
                    {h.level <= 2 && <ChevronRight size={10} className="mt-1 flex-shrink-0 text-violet-400 opacity-0 group-hover:opacity-100 transition-opacity" />}
                    <span className={`text-[11px] leading-snug ${h.level === 1 ? 'font-bold text-white' : h.level === 2 ? 'font-semibold text-slate-300' : 'font-normal'}`}>
                      {h.text}
                    </span>
                  </button>
                ))}
              </nav>
            </aside>
          )}

          {/* ── Main Document Page ────────────────────────────── */}
          <div className="flex-1 min-w-0">
            <div className="doc-viewer rounded-2xl overflow-hidden border border-slate-700/40 shadow-2xl shadow-black/30">
              {/* Document title bar */}
              <div className="doc-titlebar flex items-center justify-between px-6 py-3">
                <div className="flex items-center gap-3">
                  <div className="w-7 h-7 rounded-lg bg-violet-500/20 border border-violet-500/30 flex items-center justify-center">
                    <BookOpen size={14} className="text-violet-400" />
                  </div>
                  <div>
                    <h3 className="text-xs font-bold text-slate-200">{docLabel}</h3>
                    <span className="text-[9px] text-slate-500">Generated by AlphaFold AI • {new Date().toLocaleDateString()}</span>
                  </div>
                </div>
                <span className="px-2 py-0.5 rounded-full bg-emerald-500/10 border border-emerald-500/20 text-emerald-400 text-[9px] font-bold uppercase tracking-wider">
                  Saved
                </span>
              </div>

              {/* Template Information Banner */}
              {templateStatus[docType] && (
                <div className="bg-indigo-500/10 border-b border-indigo-500/20 px-6 py-3 flex items-start gap-3">
                  <div className="mt-0.5 text-indigo-400">
                    <FileText size={16} />
                  </div>
                  <div>
                    <h4 className="text-sm font-semibold text-indigo-300">Custom Template Active</h4>
                    <p className="text-xs text-indigo-200/80 mt-0.5 leading-relaxed">
                      The content below is structured based on your uploaded Word template. 
                      <strong> To view the final document with your custom designs, colors, fonts, and logos applied, please click the Download button and select Word Document (.docx).</strong>
                    </p>
                  </div>
                </div>
              )}

              {/* The "paper" page */}
              <SelectionCommentWrapper
                docType={docType}
                onAddComment={({ selectedText, comment, docType: dt }) => {
                  setPendingDocEdits(prev => [...prev, { selectedText, comment, docType: dt }]);
                  if (onAgentEditRequest) onAgentEditRequest();
                }}
              >
              <div ref={contentRef} className="doc-page">
                {headings.length > 0 && (
                  <div className="doc-inline-toc">
                    <h2>Table of Contents</h2>
                    <div className="toc-list">
                      {headings.map((h, i) => (
                        <div key={i} className={`toc-item level-${h.level}`} onClick={() => scrollToHeading(h.id)} data-heading-id={h.id}>
                          <span className="toc-text">{h.text}</span>
                          <span className="toc-leader"></span>
                          <span className="toc-page">{pageNumbers[h.id] || '-'}</span>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {isEditingMode ? (
                  <div className="mt-4">
                    <div className="flex items-center justify-between mb-2">
                      <p className="text-xs font-bold text-slate-400 uppercase tracking-wider">Visual Markdown Editor</p>
                      <button
                        onClick={handleSaveManualEdits}
                        disabled={isSavingManual || draftContent === content}
                        className="flex items-center gap-2 px-4 py-1.5 rounded bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-bold transition-colors disabled:opacity-50"
                      >
                        {isSavingManual ? <Loader2 size={12} className="animate-spin" /> : <Settings size={12} />}
                        Save Changes
                      </button>
                    </div>
                    <div className="bg-white text-slate-800 rounded-xl overflow-hidden mt-4 prose-sm max-w-none shadow-inner border border-slate-700/50">
                      <MDXEditor
                        markdown={draftContent}
                        onChange={setDraftContent}
                        contentEditableClassName="prose prose-sm max-w-none p-6 outline-none min-h-[600px]"
                        plugins={[
                          headingsPlugin(),
                          listsPlugin(),
                          quotePlugin(),
                          thematicBreakPlugin(),
                          markdownShortcutPlugin(),
                          tablePlugin(),
                          diffSourcePlugin({ viewMode: 'rich-text', diffMarkdown: draftContent }),
                          codeBlockPlugin({
                            codeBlockEditorDescriptors: [
                              {
                                match: (language) => language === 'mermaid',
                                priority: 100,
                                Editor: (props) => (
                                  <div className="my-4 p-4 border border-slate-300/50 bg-slate-50/50 rounded-xl flex flex-col gap-2 relative group">
                                    <span className="text-[10px] uppercase font-bold text-slate-400 absolute top-2 right-3">Mermaid Diagram (Read Only)</span>
                                    <div className="pointer-events-none">
                                      <MermaidDiagram chart={props.code} />
                                    </div>
                                  </div>
                                )
                              },
                              {
                                match: (language) => language === 'bpmn',
                                priority: 100,
                                Editor: (props) => (
                                  <div className="my-4 p-4 border border-slate-300/50 bg-slate-50/50 rounded-xl flex flex-col gap-2 relative group">
                                    <span className="text-[10px] uppercase font-bold text-slate-400 absolute top-2 right-3">BPMN Diagram (Read Only)</span>
                                    <div className="pointer-events-none">
                                      <BpmnDiagram xml={props.code} />
                                    </div>
                                  </div>
                                )
                              }
                            ]
                          }),
                          codeMirrorPlugin({ codeBlockLanguages: { mermaid: 'Mermaid', bpmn: 'BPMN', text: 'Text', '': 'Plain Text' } }),
                          toolbarPlugin({
                            toolbarContents: () => (
                              <DiffSourceToggleWrapper>
                                <div className="flex flex-wrap items-center gap-1 border-b border-slate-200 bg-slate-50 p-2 text-slate-700">
                                  <UndoRedo />
                                  <div className="w-px h-6 bg-slate-300 mx-1" />
                                  <BlockTypeSelect />
                                  <div className="w-px h-6 bg-slate-300 mx-1" />
                                  <BoldItalicUnderlineToggles />
                                  <div className="w-px h-6 bg-slate-300 mx-1" />
                                  <CreateLink />
                                  <InsertTable />
                                  <InsertCodeBlock />
                                </div>
                              </DiffSourceToggleWrapper>
                            )
                          })
                        ]}
                      />
                    </div>
                  </div>
                ) : (
                  <ReactMarkdown
                    remarkPlugins={[remarkGfm]}
                    rehypePlugins={[rehypeRaw]}
                    components={markdownComponents}
                  >
                    {sanitizeContent(content)}
                  </ReactMarkdown>
                )}
              </div>
              </SelectionCommentWrapper>
            </div>

          </div>
        </div>
      )}

      {/* Selection UI now delegated to SelectionCommentWrapper */}

      {/* ── Scoped Document Styles ────────────────────────────── */}
      <style>{`
        @keyframes fade-in {
          from { opacity: 0; }
          to { opacity: 1; }
        }
        @keyframes scale-up {
          from { opacity: 0; transform: scale(0.95); }
          to { opacity: 1; transform: scale(1); }
        }
        @keyframes bounce-short {
          0%, 100% { transform: translateY(0) translateX(-50%); }
          50% { transform: translateY(-4px) translateX(-50%); }
        }
        .animate-bounce-short {
          animation: bounce-short 2s infinite ease-in-out;
        }

        .doc-viewer {
          background: linear-gradient(145deg, #1e1e2e 0%, #161622 100%);
        }
        .doc-titlebar {
          background: rgba(30, 30, 50, 0.95);
          border-bottom: 1px solid rgba(255,255,255,0.04);
        }

        /* ── The "paper" page ────────────────────────────────── */
        .doc-page {
          background: #fdfdfe;
          color: #1a1a2e;
          padding: 3rem 3.5rem;
          min-height: 600px;
          font-family: 'Georgia', 'Times New Roman', serif;
          font-size: 13.5px;
          line-height: 1.75;
        }

        /* ── Headings ────────────────────────────────────────── */
        .doc-page h1 {
          font-family: 'Inter', 'Segoe UI', sans-serif;
          font-size: 1.65rem;
          font-weight: 800;
          color: #1a1a3e;
          margin: 0 0 0.4rem 0;
          letter-spacing: -0.02em;
        }
        .doc-page h2 {
          font-family: 'Inter', 'Segoe UI', sans-serif;
          font-size: 1.2rem;
          font-weight: 700;
          color: #2d2b55;
          margin: 2.2rem 0 0.7rem 0;
          padding-bottom: 0.45rem;
          border-bottom: 2px solid #e8e6f0;
        }
        .doc-page h3 {
          font-family: 'Inter', 'Segoe UI', sans-serif;
          font-size: 0.95rem;
          font-weight: 650;
          color: #3d3a6e;
          margin: 1.6rem 0 0.5rem 0;
        }
        .doc-page h4 {
          font-family: 'Inter', 'Segoe UI', sans-serif;
          font-size: 0.85rem;
          font-weight: 600;
          color: #4a4780;
          margin: 1.2rem 0 0.4rem 0;
        }

        /* ── Paragraphs ──────────────────────────────────────── */
        .doc-page p {
          margin: 0.55rem 0;
          color: #2c2c3e;
        }

        /* ── Bold & italic ───────────────────────────────────── */
        .doc-page strong { color: #1a1a2e; font-weight: 700; }
        .doc-page em { font-style: italic; color: #3a3a55; }

        /* ── Lists ───────────────────────────────────────────── */
        .doc-page ul { margin: 0.5rem 0 0.5rem 1.4rem; list-style: disc; }
        .doc-page ol { margin: 0.5rem 0 0.5rem 1.4rem; list-style: decimal; }
        .doc-page li { margin: 0.25rem 0; color: #2c2c3e; }
        .doc-page li::marker { color: #6c63ff; }

        /* ── Tables ──────────────────────────────────────────── */
        .doc-table-wrapper {
          margin: 1.2rem 0;
          border-radius: 8px;
          /* overflow-x: auto lets wide tables scroll instead of clipping columns */
          overflow-x: auto;
          overflow-y: visible;
          border: 1px solid #d8d6e8;
          box-shadow: 0 1px 4px rgba(0,0,0,0.04);
          /* Custom scrollbar so users notice they can scroll */
          scrollbar-width: thin;
          scrollbar-color: #b0aed8 #f0eef8;
        }
        .doc-table-wrapper::-webkit-scrollbar { height: 5px; }
        .doc-table-wrapper::-webkit-scrollbar-track { background: #f0eef8; }
        .doc-table-wrapper::-webkit-scrollbar-thumb { background: #b0aed8; border-radius: 10px; }
        .doc-table {
          /* min-content prevents columns from being crushed below their content width */
          width: max-content;
          min-width: 100%;
          border-collapse: collapse;
          font-family: 'Inter', 'Segoe UI', sans-serif;
          font-size: 12px;
          table-layout: auto;
        }
        .doc-th {
          background: linear-gradient(135deg, #2d2b55, #3d3a6e);
          color: #fff;
          font-weight: 600;
          padding: 10px 14px;
          text-align: left;
          border: 1px solid #4a4780;
          white-space: nowrap;
          text-transform: uppercase;
          letter-spacing: 0.04em;
          font-size: 10.5px;
        }
        .doc-td {
          padding: 9px 14px;
          border: 1px solid #e4e2ee;
          color: #2c2c3e;
          /* Allow long words to wrap rather than bust out of the cell */
          word-break: break-word;
          min-width: 80px;
          max-width: 260px;
          vertical-align: top;
        }
        .doc-table tbody tr:nth-child(even) {
          background: #f6f5fb;
        }
        .doc-table tbody tr:hover {
          background: #eeedf8;
        }

        /* ── File-tree block ─────────────────────────────────── */
        .doc-tree {
          margin: 1rem 0;
          padding: 16px 20px;
          background: linear-gradient(135deg, #1e1a3e 0%, #2a2550 100%);
          border-radius: 10px;
          border: 1px solid rgba(108,99,255,0.25);
          box-shadow: 0 4px 16px rgba(108,99,255,0.1);
          font-family: 'Consolas', 'Monaco', monospace;
          font-size: 12.5px;
          line-height: 1.8;
        }
        .doc-tree-row {
          display: flex;
          align-items: baseline;
          gap: 6px;
          padding: 1px 0;
        }
        .doc-tree-root {
          margin-bottom: 4px;
        }
        .doc-tree-connector {
          color: rgba(108,99,255,0.5);
          flex-shrink: 0;
          user-select: none;
          font-size: 11px;
        }
        .doc-tree-name {
          flex-shrink: 0;
        }
        .doc-tree-dir {
          color: #a78bfa;
          font-weight: 600;
        }
        .doc-tree-file {
          color: #94a3b8;
        }
        .doc-tree-root .doc-tree-dir {
          color: #c4b5fd;
          font-size: 13.5px;
        }
        .doc-tree-comment {
          color: rgba(148,163,184,0.55);
          font-style: italic;
          font-size: 11px;
          margin-left: 8px;
          flex: 1;
        }

        /* ── Horizontal rule / divider ────────────────────────── */
        .doc-divider {
          margin: 2rem 0;
          height: 2px;
          background: linear-gradient(90deg, transparent, #d0cee6, transparent);
        }

        /* ── SVG Flowchart diagrams (generated by AI) ──────── */
        .doc-flowchart {
          margin: 2rem 0;
          text-align: center;
          background: #f8f9fb;
          border: 1px solid #e0dff0;
          border-radius: 12px;
          padding: 1.5rem 1rem;
          box-shadow: 0 2px 12px rgba(108,99,255,0.06);
          page-break-inside: avoid;
          break-inside: avoid;
        }
        .doc-flowchart svg {
          max-width: 100%;
          height: auto;
          display: block;
          margin: 0 auto;
        }
        .doc-flowchart-loading {
          background: linear-gradient(135deg, #f8f9fb 0%, #f0eff9 100%);
          border: 1px dashed #6c63ff;
          min-height: 140px;
          display: flex;
          align-items: center;
          justify-content: center;
        }
        .doc-flowchart-skeleton {
          display: flex;
          align-items: center;
          justify-content: center;
          gap: 0.75rem;
          color: #5b53e4;
          font-weight: 600;
          font-size: 0.95rem;
        }
        .doc-flowchart-spinner {
          display: inline-block;
          animation: spin-pulse 1.5s ease-in-out infinite;
        }
        @keyframes spin-pulse {
          0% { transform: scale(0.9) rotate(0deg); opacity: 0.7; }
          50% { transform: scale(1.15) rotate(180deg); opacity: 1; }
          100% { transform: scale(0.9) rotate(360deg); opacity: 0.7; }
        }

        /* ── Code blocks ─────────────────────────────────────── */
        .doc-page pre {
          background: #f4f3f9;
          border: 1px solid #e0dff0;
          border-radius: 6px;
          padding: 12px 16px;
          overflow-x: auto;
          font-family: 'Consolas', 'Monaco', monospace;
          font-size: 11.5px;
          color: #3a3860;
          margin: 0.8rem 0;
        }
        .doc-page code {
          font-family: 'Consolas', 'Monaco', monospace;
          font-size: 11.5px;
          background: #edecf5;
          padding: 1px 5px;
          border-radius: 3px;
          color: #5a50a0;
        }
        .doc-page pre code {
          background: none;
          padding: 0;
        }

        /* ── Blockquote ──────────────────────────────────────── */
        .doc-page blockquote {
          margin: 1rem 0;
          padding: 0.6rem 1rem;
          border-left: 3px solid #6c63ff;
          background: #f0eef8;
          color: #3a3860;
          border-radius: 0 6px 6px 0;
        }

        /* ── Inline TOC ──────────────────────────────────────── */
        .doc-inline-toc {
          margin-bottom: 3rem;
          page-break-after: always;
        }
        .doc-inline-toc h2 {
          border-bottom: 2px solid #1a1a3e;
          padding-bottom: 0.5rem;
          margin-bottom: 1.5rem;
        }
        .toc-list {
          display: flex;
          flex-direction: column;
          gap: 0.4rem;
        }
        .toc-item {
          display: flex;
          align-items: flex-end;
          cursor: pointer;
          color: #2c2c3e;
          font-family: 'Inter', 'Segoe UI', sans-serif;
        }
        .toc-item:hover .toc-text {
          color: #6c63ff;
        }
        .toc-item.level-1 { font-weight: 700; margin-top: 0.5rem; }
        .toc-item.level-2 { font-weight: 600; margin-left: 1rem; }
        .toc-item.level-3 { font-size: 0.9em; margin-left: 2rem; color: #4a4a60; }
        .toc-item.level-4 { font-size: 0.85em; margin-left: 3rem; color: #6a6a80; }
        
        .toc-leader {
          flex-grow: 1;
          border-bottom: 1px dotted #ccc;
          margin: 0 0.5rem 0.3rem 0.5rem;
        }
        .toc-page {
          font-weight: 600;
          min-width: 1.5rem;
          text-align: right;
        }

        /* ── TOC sidebar scrollbar ───────────────────────────── */
        aside::-webkit-scrollbar { width: 3px; }
        aside::-webkit-scrollbar-thumb { background: rgba(255,255,255,0.08); border-radius: 10px; }

        /* ── Print Styles ────────────────────────────────────── */
        @media print {
          body * {
            visibility: hidden;
          }
          .doc-page, .doc-page * {
            visibility: visible;
          }
          .doc-page {
            position: absolute;
            left: 0;
            top: 0;
            width: 100%;
            margin: 0;
            padding: 0;
            background: white !important;
            color: black !important;
          }
          .doc-titlebar, aside, button, nav, header {
            display: none !important;
          }
          .doc-page pre {
            white-space: pre-wrap;
            word-wrap: break-word;
          }
        }
      `}</style>
    </div>
  );
}
