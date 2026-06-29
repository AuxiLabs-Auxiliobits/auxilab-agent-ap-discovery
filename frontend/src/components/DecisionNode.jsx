import { Handle, Position } from '@xyflow/react';
import { Split } from 'lucide-react';

export default function DecisionNode({ data }) {
  return (
    <div className="relative group w-64">
      {/* Top Handles */}
      <Handle type="target" position={Position.Top} id="top-target" className="w-2.5 h-2.5 bg-amber-500 border-2 border-slate-900 rounded-full" />
      <Handle type="source" position={Position.Top} id="top-source" className="w-2 h-2 opacity-0" />

      {/* Bottom Handles */}
      <Handle type="target" position={Position.Bottom} id="bottom-target" className="w-2.5 h-2.5 bg-amber-500 border-2 border-slate-900 rounded-full" />
      <Handle type="source" position={Position.Bottom} id="bottom-source" className="w-2 h-2 opacity-0" />

      {/* Left Handles */}
      <Handle type="target" position={Position.Left} id="left-target" className="w-2.5 h-2.5 bg-amber-500 border-2 border-slate-900 rounded-full" />
      <Handle type="source" position={Position.Left} id="left-source" className="w-2 h-2 opacity-0" />

      {/* Right Handles */}
      <Handle type="target" position={Position.Right} id="right-target" className="w-2.5 h-2.5 bg-amber-500 border-2 border-slate-900 rounded-full" />
      <Handle type="source" position={Position.Right} id="right-source" className="w-2 h-2 opacity-0" />

      {/* Node Container */}
      <div className="p-3.5 rounded-xl border border-amber-500/50 bg-amber-500/10 backdrop-blur-xl transition-all duration-300 shadow-xl shadow-amber-500/10 flex flex-col items-center justify-center text-center relative overflow-hidden">
        
        {/* Glow effect */}
        <div className="absolute inset-0 bg-amber-500/5 blur-xl pointer-events-none" />

        <div className="relative z-10 flex flex-col items-center gap-2">
          <div className="w-8 h-8 rounded-full bg-amber-500/20 border border-amber-500/40 flex items-center justify-center text-amber-400">
            <Split size={16} />
          </div>
          <h3 className="font-bold text-amber-50 text-[13px] leading-tight px-2">
            {data.label}
          </h3>
        </div>
      </div>
    </div>
  );
}
