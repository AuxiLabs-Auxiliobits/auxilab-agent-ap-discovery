import { ShieldAlert, AlertTriangle, CheckCircle2, XCircle } from 'lucide-react';

export default function NonAutomatedCards({ scoredSteps }) {
  // Filter for steps that are not priority targets, or specifically marked as not fully automatable
  const nonAutomatedSteps = scoredSteps.filter(step => 
    !step.is_priority && 
    step.automation_analysis && 
    (step.automation_analysis.automation_potential.includes('Not Automatable') || 
     step.automation_analysis.automation_potential.includes('Partially'))
  );

  if (!nonAutomatedSteps || nonAutomatedSteps.length === 0) return null;

  return (
    <div style={{ animation: 'fade-in-up 0.5s ease-out 0.5s both' }}>
      <div className="flex items-center gap-3 mb-5">
        <div className="w-8 h-8 rounded-lg bg-rose-500/15 flex items-center justify-center">
          <ShieldAlert size={16} className="text-rose-400" />
        </div>
        <h3 className="text-base font-bold text-white">Manual & Complex Processes</h3>
        <span className="px-2.5 py-1 rounded-full bg-slate-500/10 text-slate-400 text-[10px] font-bold uppercase tracking-wider border border-slate-500/20">
          {nonAutomatedSteps.length} processes
        </span>
      </div>

      <div className="grid md:grid-cols-2 xl:grid-cols-3 gap-4">
        {nonAutomatedSteps.map((step, i) => (
          <div
            key={i}
            className="group relative rounded-2xl border border-rose-500/10 bg-rose-950/10 p-6 flex flex-col"
            style={{ animation: `fade-in-up 0.5s ease-out ${0.5 + i * 0.08}s both` }}
          >
            {/* Top Area */}
            <div className="flex items-start justify-between mb-4">
              <span className="inline-flex px-3 py-1 rounded-full text-[11px] font-bold border bg-rose-500/10 text-rose-300 border-rose-500/25">
                {step.automation_analysis?.automation_potential || 'Not Automatable'}
              </span>
              <div className="text-right">
                <div className="text-2xl font-extrabold text-white">{step.estimated_time_minutes}m</div>
                <div className="text-[10px] text-slate-500 uppercase tracking-wider font-semibold">Manual Time</div>
              </div>
            </div>

            <h4 className="text-sm font-bold text-white mb-2 flex items-center gap-2">
              {step.step_number}. {step.name}
            </h4>
            
            <div className="text-xs text-slate-400 leading-relaxed mb-4">
              {step.description}
            </div>

            {/* Why it can't be automated */}
            {step.automation_analysis?.non_automation_reason && (
              <div className="flex-1 space-y-4 pt-4 border-t border-rose-500/10">
                <div className="flex items-start gap-2">
                  <AlertTriangle size={14} className="text-amber-500 mt-0.5 shrink-0" />
                  <p className="text-[11px] text-amber-200/80 leading-relaxed">
                    {step.automation_analysis.non_automation_reason.explanation}
                  </p>
                </div>
                
                <div className="grid grid-cols-2 gap-3">
                  <div className="bg-emerald-950/30 p-3 rounded-xl border border-emerald-500/10">
                    <h5 className="text-[10px] font-bold text-emerald-400 uppercase tracking-wider flex items-center gap-1.5 mb-2">
                      <CheckCircle2 size={12} /> Human Strengths
                    </h5>
                    <p className="text-[10px] text-emerald-200/70 leading-relaxed">
                      {step.automation_analysis.non_automation_reason.plus_points}
                    </p>
                  </div>
                  <div className="bg-rose-950/30 p-3 rounded-xl border border-rose-500/10">
                    <h5 className="text-[10px] font-bold text-rose-400 uppercase tracking-wider flex items-center gap-1.5 mb-2">
                      <XCircle size={12} /> Bot Limitations
                    </h5>
                    <p className="text-[10px] text-rose-200/70 leading-relaxed">
                      {step.automation_analysis.non_automation_reason.minus_points}
                    </p>
                  </div>
                </div>
              </div>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}
