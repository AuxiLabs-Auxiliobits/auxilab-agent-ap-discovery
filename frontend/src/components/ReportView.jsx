import { useState } from 'react';
import { FileText, Download, Copy, Check } from 'lucide-react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';

export default function ReportView({ markdownReport }) {
  const [copied, setCopied] = useState(false);

  const handleCopy = async () => {
    await navigator.clipboard.writeText(markdownReport);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const handleDownload = () => {
    const blob = new Blob([markdownReport], { type: 'text/markdown' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'ap-assessment-report.md';
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div
      className="rounded-2xl border border-white/[0.06] bg-white/[0.02] overflow-hidden"
      style={{ animation: 'fade-in-up 0.5s ease-out 0.3s both' }}
    >
      {/* Header */}
      <div className="px-6 py-4 border-b border-white/[0.06] flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="w-8 h-8 rounded-lg bg-indigo-500/15 flex items-center justify-center">
            <FileText size={16} className="text-indigo-400" />
          </div>
          <h3 className="text-base font-bold text-white">Full Assessment Report</h3>
        </div>
        <div className="flex gap-2">
          <button
            onClick={handleCopy}
            className="flex items-center gap-1.5 px-3.5 py-2 rounded-lg text-xs font-semibold bg-slate-800 hover:bg-slate-700 text-slate-300 border border-white/[0.06] transition-all"
          >
            {copied ? <Check size={14} className="text-emerald-400" /> : <Copy size={14} />}
            {copied ? 'Copied!' : 'Copy'}
          </button>
          <button
            onClick={handleDownload}
            className="flex items-center gap-1.5 px-3.5 py-2 rounded-lg text-xs font-semibold bg-indigo-500/15 hover:bg-indigo-500/25 text-indigo-300 border border-indigo-500/20 transition-all"
          >
            <Download size={14} />
            Download .md
          </button>
        </div>
      </div>

      {/* Markdown content */}
      <div className="p-8 max-h-[650px] overflow-y-auto
        [&_h1]:text-xl [&_h1]:font-bold [&_h1]:text-white [&_h1]:mb-4
        [&_h2]:text-lg [&_h2]:font-bold [&_h2]:text-indigo-300 [&_h2]:mt-8 [&_h2]:mb-3 [&_h2]:pb-2 [&_h2]:border-b [&_h2]:border-white/5
        [&_h3]:text-base [&_h3]:font-semibold [&_h3]:text-white [&_h3]:mt-5 [&_h3]:mb-2
        [&_p]:text-sm [&_p]:text-slate-400 [&_p]:leading-7 [&_p]:mb-3
        [&_ul]:pl-5 [&_ul]:mb-3
        [&_li]:text-sm [&_li]:text-slate-400 [&_li]:mb-1
        [&_strong]:text-white [&_strong]:font-semibold
        [&_table]:w-full [&_table]:my-4 [&_table]:text-sm
        [&_th]:px-3 [&_th]:py-2.5 [&_th]:text-left [&_th]:text-xs [&_th]:font-bold [&_th]:uppercase [&_th]:tracking-wider [&_th]:text-slate-500 [&_th]:bg-slate-800/50 [&_th]:border-b [&_th]:border-white/5
        [&_td]:px-3 [&_td]:py-2.5 [&_td]:text-slate-400 [&_td]:border-b [&_td]:border-white/[0.03]
      ">
        <ReactMarkdown remarkPlugins={[remarkGfm]}>{markdownReport}</ReactMarkdown>
      </div>
    </div>
  );
}
