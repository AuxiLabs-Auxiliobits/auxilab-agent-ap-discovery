import { Zap, ArrowRight, TrendingUp } from 'lucide-react';

const PATTERN_STYLES = {
  'Invoice Capture': 'from-indigo-600 to-violet-600 border-indigo-500/25',
  'Data Extraction': 'from-cyan-600 to-teal-600 border-cyan-500/25',
  'PO Matching': 'from-amber-600 to-orange-600 border-amber-500/25',
  'Approval Routing': 'from-rose-600 to-pink-600 border-rose-500/25',
  'Exception Handling': 'from-red-600 to-rose-600 border-red-500/25',
  'Vendor Communication': 'from-blue-600 to-indigo-600 border-blue-500/25',
  'Payment Preparation': 'from-emerald-600 to-teal-600 border-emerald-500/25',
  'Audit Reporting': 'from-purple-600 to-violet-600 border-purple-500/25',
};

const PATTERN_TAG_STYLES = {
  'Invoice Capture': 'bg-indigo-500/15 text-indigo-300 border-indigo-500/25',
  'Data Extraction': 'bg-cyan-500/15 text-cyan-300 border-cyan-500/25',
  'PO Matching': 'bg-amber-500/15 text-amber-300 border-amber-500/25',
  'Approval Routing': 'bg-rose-500/15 text-rose-300 border-rose-500/25',
  'Exception Handling': 'bg-red-500/15 text-red-300 border-red-500/25',
  'Vendor Communication': 'bg-blue-500/15 text-blue-300 border-blue-500/25',
  'Payment Preparation': 'bg-emerald-500/15 text-emerald-300 border-emerald-500/25',
  'Audit Reporting': 'bg-purple-500/15 text-purple-300 border-purple-500/25',
};

export default function OpportunityCards({ opportunities }) {
  return (
    <div style={{ animation: 'fade-in-up 0.5s ease-out 0.4s both' }}>
      <div className="flex items-center gap-3 mb-5">
        <div className="w-8 h-8 rounded-lg bg-amber-500/15 flex items-center justify-center">
          <Zap size={16} className="text-amber-400" />
        </div>
        <h3 className="text-base font-bold text-white">Top Automation Opportunities</h3>
        <span className="px-2.5 py-1 rounded-full bg-indigo-500/10 text-indigo-400 text-[10px] font-bold uppercase tracking-wider border border-indigo-500/20">
          {opportunities.length} found
        </span>
      </div>

      <div className="grid md:grid-cols-2 xl:grid-cols-3 gap-4">
        {opportunities.map((opp, i) => {
          const tagStyle = PATTERN_TAG_STYLES[opp.ap_pattern] || PATTERN_TAG_STYLES['Invoice Capture'];
          const cardStyle = PATTERN_STYLES[opp.ap_pattern] || PATTERN_STYLES['Invoice Capture'];
          const gradientClass = cardStyle.split(' ')[0] + ' ' + cardStyle.split(' ')[1];

          return (
            <div
              key={i}
              className="group relative rounded-2xl border border-white/[0.06] bg-white/[0.02] p-6 hover:bg-white/[0.04] hover:border-white/[0.1] transition-all duration-300 hover:-translate-y-1 hover:shadow-2xl hover:shadow-black/30 flex flex-col"
              style={{ animation: `fade-in-up 0.5s ease-out ${0.4 + i * 0.08}s both` }}
            >
              {/* Top: Pattern tag + Potential + Reduction % */}
              <div className="flex items-start justify-between mb-4">
                <div className="flex flex-col items-start gap-2">
                  <span className={`inline-flex px-3 py-1 rounded-full text-[11px] font-bold border ${tagStyle}`}>
                    {opp.ap_pattern}
                  </span>
                  {opp.automation_analysis?.automation_potential && (
                    <span className={`inline-flex px-2 py-0.5 rounded-full text-[9px] font-bold uppercase tracking-wider border ${
                      opp.automation_analysis.automation_potential.includes('Fully') ? 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20' :
                      opp.automation_analysis.automation_potential.includes('Partially') ? 'bg-amber-500/10 text-amber-400 border-amber-500/20' : 'bg-rose-500/10 text-rose-400 border-rose-500/20'
                    }`}>
                      {opp.automation_analysis.automation_potential}
                    </span>
                  )}
                </div>
                <div className="text-right">
                  <div className="text-2xl font-extrabold text-white">{opp.effort_reduction_pct}%</div>
                  <div className="text-[10px] text-slate-500 uppercase tracking-wider font-semibold">Reduction</div>
                </div>
              </div>

              {/* Step name */}
              <h4 className="text-sm font-bold text-white mb-2 flex items-center gap-2 group-hover:text-indigo-300 transition-colors">
                {opp.step_name}
                <ArrowRight size={14} className="text-slate-600 group-hover:text-indigo-400 transition-colors" />
              </h4>

              {/* Narrative & Detailed Analysis */}
              <div className="flex-1 mb-4 space-y-4">
                {/* Systems Used */}
                {opp.systems_used && opp.systems_used.length > 0 && (
                  <div className="flex flex-wrap gap-1.5">
                    {opp.systems_used.map(sys => (
                      <span key={sys} className="px-2 py-0.5 bg-slate-800 text-slate-300 text-[10px] font-semibold rounded border border-white/10">
                        {sys}
                      </span>
                    ))}
                  </div>
                )}
                
                {opp.automation_analysis ? (
                  <div className="space-y-3">
                    <div>
                      <span className="text-[10px] font-bold text-rose-400 uppercase tracking-wider block mb-1">Manual Process</span>
                      <p className="text-xs text-slate-400 leading-relaxed whitespace-pre-wrap">{opp.automation_analysis.current_manual_process}</p>
                    </div>
                    <div>
                      <span className="text-[10px] font-bold text-amber-400 uppercase tracking-wider block mb-1">Automated Process</span>
                      <p className="text-xs text-amber-200/80 leading-relaxed whitespace-pre-wrap">{opp.automation_analysis.proposed_solution}</p>
                    </div>
                    <div>
                      <span className="text-[10px] font-bold text-emerald-400 uppercase tracking-wider block mb-1">Time & Cost Reduction</span>
                      <p className="text-xs text-emerald-400/80 leading-relaxed whitespace-pre-wrap">{opp.automation_analysis.projected_savings}</p>
                    </div>
                  </div>
                ) : (
                  <p className="text-xs text-slate-400 leading-relaxed">
                    {opp.narrative}
                  </p>
                )}
              </div>

              {/* Bottom: ACS + Progress bar */}
              <div className="pt-4 border-t border-white/[0.04]">
                <div className="flex items-center justify-between mb-2">
                  <span className="text-xs text-slate-500 font-medium flex items-center gap-1.5">
                    <TrendingUp size={12} /> ACS Score
                  </span>
                  <span className="text-sm font-extrabold text-white">{opp.acs}</span>
                </div>
                <div className="h-2 rounded-full bg-slate-700/50 overflow-hidden">
                  <div
                    className={`h-full rounded-full bg-gradient-to-r ${gradientClass} transition-all duration-1000`}
                    style={{ width: `${opp.effort_reduction_pct}%` }}
                  />
                </div>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
