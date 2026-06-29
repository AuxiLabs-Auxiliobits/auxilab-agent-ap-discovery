import { AlertTriangle, CheckCircle2, ArrowRight, X } from 'lucide-react';

/*
 * RequiredFactsModal
 * Shown after an analysis when critical discovery facts were NOT found in the
 * source material. These facts drive an accurate, grounded ROI. The user may
 * provide them (re-run in interactive mode) or continue anyway — in which case
 * the report falls back to clearly-labelled assumptions.
 */

const FACT_LABELS = {
  currency: { title: 'Currency', desc: 'Which currency the costs & savings are in (e.g. GBP, USD, EUR).' },
  hourly_rate: { title: 'Loaded hourly labour rate', desc: 'Fully-loaded cost per hour of an AP staff member.' },
  annual_volume: { title: 'Annual transaction volume', desc: 'How many invoices / transactions are processed per year.' },
  fte_total: { title: 'Total FTE on the process', desc: 'How many full-time staff currently run this process.' },
  exception_rate_pct: { title: 'Exception rate (%)', desc: 'Share of transactions that need manual exception handling.' },
};

export default function RequiredFactsModal({ missingFacts = [], onProvide, onContinue }) {
  if (!missingFacts || missingFacts.length === 0) return null;

  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center bg-slate-950/90 backdrop-blur-md p-4">
      <div
        className="w-full max-w-lg rounded-3xl border border-amber-500/20 bg-slate-900/95 backdrop-blur-2xl p-8 shadow-2xl shadow-black/50"
      >
        {/* Header */}
        <div className="flex items-start justify-between mb-2">
          <div className="flex items-center gap-3">
            <div className="w-11 h-11 rounded-xl bg-gradient-to-br from-amber-500/20 to-orange-500/20 border border-amber-500/30 flex items-center justify-center shrink-0">
              <AlertTriangle size={22} className="text-amber-400" />
            </div>
            <div>
              <h3 className="text-base font-bold text-white">A few details are missing</h3>
              <p className="text-xs text-slate-500">Provide these for an accurate, grounded ROI</p>
            </div>
          </div>
          <button
            onClick={onContinue}
            className="p-2 rounded-xl hover:bg-white/5 text-slate-500 hover:text-white transition-colors"
            title="Continue anyway"
          >
            <X size={18} />
          </button>
        </div>

        <p className="text-sm text-slate-400 leading-relaxed mt-4 mb-5">
          Your transcript didn&apos;t clearly state the following critical facts. We can still produce a
          report, but the financial figures will rely on <span className="text-amber-300 font-semibold">labelled assumptions</span>{' '}
          instead of your real numbers.
        </p>

        {/* Missing facts list */}
        <div className="space-y-2.5 mb-6">
          {missingFacts.map((key) => {
            const meta = FACT_LABELS[key] || { title: key, desc: '' };
            return (
              <div
                key={key}
                className="flex items-start gap-3 p-3.5 rounded-xl border border-white/[0.06] bg-slate-800/40"
              >
                <div className="w-6 h-6 rounded-lg bg-amber-500/15 border border-amber-500/25 flex items-center justify-center shrink-0 mt-0.5">
                  <span className="w-1.5 h-1.5 rounded-full bg-amber-400" />
                </div>
                <div>
                  <div className="text-sm font-semibold text-white">{meta.title}</div>
                  {meta.desc && <div className="text-xs text-slate-500 mt-0.5">{meta.desc}</div>}
                </div>
              </div>
            );
          })}
        </div>

        {/* Warning callout */}
        <div className="flex items-start gap-2.5 p-3 rounded-xl bg-amber-500/[0.06] border border-amber-500/15 mb-6">
          <AlertTriangle size={14} className="text-amber-400 shrink-0 mt-0.5" />
          <p className="text-[11px] text-amber-200/80 leading-relaxed">
            If you skip, the ROI, payback period and FTE figures are estimates only and may differ
            significantly from reality. You can re-run anytime with the real numbers.
          </p>
        </div>

        {/* Actions */}
        <div className="flex flex-col sm:flex-row gap-3">
          <button
            onClick={onProvide}
            className="flex-1 flex items-center justify-center gap-2 py-3 px-5 rounded-xl bg-gradient-to-r from-indigo-600 to-violet-600 text-white text-sm font-semibold shadow-lg shadow-indigo-500/25 hover:-translate-y-0.5 transition-all"
          >
            <CheckCircle2 size={16} />
            Provide the answers
          </button>
          <button
            onClick={onContinue}
            className="flex-1 flex items-center justify-center gap-2 py-3 px-5 rounded-xl bg-slate-800 border border-white/10 text-slate-300 text-sm font-semibold hover:bg-slate-700 transition-colors"
          >
            Continue anyway
            <ArrowRight size={16} />
          </button>
        </div>
      </div>
    </div>
  );
}
