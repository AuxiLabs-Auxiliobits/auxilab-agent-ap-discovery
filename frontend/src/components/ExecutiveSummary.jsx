import { Sparkles } from 'lucide-react';

export default function ExecutiveSummary({ summary }) {
  return (
    <div
      className="relative rounded-2xl border border-white/[0.06] bg-gradient-to-br from-indigo-500/[0.04] to-purple-500/[0.04] p-7 overflow-hidden"
      style={{ animation: 'fade-in-up 0.5s ease-out 0.2s both' }}
    >
      {/* Decorative glow */}
      <div className="absolute top-0 right-0 w-40 h-40 bg-indigo-500/10 rounded-full blur-3xl pointer-events-none" />
      
      <div className="relative">
        <div className="flex items-center gap-3 mb-4">
          <div className="w-8 h-8 rounded-lg bg-amber-500/15 flex items-center justify-center">
            <Sparkles size={16} className="text-amber-400" />
          </div>
          <h3 className="text-base font-bold text-white">Executive Summary</h3>
          <span className="px-2.5 py-1 rounded-full bg-amber-500/10 text-amber-400 text-[10px] font-bold uppercase tracking-wider border border-amber-500/20">
            AI Generated
          </span>
        </div>
        <p className="text-sm leading-7 text-slate-300">
          {summary}
        </p>
      </div>
    </div>
  );
}
