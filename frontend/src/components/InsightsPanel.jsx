import { Monitor, Users, AlertCircle } from 'lucide-react';

export default function InsightsPanel({ systems, roles, painPoints }) {
  return (
    <div
      className="grid md:grid-cols-3 gap-4"
      style={{ animation: 'fade-in-up 0.5s ease-out 0.5s both' }}
    >
      {/* Systems */}
      <div className="rounded-2xl border border-white/[0.06] bg-white/[0.02] p-6">
        <div className="flex items-center gap-2.5 mb-4">
          <div className="w-8 h-8 rounded-lg bg-indigo-500/15 flex items-center justify-center">
            <Monitor size={15} className="text-indigo-400" />
          </div>
          <h4 className="text-sm font-bold text-white">Systems</h4>
          <span className="ml-auto text-xs text-slate-500 font-semibold">{systems.length}</span>
        </div>
        <div className="flex flex-wrap gap-2">
          {systems.map((sys, i) => (
            <span
              key={i}
              className="px-3 py-1.5 rounded-lg text-xs font-semibold bg-indigo-500/10 text-indigo-300 border border-indigo-500/15 hover:bg-indigo-500/20 transition-colors cursor-default"
            >
              {sys}
            </span>
          ))}
        </div>
      </div>

      {/* Roles */}
      <div className="rounded-2xl border border-white/[0.06] bg-white/[0.02] p-6">
        <div className="flex items-center gap-2.5 mb-4">
          <div className="w-8 h-8 rounded-lg bg-cyan-500/15 flex items-center justify-center">
            <Users size={15} className="text-cyan-400" />
          </div>
          <h4 className="text-sm font-bold text-white">Roles</h4>
          <span className="ml-auto text-xs text-slate-500 font-semibold">{roles.length}</span>
        </div>
        <div className="flex flex-wrap gap-2">
          {roles.map((role, i) => (
            <span
              key={i}
              className="px-3 py-1.5 rounded-lg text-xs font-semibold bg-cyan-500/10 text-cyan-300 border border-cyan-500/15 hover:bg-cyan-500/20 transition-colors cursor-default"
            >
              {role}
            </span>
          ))}
        </div>
      </div>

      {/* Pain Points */}
      <div className="rounded-2xl border border-white/[0.06] bg-white/[0.02] p-6">
        <div className="flex items-center gap-2.5 mb-4">
          <div className="w-8 h-8 rounded-lg bg-rose-500/15 flex items-center justify-center">
            <AlertCircle size={15} className="text-rose-400" />
          </div>
          <h4 className="text-sm font-bold text-white">Pain Points</h4>
          <span className="ml-auto text-xs text-slate-500 font-semibold">{painPoints.length}</span>
        </div>
        <ul className="space-y-2.5">
          {painPoints.map((point, i) => (
            <li key={i} className="flex items-start gap-2.5 text-xs text-slate-400 leading-relaxed">
              <span className="mt-1.5 w-1.5 h-1.5 rounded-full bg-rose-500 shrink-0" />
              {point}
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}
