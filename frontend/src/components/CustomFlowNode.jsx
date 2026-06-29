import { Handle, Position } from '@xyflow/react';
import { Users, Layers, Zap } from 'lucide-react';

export default function CustomFlowNode({ data }) {
  const isHighPriority = data.acs >= 8.0;

  return (
    <div className="relative group w-72">
      {/* Top Handles */}
      <Handle type="target" position={Position.Top} id="top-target" className="w-2.5 h-2.5 bg-indigo-500 border-2 border-slate-900 rounded-full" />
      <Handle type="source" position={Position.Top} id="top-source" className="w-2 h-2 opacity-0" />
      
      {/* Bottom Handles */}
      <Handle type="target" position={Position.Bottom} id="bottom-target" className="w-2.5 h-2.5 bg-indigo-500 border-2 border-slate-900 rounded-full" />
      <Handle type="source" position={Position.Bottom} id="bottom-source" className="w-2 h-2 opacity-0" />
      
      {/* Left Handles */}
      <Handle type="target" position={Position.Left} id="left-target" className="w-2.5 h-2.5 bg-indigo-500 border-2 border-slate-900 rounded-full" />
      <Handle type="source" position={Position.Left} id="left-source" className="w-2 h-2 opacity-0" />
      
      {/* Right Handles */}
      <Handle type="target" position={Position.Right} id="right-target" className="w-2.5 h-2.5 bg-indigo-500 border-2 border-slate-900 rounded-full" />
      <Handle type="source" position={Position.Right} id="right-source" className="w-2 h-2 opacity-0" />

      {/* Node Container */}
      <div className={`p-3.5 rounded-xl border backdrop-blur-xl transition-all duration-300 shadow-xl cursor-pointer hover:border-indigo-400/50 hover:shadow-indigo-500/20 ${
        isHighPriority 
          ? 'bg-indigo-950/40 border-indigo-500/30 shadow-indigo-500/10' 
          : 'bg-slate-900/40 border-slate-700/50'
      }`}>
        
        {/* Glow effect for high priority */}
        {isHighPriority && (
          <div className="absolute inset-0 rounded-xl bg-indigo-500/5 blur-xl pointer-events-none" />
        )}

        <div className="relative z-10">
          {/* Header */}
          <div className="flex items-start justify-between mb-2">
            <div className="flex items-center gap-2 min-w-0">
              <div className={`w-6 h-6 rounded-md flex items-center justify-center text-xs font-bold shrink-0 ${
                isHighPriority ? 'bg-indigo-500 text-white' : 'bg-slate-700 text-slate-300'
              }`}>
                {data.index + 1}
              </div>
              <h3 className="font-bold text-white text-[13px] leading-tight truncate">
                {data.step_name}
              </h3>
            </div>
            {/* ACS Score Badge */}
            {data.acs > 0 && (
              <div className={`flex items-center gap-1 px-2 py-0.5 rounded-md text-[10px] font-bold shrink-0 ml-2 ${
                isHighPriority ? 'bg-amber-500/20 text-amber-400' : 'bg-white/5 text-slate-400'
              }`}>
                <Zap size={10} className={isHighPriority ? 'fill-amber-400' : ''} />
                {data.acs.toFixed(1)}
              </div>
            )}
          </div>

          {/* Details */}
          <div className="space-y-1.5 mt-2 pt-2 border-t border-white/5">
            {/* Role */}
            {data.role && (
              <div className="flex items-center gap-2 text-[11px] text-slate-400">
                <Users size={11} className="text-slate-500 shrink-0" />
                <span className="truncate">{data.role}</span>
              </div>
            )}
            
            {/* Systems */}
            {data.systems && data.systems.length > 0 && (
              <div className="flex items-center gap-2 text-[11px] text-slate-400">
                <Layers size={11} className="text-slate-500 shrink-0" />
                <div className="flex flex-wrap gap-1">
                  {data.systems.slice(0, 3).map((sys, idx) => (
                    <span key={idx} className="px-1.5 py-0.5 rounded bg-white/5 border border-white/5 text-[10px] truncate max-w-[80px]">
                      {sys}
                    </span>
                  ))}
                  {data.systems.length > 3 && (
                    <span className="px-1.5 py-0.5 rounded bg-white/5 border border-white/5 text-[10px]">
                      +{data.systems.length - 3}
                    </span>
                  )}
                </div>
              </div>
            )}
          </div>
          
          {/* Manual vs Assisted indicator */}
          <div className="mt-2 flex items-center justify-between text-[10px] uppercase font-bold tracking-wider">
            <span className={data.is_manual ? 'text-red-400' : 'text-emerald-400'}>
              {data.is_manual ? '● Manual' : '● Assisted'}
            </span>
            <span className="text-slate-500 lowercase font-medium tracking-normal">
              {data.time_min} min
            </span>
          </div>
        </div>
      </div>
    </div>
  );
}
