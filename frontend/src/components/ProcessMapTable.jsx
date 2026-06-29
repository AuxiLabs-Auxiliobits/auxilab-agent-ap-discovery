import { TableProperties } from 'lucide-react';

function ACSBadge({ acs }) {
  const color = acs >= 8 ? 'bg-emerald-500/15 text-emerald-400 border-emerald-500/20'
    : acs >= 6 ? 'bg-amber-500/15 text-amber-400 border-amber-500/20'
    : 'bg-rose-500/15 text-rose-400 border-rose-500/20';
  
  const barColor = acs >= 8 ? 'bg-emerald-500' : acs >= 6 ? 'bg-amber-500' : 'bg-rose-500';

  return (
    <div className="flex items-center gap-3 min-w-[100px]">
      <div className="flex-1 h-2 rounded-full bg-slate-700/50 overflow-hidden">
        <div
          className={`h-full rounded-full ${barColor} transition-all duration-1000`}
          style={{ width: `${(acs / 10) * 100}%` }}
        />
      </div>
      <span className={`inline-flex items-center px-2 py-0.5 rounded-md text-xs font-bold border ${color}`}>
        {acs}
      </span>
    </div>
  );
}

export default function ProcessMapTable({ scoredSteps }) {
  return (
    <div
      className="rounded-2xl border border-white/[0.06] bg-white/[0.02] overflow-hidden"
      style={{ animation: 'fade-in-up 0.5s ease-out 0.3s both' }}
    >
      {/* Header */}
      <div className="px-6 py-5 border-b border-white/[0.06] flex items-center gap-3">
        <div className="w-8 h-8 rounded-lg bg-indigo-500/15 flex items-center justify-center">
          <TableProperties size={16} className="text-indigo-400" />
        </div>
        <div>
          <h3 className="text-base font-bold text-white">Process Map & ACS Scores</h3>
          <p className="text-xs text-slate-500 mt-0.5">
            ACS = (Rule-based + Data Structure + Volume) ÷ 3
          </p>
        </div>
      </div>

      {/* Table */}
      <div className="overflow-x-auto">
        <table className="w-full min-w-[1000px] text-sm">
          <thead>
            <tr className="border-b border-white/[0.06]">
              <th className="px-4 py-3.5 text-left text-[11px] font-bold uppercase tracking-widest text-slate-500 bg-slate-800/30">#</th>
              <th className="px-4 py-3.5 text-left text-[11px] font-bold uppercase tracking-widest text-slate-500 bg-slate-800/30">Step</th>
              <th className="px-4 py-3.5 text-left text-[11px] font-bold uppercase tracking-widest text-slate-500 bg-slate-800/30">Role</th>
              <th className="px-4 py-3.5 text-left text-[11px] font-bold uppercase tracking-widest text-slate-500 bg-slate-800/30">Systems</th>
              <th className="px-4 py-3.5 text-left text-[11px] font-bold uppercase tracking-widest text-slate-500 bg-slate-800/30">Time</th>
              <th className="px-4 py-3.5 text-left text-[11px] font-bold uppercase tracking-widest text-slate-500 bg-slate-800/30">Type</th>
              <th className="px-4 py-3.5 text-center text-[11px] font-bold uppercase tracking-widest text-slate-500 bg-slate-800/30" title="Rule-based score: 0 = entirely judgment, 10 = entirely rule-based">Rule</th>
              <th className="px-4 py-3.5 text-center text-[11px] font-bold uppercase tracking-widest text-slate-500 bg-slate-800/30" title="Data structure score: 0 = unstructured, 10 = fully structured digital data">Data</th>
              <th className="px-4 py-3.5 text-center text-[11px] font-bold uppercase tracking-widest text-slate-500 bg-slate-800/30" title="Volume score: 0 = rare/one-off, 10 = very high volume/frequency">Vol</th>
              <th className="px-4 py-3.5 text-left text-[11px] font-bold uppercase tracking-widest text-slate-500 bg-slate-800/30" title="Automation Candidate Score: Average of Rule, Data, and Vol scores">ACS</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-white/[0.03]">
            {scoredSteps.map((step, i) => (
              <tr key={i} className="hover:bg-white/[0.02] transition-colors group">
                <td className="px-4 py-3.5 text-xs text-slate-500 font-mono align-top">{step.step_number}</td>
                <td className="px-4 py-3.5 align-top">
                  <div className="font-semibold text-white text-sm group-hover:text-indigo-300 transition-colors mb-1">{step.name}</div>
                  
                  {/* Detailed Description and Automation Status */}
                  <div className="text-xs text-slate-400 leading-relaxed min-w-[280px] max-w-[350px] whitespace-normal">
                    {step.automation_analysis && step.automation_analysis.automation_potential && (
                      <span className={`inline-block mr-2 font-bold ${
                        step.automation_analysis.automation_potential.includes('Fully') ? 'text-emerald-400' :
                        step.automation_analysis.automation_potential.includes('Partially') ? 'text-amber-400' : 'text-rose-400'
                      }`}>
                        [{step.automation_analysis.automation_potential}]
                      </span>
                    )}
                    {step.description}
                  </div>
                </td>
                <td className="px-4 py-3.5 text-xs text-slate-400 align-top">{step.responsible_role}</td>
                <td className="px-4 py-3.5 align-top">
                  <div className="flex flex-wrap gap-1.5 mt-0.5">
                    {(step.systems_used || []).map((sys, j) => (
                      <span key={j} className="px-2 py-0.5 rounded-md bg-slate-700/50 text-[10px] text-slate-400 font-medium">
                        {sys}
                      </span>
                    ))}
                  </div>
                </td>
                <td className="px-4 py-3.5 text-xs text-slate-400 font-mono align-top pt-4">{step.estimated_time_minutes}m</td>
                <td className="px-4 py-3.5 align-top pt-3.5">
                  {step.is_manual ? (
                    <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full bg-rose-500/10 text-rose-400 text-[10px] font-bold border border-rose-500/20">
                      Manual
                    </span>
                  ) : (
                    <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full bg-emerald-500/10 text-emerald-400 text-[10px] font-bold border border-emerald-500/20">
                      Assisted
                    </span>
                  )}
                </td>
                <td className="px-4 py-3.5 text-center text-xs font-mono text-slate-400 align-top pt-4">{step.rule_based_score}</td>
                <td className="px-4 py-3.5 text-center text-xs font-mono text-slate-400 align-top pt-4">{step.data_structure_score}</td>
                <td className="px-4 py-3.5 text-center text-xs font-mono text-slate-400 align-top pt-4">{step.volume_score}</td>
                <td className="px-4 py-3.5 align-top pt-4">
                  <div className="flex items-center gap-2">
                    <ACSBadge acs={step.acs} />
                    {step.is_priority && (
                      <span className="w-5 h-5 rounded-md bg-indigo-500/20 text-indigo-400 flex items-center justify-center text-[10px] font-bold">★</span>
                    )}
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
