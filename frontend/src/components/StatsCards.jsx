import { TrendingUp, Target, Layers, AlertTriangle } from 'lucide-react';

export default function StatsCards({ data }) {
  const avgACS = data.scored_steps.length > 0
    ? (data.scored_steps.reduce((a, s) => a + s.acs, 0) / data.scored_steps.length).toFixed(1)
    : '0';

  const stats = [
    {
      label: 'Process Steps',
      value: data.scored_steps.length,
      icon: <Layers size={22} />,
      gradient: 'from-indigo-500 to-purple-600',
      glow: 'shadow-indigo-500/20',
      ring: 'ring-indigo-500/20',
      iconBg: 'bg-indigo-500/15 text-indigo-400',
    },
    {
      label: 'Avg ACS',
      value: avgACS,
      suffix: '/10',
      icon: <TrendingUp size={22} />,
      gradient: 'from-cyan-500 to-teal-500',
      glow: 'shadow-cyan-500/20',
      ring: 'ring-cyan-500/20',
      iconBg: 'bg-cyan-500/15 text-cyan-400',
    },
    {
      label: 'Priority Targets',
      value: data.priority_targets.length,
      icon: <Target size={22} />,
      gradient: 'from-rose-500 to-pink-600',
      glow: 'shadow-rose-500/20',
      ring: 'ring-rose-500/20',
      iconBg: 'bg-rose-500/15 text-rose-400',
    },
    {
      label: 'Pain Points',
      value: data.pain_points.length,
      icon: <AlertTriangle size={22} />,
      gradient: 'from-amber-500 to-orange-500',
      glow: 'shadow-amber-500/20',
      ring: 'ring-amber-500/20',
      iconBg: 'bg-amber-500/15 text-amber-400',
    },
  ];

  return (
    <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
      {stats.map((stat, i) => (
        <div
          key={stat.label}
          className={`group relative rounded-2xl border border-white/[0.06] bg-white/[0.02] p-6 hover:bg-white/[0.04] hover:border-white/[0.1] transition-all duration-300 hover:-translate-y-1 hover:shadow-xl ${stat.glow}`}
          style={{ animation: `fade-in-up 0.5s ease-out ${i * 0.1}s both` }}
        >
          <div className={`w-11 h-11 rounded-xl ${stat.iconBg} flex items-center justify-center mb-4`}>
            {stat.icon}
          </div>
          <div className="text-3xl font-extrabold text-white tracking-tight">
            {stat.value}
            {stat.suffix && <span className="text-base font-normal text-slate-500 ml-0.5">{stat.suffix}</span>}
          </div>
          <p className="text-xs text-slate-500 mt-1.5 font-semibold uppercase tracking-widest">
            {stat.label}
          </p>
          {/* Bottom accent line */}
          <div className={`absolute bottom-0 left-6 right-6 h-0.5 rounded-full bg-gradient-to-r ${stat.gradient} opacity-0 group-hover:opacity-100 transition-opacity duration-300`} />
        </div>
      ))}
    </div>
  );
}
