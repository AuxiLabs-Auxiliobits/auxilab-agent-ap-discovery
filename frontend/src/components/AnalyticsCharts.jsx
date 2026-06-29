import React, { useState, useEffect, useMemo } from "react";
import {
  Clock,
  DollarSign,
  Users,
  TrendingDown,
  BarChart3,
  Activity,
  ArrowDown,
  Sparkles,
  Percent,
  Pencil,
  Check,
  TrendingUp,
  Target,
  Rocket,
  CalendarClock,
  Wallet,
  AlertTriangle,
} from "lucide-react";
import {
  AreaChart,
  Area,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip as RechartsTooltip,
  ResponsiveContainer,
  ReferenceLine,
  Legend,
} from "recharts";

/* ── Animated Number Counter ─────────────────────────────── */
function AnimatedNumber({ value, suffix = "", prefix = "", duration = 1200 }) {
  const [display, setDisplay] = useState(0);

  useEffect(() => {
    let start = 0;
    const end = parseFloat(value) || 0;
    const startTime = performance.now();

    const animate = (currentTime) => {
      const elapsed = currentTime - startTime;
      const progress = Math.min(elapsed / duration, 1);
      // Ease out cubic
      const eased = 1 - Math.pow(1 - progress, 3);
      setDisplay(Math.round(eased * end));
      if (progress < 1) requestAnimationFrame(animate);
    };

    requestAnimationFrame(animate);
  }, [value, duration]);

  return (
    <>
      {prefix}
      {display}
      {suffix}
    </>
  );
}

/* ── Donut Chart (SVG) ───────────────────────────────────── */
function DonutChart({
  percentage,
  size = 120,
  strokeWidth = 10,
  color = "#818cf8",
  bgColor = "rgba(255,255,255,0.04)",
  label,
  subLabel,
}) {
  const radius = (size - strokeWidth) / 2;
  const circumference = 2 * Math.PI * radius;
  const [offset, setOffset] = useState(circumference);

  useEffect(() => {
    const timer = setTimeout(() => {
      setOffset(circumference - (percentage / 100) * circumference);
    }, 300);
    return () => clearTimeout(timer);
  }, [percentage, circumference]);

  return (
    <div className="flex flex-col items-center gap-2">
      <div className="relative" style={{ width: size, height: size }}>
        <svg width={size} height={size} className="-rotate-90">
          {/* Background circle */}
          <circle
            cx={size / 2}
            cy={size / 2}
            r={radius}
            fill="none"
            stroke={bgColor}
            strokeWidth={strokeWidth}
          />
          {/* Progress circle */}
          <circle
            cx={size / 2}
            cy={size / 2}
            r={radius}
            fill="none"
            stroke={color}
            strokeWidth={strokeWidth}
            strokeDasharray={circumference}
            strokeDashoffset={offset}
            strokeLinecap="round"
            style={{
              transition: "stroke-dashoffset 1.2s cubic-bezier(0.4, 0, 0.2, 1)",
            }}
          />
        </svg>
        {/* Center text */}
        <div className="absolute inset-0 flex flex-col items-center justify-center">
          <span className="text-2xl font-extrabold text-white">
            <AnimatedNumber value={percentage} suffix="%" />
          </span>
        </div>
      </div>
      {label && (
        <span className="text-xs font-bold text-white text-center">
          {label}
        </span>
      )}
      {subLabel && (
        <span className="text-[10px] text-slate-500 text-center">
          {subLabel}
        </span>
      )}
    </div>
  );
}

/* ── Horizontal Bar ──────────────────────────────────────── */
function HBar({
  label,
  current,
  automated,
  roleBefore,
  roleAfter,
  unit = "min",
  currentColor = "#f87171",
  autoColor = "#34d399",
  delay = 0,
}) {
  const max = Math.max(current, automated, 1);
  const [animW1, setAnimW1] = useState(0);
  const [animW2, setAnimW2] = useState(0);

  useEffect(() => {
    const t = setTimeout(() => {
      setAnimW1((current / max) * 100);
      setAnimW2((automated / max) * 100);
    }, 200 + delay);
    return () => clearTimeout(t);
  }, [current, automated, max, delay]);

  const savings =
    current > 0 ? Math.round(((current - automated) / current) * 100) : 0;

  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between">
        <span className="text-xs font-semibold text-slate-300 truncate max-w-[60%]">
          {label}
        </span>
        <span
          className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${
            savings >= 60
              ? "bg-emerald-500/15 text-emerald-400 border border-emerald-500/20"
              : savings >= 30
                ? "bg-amber-500/15 text-amber-400 border border-amber-500/20"
                : "bg-slate-700/50 text-slate-400 border border-white/5"
          }`}
        >
          {savings > 0 ? `↓${savings}%` : "—"}
        </span>
      </div>
      {/* Current (manual) */}
      <div className="flex items-center gap-2">
        <div className="w-24 shrink-0">
          <div className="text-[9px] text-rose-400 font-bold uppercase tracking-wider">
            Before
          </div>
          {roleBefore && (
            <div
              className="text-[9px] text-slate-500 truncate"
              title={roleBefore}
            >
              {roleBefore}
            </div>
          )}
        </div>
        <div className="flex-1 h-4 rounded bg-slate-800/60 overflow-hidden">
          <div
            className="h-full rounded"
            style={{
              width: `${animW1}%`,
              background: `linear-gradient(90deg, ${currentColor}aa, ${currentColor})`,
              transition: "width 1s cubic-bezier(0.4, 0, 0.2, 1)",
            }}
          />
        </div>
        <span className="text-[10px] text-slate-400 font-mono w-12 text-right">
          {current}
          {unit}
        </span>
      </div>
      {/* Automated */}
      <div className="flex items-center gap-2">
        <div className="w-24 shrink-0">
          <div className="text-[9px] text-emerald-400 font-bold uppercase tracking-wider">
            After
          </div>
          {roleAfter && (
            <div
              className="text-[9px] text-slate-500 truncate"
              title={roleAfter}
            >
              {roleAfter}
            </div>
          )}
        </div>
        <div className="flex-1 h-4 rounded bg-slate-800/60 overflow-hidden">
          <div
            className="h-full rounded"
            style={{
              width: `${animW2}%`,
              background: `linear-gradient(90deg, ${autoColor}aa, ${autoColor})`,
              transition: "width 1.2s cubic-bezier(0.4, 0, 0.2, 1)",
            }}
          />
        </div>
        <span className="text-[10px] text-emerald-300 font-mono w-12 text-right">
          {automated}
          {unit}
        </span>
      </div>
    </div>
  );
}

/* ── Radial Gauge ────────────────────────────────────────── */
function RadialGauge({ value, max = 10, size = 64, label, color }) {
  const pct = (value / max) * 100;
  const radius = (size - 8) / 2;
  const circumference = Math.PI * radius; // half circle
  const [offset, setOffset] = useState(circumference);

  useEffect(() => {
    const t = setTimeout(() => {
      setOffset(circumference - (pct / 100) * circumference);
    }, 400);
    return () => clearTimeout(t);
  }, [pct, circumference]);

  return (
    <div className="flex flex-col items-center gap-1">
      <div className="relative" style={{ width: size, height: size / 2 + 8 }}>
        <svg width={size} height={size / 2 + 8} className="overflow-visible">
          {/* BG arc */}
          <path
            d={`M ${4} ${size / 2} A ${radius} ${radius} 0 0 1 ${size - 4} ${size / 2}`}
            fill="none"
            stroke="rgba(255,255,255,0.04)"
            strokeWidth={6}
            strokeLinecap="round"
          />
          {/* Value arc */}
          <path
            d={`M ${4} ${size / 2} A ${radius} ${radius} 0 0 1 ${size - 4} ${size / 2}`}
            fill="none"
            stroke={color}
            strokeWidth={6}
            strokeLinecap="round"
            strokeDasharray={circumference}
            strokeDashoffset={offset}
            style={{
              transition: "stroke-dashoffset 1s cubic-bezier(0.4, 0, 0.2, 1)",
            }}
          />
        </svg>
        <div className="absolute inset-0 flex items-end justify-center pb-0">
          <span className="text-sm font-extrabold text-white">{value}</span>
        </div>
      </div>
      {label && (
        <span className="text-[9px] text-slate-500 font-bold uppercase tracking-wider text-center">
          {label}
        </span>
      )}
    </div>
  );
}

/* ── ACS Distribution Bar ────────────────────────────────── */
function ACSDistributionBar({ scoredSteps }) {
  const high = scoredSteps.filter((s) => s.acs >= 8).length;
  const med = scoredSteps.filter((s) => s.acs >= 5 && s.acs < 8).length;
  const low = scoredSteps.filter((s) => s.acs < 5).length;
  const total = scoredSteps.length || 1;

  return (
    <div className="space-y-3">
      <div className="flex items-center gap-2 h-7 rounded-lg overflow-hidden bg-slate-800/40">
        {high > 0 && (
          <div
            className="h-full bg-gradient-to-r from-emerald-500 to-emerald-400 rounded-l-lg flex items-center justify-center transition-all duration-1000"
            style={{
              width: `${(high / total) * 100}%`,
              minWidth: high > 0 ? "28px" : 0,
            }}
          >
            <span className="text-[10px] font-bold text-white">{high}</span>
          </div>
        )}
        {med > 0 && (
          <div
            className="h-full bg-gradient-to-r from-amber-500 to-amber-400 flex items-center justify-center transition-all duration-1000"
            style={{
              width: `${(med / total) * 100}%`,
              minWidth: med > 0 ? "28px" : 0,
            }}
          >
            <span className="text-[10px] font-bold text-white">{med}</span>
          </div>
        )}
        {low > 0 && (
          <div
            className="h-full bg-gradient-to-r from-rose-500 to-rose-400 rounded-r-lg flex items-center justify-center transition-all duration-1000"
            style={{
              width: `${(low / total) * 100}%`,
              minWidth: low > 0 ? "28px" : 0,
            }}
          >
            <span className="text-[10px] font-bold text-white">{low}</span>
          </div>
        )}
      </div>
      <div className="flex items-center justify-center gap-5">
        <span className="flex items-center gap-1.5 text-[10px] text-slate-400">
          <span className="w-2.5 h-2.5 rounded-sm bg-emerald-500" /> High (≥8)
        </span>
        <span className="flex items-center gap-1.5 text-[10px] text-slate-400">
          <span className="w-2.5 h-2.5 rounded-sm bg-amber-500" /> Medium (5-7)
        </span>
        <span className="flex items-center gap-1.5 text-[10px] text-slate-400">
          <span className="w-2.5 h-2.5 rounded-sm bg-rose-500" /> Low (&lt;5)
        </span>
      </div>
    </div>
  );
}

/* ── Detailed ROI Area Chart (Recharts) ─────────────────────── */
function DetailedROIChart({
  monthlySavings,
  investment,
  breakEvenMonth,
  horizonMonths,
  costMetrics,
}) {
  const data = useMemo(() => {
    const monthlyManualCost = (costMetrics.rawWeeklyCostBefore * 52) / 12;
    const monthlyAutomatedCost = (costMetrics.rawWeeklyCostAfter * 52) / 12;
    const monthlyMaintenance = (costMetrics.annualMaintenance || 0) / 12;

    const chartData = [];
    for (let m = 0; m <= horizonMonths; m++) {
      const manualCost = Math.round(m * monthlyManualCost);
      const automatedCost = Math.round(investment + m * (monthlyAutomatedCost + monthlyMaintenance));
      const netValue = Math.round(manualCost - automatedCost);

      chartData.push({
        month: m,
        label: `Month ${m}`,
        manualCost,
        automatedCost,
        netValue,
      });
    }
    return chartData;
  }, [investment, horizonMonths, costMetrics]);

  const CustomTooltip = ({ active, payload }) => {
    if (active && payload && payload.length > 0) {
      const dataPoint = payload[0].payload;
      return (
        <div className="bg-slate-900 border border-white/10 p-4 rounded-xl shadow-2xl">
          <p className="text-white font-bold mb-3 text-sm border-b border-white/10 pb-2">
            {dataPoint.label}
          </p>
          <div className="space-y-2">
            <div className="flex justify-between gap-6 text-xs">
              <span className="text-slate-400">Cumulative Cost (Manual):</span>
              <span className="text-rose-400 font-bold">
                {costMetrics.currencySymbol || "$"}
                {dataPoint.manualCost.toLocaleString()}
              </span>
            </div>
            <div className="flex justify-between gap-6 text-xs">
              <span className="text-slate-400">
                Cumulative Cost (Automated):
              </span>
              <span className="text-violet-400 font-bold">
                {costMetrics.currencySymbol || "$"}
                {dataPoint.automatedCost.toLocaleString()}
              </span>
            </div>
            <div className="h-px bg-white/5 my-2"></div>
            <div className="flex justify-between gap-6 text-xs items-center">
              <span className="text-slate-300 font-semibold">
                Net ROI Value:
              </span>
              <span
                className={`px-2 py-1 rounded font-extrabold ${dataPoint.netValue >= 0 ? "bg-emerald-500/10 text-emerald-400" : "bg-rose-500/10 text-rose-400"}`}
              >
                {dataPoint.netValue >= 0 ? "+" : ""}
                {costMetrics.currencySymbol || "$"}
                {dataPoint.netValue.toLocaleString()}
              </span>
            </div>
          </div>
        </div>
      );
    }
    return null;
  };

  const formatYAxis = (tick) => {
    const cs = (costMetrics && costMetrics.currencySymbol) || "$";
    if (tick === 0) return `${cs}0`;
    if (Math.abs(tick) >= 1000000)
      return `${cs}${(tick / 1000000).toFixed(1)}M`;
    if (Math.abs(tick) >= 1000) return `${cs}${(tick / 1000).toFixed(0)}k`;
    return `${cs}${tick}`;
  };

  return (
    <div className="h-[320px] w-full mt-6">
      <ResponsiveContainer width="100%" height="100%">
        <AreaChart
          data={data}
          margin={{ top: 20, right: 20, left: 0, bottom: 0 }}
        >
          <defs>
            <linearGradient id="colorManual" x1="0" y1="0" x2="0" y2="1">
              <stop offset="5%" stopColor="#fb7185" stopOpacity={0.4} />
              <stop offset="95%" stopColor="#fb7185" stopOpacity={0.05} />
            </linearGradient>
            <linearGradient id="colorAuto" x1="0" y1="0" x2="0" y2="1">
              <stop offset="5%" stopColor="#a855f7" stopOpacity={0.4} />
              <stop offset="95%" stopColor="#a855f7" stopOpacity={0.05} />
            </linearGradient>
          </defs>
          <CartesianGrid
            strokeDasharray="3 3"
            stroke="rgba(255,255,255,0.05)"
            vertical={false}
          />
          <XAxis
            dataKey="month"
            stroke="rgba(255,255,255,0.2)"
            tick={{ fill: "#64748b", fontSize: 11, fontWeight: 600 }}
            tickLine={false}
            tickFormatter={(val) => `${val}mo`}
            minTickGap={20}
          />
          <YAxis
            stroke="rgba(255,255,255,0.2)"
            tick={{ fill: "#64748b", fontSize: 11, fontWeight: 600 }}
            tickLine={false}
            tickFormatter={formatYAxis}
            width={55}
          />
          <RechartsTooltip content={<CustomTooltip />} />
          <Legend
            wrapperStyle={{
              fontSize: "11px",
              fontWeight: 600,
              color: "#94a3b8",
              paddingTop: "15px",
            }}
            iconType="circle"
          />

          <Area
            type="monotone"
            dataKey="manualCost"
            name="Manual Cost (No Action)"
            stroke="#fb7185"
            strokeWidth={3}
            fillOpacity={1}
            fill="url(#colorManual)"
          />
          <Area
            type="monotone"
            dataKey="automatedCost"
            name="Automated Cost (Incl. Initial Investment)"
            stroke="#a855f7"
            strokeWidth={3}
            fillOpacity={1}
            fill="url(#colorAuto)"
          />

          {breakEvenMonth &&
            isFinite(breakEvenMonth) &&
            breakEvenMonth <= horizonMonths && (
              <ReferenceLine
                x={Math.round(breakEvenMonth)}
                stroke="#34d399"
                strokeWidth={2}
                strokeDasharray="4 4"
                label={{
                  position: "top",
                  value: `Break Even: ${breakEvenMonth.toFixed(1)}mo`,
                  fill: "#34d399",
                  fontSize: 12,
                  fontWeight: "bold",
                }}
              />
            )}
        </AreaChart>
      </ResponsiveContainer>
    </div>
  );
}

/* ══════════════════════════════════════════════════════════════
   MAIN COMPONENT
   ══════════════════════════════════════════════════════════════ */

export default function AnalyticsCharts({ data, onUpdateHourlyRate }) {
  const {
    scored_steps = [],
    opportunities = [],
    hourly_rate = null,
    project_timeline = null,
    roi_estimate = null,
  } = data;

  // Currency symbol from grounded backend ROI (multi-currency aware)
  const CUR = (roi_estimate && roi_estimate.currency_symbol) || "$";

  // ── Editable hourly rate state ────────────────────────────
  const [hourlyRate, setHourlyRate] = useState(hourly_rate);
  const [editingRateId, setEditingRateId] = useState(null);
  const [rateInput, setRateInput] = useState(
    hourlyRate ? String(hourlyRate) : "35",
  );

  useEffect(() => {
    if (hourly_rate) {
      setHourlyRate(hourly_rate);
    }
  }, [hourly_rate]);

  const handleRateSubmit = () => {
    const parsed = parseFloat(rateInput);
    if (!isNaN(parsed) && parsed > 0) {
      setHourlyRate(parsed);
      if (onUpdateHourlyRate) onUpdateHourlyRate(parsed);
    } else {
      setRateInput(String(hourlyRate));
    }
    setEditingRateId(null);
  };

  // ── Editable automation investment (one-time implementation cost) ──
  // Now uses AI's intelligent estimate as default
  const defaultInvestment =
    roi_estimate?.estimated_implementation_cost ||
    5000 + opportunities.length * 2500;
  const [investment, setInvestment] = useState(defaultInvestment);
  const [editingInvestment, setEditingInvestment] = useState(false);
  const [investmentInput, setInvestmentInput] = useState(
    String(defaultInvestment),
  );

  useEffect(() => {
    setInvestment(defaultInvestment);
    setInvestmentInput(String(defaultInvestment));
  }, [defaultInvestment]);

  const handleInvestmentSubmit = () => {
    const parsed = parseFloat(investmentInput);
    if (!isNaN(parsed) && parsed > 0) {
      setInvestment(parsed);
    } else {
      setInvestmentInput(String(investment));
    }
    setEditingInvestment(false);
  };

  // ── Computed Metrics (time & effort — independent of cost) ──
  const metrics = useMemo(() => {
    const totalTimeMin = scored_steps.reduce(
      (a, s) => a + (s.estimated_time_minutes || 0),
      0,
    );
    const manualSteps = scored_steps.filter((s) => s.is_manual);
    const manualTimeMin = manualSteps.reduce(
      (a, s) => a + (s.estimated_time_minutes || 0),
      0,
    );

    // Build a map of step_number → effort_reduction_pct from opportunities
    const reductionMap = {};
    opportunities.forEach((o) => {
      reductionMap[o.step_number] = o.effort_reduction_pct || 0;
    });

    // Estimated automated time = manual time with reduction applied, assisted stays the same
    let automatedTimeMin = 0;
    scored_steps.forEach((s) => {
      const reduction = reductionMap[s.step_number] || 0;
      const reduced = s.estimated_time_minutes * (1 - reduction / 100);
      automatedTimeMin += reduced;
    });
    automatedTimeMin = Math.round(automatedTimeMin);

    // Prefer the backend's grounded, probability-weighted & calibrated handling
    // time so the dashboard matches the report exactly. The raw step-time sum
    // (every step counted at full time on every transaction) badly overstates
    // effort and is what produced the inflated 85% / 34-min headline figures.
    const groundedBefore = roi_estimate?.effective_minutes_before;
    const groundedAfter = roi_estimate?.effective_minutes_after;
    const useGrounded = groundedBefore != null && groundedAfter != null;
    const dispTotalTimeMin = useGrounded ? groundedBefore : totalTimeMin;
    const dispAutomatedTimeMin = useGrounded ? groundedAfter : automatedTimeMin;
    const timeSavedMin = useGrounded
      ? Math.round((groundedBefore - groundedAfter) * 10) / 10
      : totalTimeMin - automatedTimeMin;
    const timeSavedPct =
      dispTotalTimeMin > 0
        ? Math.round((timeSavedMin / dispTotalTimeMin) * 100)
        : 0;

    const manualPct =
      scored_steps.length > 0
        ? Math.round((manualSteps.length / scored_steps.length) * 100)
        : 0;
    const autoReadyPct =
      scored_steps.length > 0
        ? Math.round(
            (scored_steps.filter((s) => s.acs >= 7).length /
              scored_steps.length) *
              100,
          )
        : 0;

    const avgACS =
      scored_steps.length > 0
        ? (
            scored_steps.reduce((a, s) => a + s.acs, 0) / scored_steps.length
          ).toFixed(1)
        : "0";

    // Average reduction across opportunities
    const avgReduction =
      opportunities.length > 0
        ? Math.round(
            opportunities.reduce(
              (a, o) => a + (o.effort_reduction_pct || 0),
              0,
            ) / opportunities.length,
          )
        : 0;

    // Per-step comparison data for horizontal bars
    const stepComparisons = scored_steps
      .map((s) => {
        const reduction = reductionMap[s.step_number] || 0;
        const automatedTime = Math.round(
          s.estimated_time_minutes * (1 - reduction / 100),
        );
        return {
          name: s.name,
          currentTime: s.estimated_time_minutes,
          automatedTime,
          reduction,
          isManual: s.is_manual,
          acs: s.acs,
          role: s.responsible_role,
        };
      })
      .filter((s) => s.reduction > 0)
      .sort((a, b) => b.reduction - a.reduction);

    return {
      totalTimeMin: dispTotalTimeMin,
      automatedTimeMin: dispAutomatedTimeMin,
      timeSavedMin,
      timeSavedPct,
      manualSteps: manualSteps.length,
      totalSteps: scored_steps.length,
      manualPct,
      autoReadyPct,
      avgACS: parseFloat(avgACS),
      avgReduction,
      stepComparisons,
    };
  }, [scored_steps, opportunities, roi_estimate]);

  // ── Cost Metrics (recomputed when hourlyRate changes) ────
  const costMetrics = useMemo(() => {
    if (!hourlyRate) return null;

    const assumedWeeklyVolume = roi_estimate?.estimated_weekly_volume || 100;

    // Use the backend's calibrated per-transaction handling time when available so
    // the dashboard's labour maths matches the grounded report (no raw step-sum,
    // no double counting, capped at the team's real annual payroll).
    const beforeMin =
      roi_estimate?.effective_minutes_before ?? metrics.totalTimeMin;
    const afterMin =
      roi_estimate?.effective_minutes_after ?? metrics.automatedTimeMin;

    const cycleCostBefore = (beforeMin / 60) * hourlyRate;
    const cycleCostAfter = (afterMin / 60) * hourlyRate;

    const weeklyCostBefore = cycleCostBefore * assumedWeeklyVolume;
    const weeklyCostAfter = cycleCostAfter * assumedWeeklyVolume;

    // Grounded annual benefit figures — already calibrated & capped by the backend.
    const annualLabourSavings =
      roi_estimate?.annual_labor_savings != null
        ? Math.round(roi_estimate.annual_labor_savings)
        : Math.round((weeklyCostBefore - weeklyCostAfter) * 52);
    const otherBenefits = Math.round(roi_estimate?.other_annual_benefits || 0);
    const totalBenefits =
      roi_estimate?.total_annual_benefits != null
        ? Math.round(roi_estimate.total_annual_benefits)
        : annualLabourSavings + otherBenefits;
    const annualMaintenance = Math.round(
      roi_estimate?.annual_maintenance_cost || 0,
    );
    const netAnnualSavings =
      roi_estimate?.net_annual_savings != null
        ? Math.round(roi_estimate.net_annual_savings)
        : totalBenefits - annualMaintenance;

    // Weekly labour-savings derived from the grounded annual figure so the cards
    // stay internally consistent (52 × weekly ≈ annual labour savings).
    const weeklySavings = Math.round(annualLabourSavings / 52);

    const formatMoney = (val) =>
      val > 0 && val < 10 ? Number(val.toFixed(2)) : Math.round(val);

    return {
      rawWeeklyCostBefore: weeklyCostBefore,
      rawWeeklyCostAfter: weeklyCostAfter,
      rawWeeklySavings: weeklyCostBefore - weeklyCostAfter,
      weeklyCostBefore: formatMoney(weeklyCostBefore),
      weeklyCostAfter: formatMoney(weeklyCostAfter),
      weeklySavings,
      annualSavings: annualLabourSavings,
      otherBenefits,
      totalBenefits,
      netAnnualSavings,
      assumedWeeklyVolume,
      annualMaintenance,
      currencySymbol: roi_estimate?.currency_symbol || "$",
    };
  }, [
    metrics.totalTimeMin,
    metrics.automatedTimeMin,
    hourlyRate,
    roi_estimate,
  ]);

  const totalDevDays = useMemo(() => {
    if (project_timeline && project_timeline.total_project_days) {
      return project_timeline.total_project_days;
    }
    // Fallback if AI hasn't generated the timeline yet
    return scored_steps.reduce((sum, step) => {
      if (step.acs >= 7.0) return sum + 7; // Phase 1: Quick Win (Email/Standard Rules)
      if (step.acs >= 4.0) return sum + 21; // Phase 2/3: Complex IDP, MFA, Approvals
      return sum;
    }, 0);
  }, [scored_steps, project_timeline]);

  // ── ROI Metrics (Return on Investment — depends on savings + investment) ──
  const roiMetrics = useMemo(() => {
    if (!costMetrics || !hourlyRate || !investment) return null;

    // Net annual savings come straight from the grounded backend figure
    // (total benefits − maintenance). Payback & ROI recompute from this plus the
    // (editable) one-time investment, so they always match the report.
    const netAnnualSavings = costMetrics.netAnnualSavings;
    const annualSavings = costMetrics.totalBenefits;
    const monthlySavings = netAnnualSavings / 12;

    const paybackMonths =
      netAnnualSavings > 0 ? investment / (netAnnualSavings / 12) : Infinity;

    const year1Net = netAnnualSavings - investment;
    const roiYear1Pct =
      investment > 0 ? Math.round((year1Net / investment) * 100) : 0;

    const threeYearGross = netAnnualSavings * 3;
    const threeYearNet = threeYearGross - investment;
    const roi3yrPct =
      investment > 0 ? Math.round((threeYearNet / investment) * 100) : 0;

    // Chart horizon: comfortably past break-even, rounded to 6-month ticks, 24–60 mo.
    let horizonMonths = 36;
    if (isFinite(paybackMonths) && paybackMonths > 0) {
      horizonMonths = Math.min(
        60,
        Math.max(24, Math.ceil((paybackMonths * 1.8) / 6) * 6),
      );
    }

    return {
      monthlySavings,
      annualSavings,
      paybackMonths,
      year1Net,
      roiYear1Pct,
      threeYearNet,
      roi3yrPct,
      horizonMonths,
    };
  }, [costMetrics, hourlyRate, investment]);

  if (!scored_steps.length) return null;

  return (
    <div
      className="space-y-5"
      style={{ animation: "fade-in-up 0.5s ease-out 0.2s both" }}
    >
      {/* ── Section Header ───────────────────────────────────── */}
      <div className="flex items-center gap-3">
        <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-violet-500/15 to-cyan-500/15 border border-violet-500/20 flex items-center justify-center">
          <BarChart3 size={16} className="text-violet-400" />
        </div>
        <div>
          <h3 className="text-base font-bold text-white">
            Automation Impact Analytics
          </h3>
          <p className="text-xs text-slate-500 mt-0.5">
            Before vs. After automation — time, cost & effort projections
          </p>
        </div>
      </div>

      {/* ── ROW 1: Hero Summary Cards ───────────────────────── */}
      <div className="grid grid-cols-2 xl:grid-cols-4 gap-4">
        {/* Time Saved */}
        <div className="relative rounded-2xl border border-white/[0.06] bg-gradient-to-br from-violet-500/[0.04] to-transparent p-5 overflow-hidden group hover:border-violet-500/20 transition-all hover:-translate-y-0.5">
          <div className="absolute top-0 right-0 w-20 h-20 bg-violet-500/5 rounded-full -translate-y-6 translate-x-6 blur-xl" />
          <div className="flex items-center gap-2 mb-3">
            <div className="w-8 h-8 rounded-lg bg-violet-500/15 flex items-center justify-center">
              <Clock size={16} className="text-violet-400" />
            </div>
            <span className="text-[10px] text-slate-500 font-bold uppercase tracking-wider">
              Time Saved
            </span>
          </div>
          <div className="text-3xl font-extrabold text-white">
            <AnimatedNumber value={metrics.timeSavedMin} suffix=" min" />
          </div>
          <div className="flex items-center gap-1 mt-1.5">
            <ArrowDown size={12} className="text-emerald-400" />
            <span className="text-xs text-emerald-400 font-bold">
              {metrics.timeSavedPct}% reduction
            </span>
          </div>
          <p className="text-[10px] text-slate-600 mt-2">
            Per processing cycle
          </p>
        </div>

        {/* Weekly Cost Savings */}
        <div className="relative rounded-2xl border border-white/[0.06] bg-gradient-to-br from-emerald-500/[0.04] to-transparent p-5 overflow-hidden group hover:border-emerald-500/20 transition-all hover:-translate-y-0.5">
          <div className="absolute top-0 right-0 w-20 h-20 bg-emerald-500/5 rounded-full -translate-y-6 translate-x-6 blur-xl" />
          {hourlyRate && costMetrics ? (
            <>
              <div className="flex items-center gap-2 mb-3">
                <div className="w-8 h-8 rounded-lg bg-emerald-500/15 flex items-center justify-center">
                  <DollarSign size={16} className="text-emerald-400" />
                </div>
                <span className="text-[10px] text-slate-500 font-bold uppercase tracking-wider">
                  Weekly Savings
                </span>
              </div>
              <div className="text-3xl font-extrabold text-white">
                <AnimatedNumber
                  value={costMetrics.weeklySavings}
                  prefix={CUR}
                />
              </div>
              <div className="flex items-center gap-1 mt-1.5">
                <Sparkles size={12} className="text-emerald-400" />
                <span className="text-xs text-emerald-400 font-bold">
                  {CUR}
                  {costMetrics.annualSavings.toLocaleString()}/yr
                </span>
              </div>
              <p className="text-[9px] text-slate-500 mt-1">
                Based on {costMetrics.assumedWeeklyVolume} cycles/wk
              </p>
              {/* Editable Rate Inline */}
              <div className="flex items-center gap-1.5 mt-2">
                {editingRateId === "weekly" ? (
                  <div className="flex items-center gap-1">
                    <span className="text-[10px] text-slate-500">{CUR}</span>
                    <input
                      type="number"
                      value={rateInput}
                      onChange={(e) => setRateInput(e.target.value)}
                      onKeyDown={(e) => e.key === "Enter" && handleRateSubmit()}
                      onBlur={handleRateSubmit}
                      autoFocus
                      className="w-14 h-5 px-1 rounded bg-slate-800 border border-emerald-500/30 text-[10px] text-white text-center outline-none focus:border-emerald-400"
                    />
                    <span className="text-[10px] text-slate-500">/hr</span>
                    <button
                      onMouseDown={(e) => e.preventDefault()}
                      onClick={handleRateSubmit}
                      className="p-0.5 rounded hover:bg-white/10 text-emerald-400"
                    >
                      <Check size={10} />
                    </button>
                  </div>
                ) : (
                  <button
                    onClick={(e) => {
                      e.preventDefault();
                      setRateInput(String(hourlyRate));
                      setEditingRateId("weekly");
                    }}
                    className="flex items-center gap-1 text-[10px] text-slate-500 hover:text-slate-300 transition-colors"
                  >
                    <span>
                      {CUR}
                      {hourlyRate}/hr rate
                    </span>
                    <Pencil size={9} className="text-slate-600" />
                  </button>
                )}
              </div>
            </>
          ) : (
            <div className="flex flex-col items-center justify-center h-full text-center relative z-10 py-1">
              <DollarSign size={20} className="text-emerald-500/40 mb-2" />
              <span className="text-[10px] text-slate-400 font-bold uppercase tracking-wider mb-3">
                Cost Analytics
              </span>
              {editingRateId === "weekly" ? (
                <div className="flex items-center justify-center gap-1">
                  <span className="text-[10px] text-slate-500">{CUR}</span>
                  <input
                    type="number"
                    value={rateInput}
                    onChange={(e) => setRateInput(e.target.value)}
                    onKeyDown={(e) => e.key === "Enter" && handleRateSubmit()}
                    onBlur={handleRateSubmit}
                    autoFocus
                    placeholder="Rate"
                    className="w-16 h-6 px-1 rounded bg-slate-800 border border-emerald-500/30 text-[11px] text-white text-center outline-none focus:border-emerald-400"
                  />
                  <span className="text-[10px] text-slate-500">/hr</span>
                  <button
                    onMouseDown={(e) => e.preventDefault()}
                    onClick={handleRateSubmit}
                    className="p-1 rounded hover:bg-white/10 text-emerald-400"
                  >
                    <Check size={12} />
                  </button>
                </div>
              ) : (
                <button
                  onClick={(e) => {
                    e.preventDefault();
                    setRateInput("35");
                    setEditingRateId("weekly");
                  }}
                  className="px-3 py-1.5 rounded-lg bg-emerald-500/10 text-emerald-400 text-[10px] font-bold hover:bg-emerald-500/20 transition-colors border border-emerald-500/20"
                >
                  Enter Hourly Rate
                </button>
              )}
            </div>
          )}
        </div>

        {/* Manual Steps Eliminated */}
        <div className="relative rounded-2xl border border-white/[0.06] bg-gradient-to-br from-cyan-500/[0.04] to-transparent p-5 overflow-hidden group hover:border-cyan-500/20 transition-all hover:-translate-y-0.5">
          <div className="absolute top-0 right-0 w-20 h-20 bg-cyan-500/5 rounded-full -translate-y-6 translate-x-6 blur-xl" />
          <div className="flex items-center gap-2 mb-3">
            <div className="w-8 h-8 rounded-lg bg-cyan-500/15 flex items-center justify-center">
              <Users size={16} className="text-cyan-400" />
            </div>
            <span className="text-[10px] text-slate-500 font-bold uppercase tracking-wider">
              Manual Steps
            </span>
          </div>
          <div className="text-3xl font-extrabold text-white">
            {metrics.manualSteps}
            <span className="text-base font-normal text-slate-500 ml-0.5">
              /{metrics.totalSteps}
            </span>
          </div>
          <div className="flex items-center gap-1 mt-1.5">
            <TrendingDown size={12} className="text-cyan-400" />
            <span className="text-xs text-cyan-400 font-bold">
              {metrics.manualPct}% manual today
            </span>
          </div>
          <p className="text-[10px] text-slate-600 mt-2">
            Eligible for automation
          </p>
        </div>

        {/* Avg Effort Reduction */}
        <div className="relative rounded-2xl border border-white/[0.06] bg-gradient-to-br from-amber-500/[0.04] to-transparent p-5 overflow-hidden group hover:border-amber-500/20 transition-all hover:-translate-y-0.5">
          <div className="absolute top-0 right-0 w-20 h-20 bg-amber-500/5 rounded-full -translate-y-6 translate-x-6 blur-xl" />
          <div className="flex items-center gap-2 mb-3">
            <div className="w-8 h-8 rounded-lg bg-amber-500/15 flex items-center justify-center">
              <Percent size={16} className="text-amber-400" />
            </div>
            <span className="text-[10px] text-slate-500 font-bold uppercase tracking-wider">
              Avg Reduction
            </span>
          </div>
          <div className="text-3xl font-extrabold text-white">
            <AnimatedNumber value={metrics.avgReduction} suffix="%" />
          </div>
          <div className="flex items-center gap-1 mt-1.5">
            <Activity size={12} className="text-amber-400" />
            <span className="text-xs text-amber-400 font-bold">
              {opportunities.length} opportunities
            </span>
          </div>
          <p className="text-[10px] text-slate-600 mt-2">Across all targets</p>
        </div>

        {/* Estimated Build Time */}
        <div className="relative rounded-2xl border border-white/[0.06] bg-gradient-to-br from-fuchsia-500/[0.04] to-transparent p-5 group hover:border-fuchsia-500/20 transition-all hover:-translate-y-0.5 hover:z-[100]">
          <div className="absolute inset-0 overflow-hidden rounded-2xl pointer-events-none">
            <div className="absolute top-0 right-0 w-20 h-20 bg-fuchsia-500/5 rounded-full -translate-y-6 translate-x-6 blur-xl" />
          </div>
          <div className="flex items-center gap-2 mb-3 relative z-10">
            <div className="w-8 h-8 rounded-lg bg-fuchsia-500/15 flex items-center justify-center">
              <CalendarClock size={16} className="text-fuchsia-400" />
            </div>
            <span className="text-[10px] text-slate-500 font-bold uppercase tracking-wider">
              Est. Project Time
            </span>
          </div>
          <div className="text-3xl font-extrabold text-white relative z-10">
            {totalDevDays}{" "}
            <span className="text-base font-normal text-slate-500 ml-0.5">
              days
            </span>
          </div>
          <div className="flex items-center gap-1 mt-1.5 relative z-10">
            <Target size={12} className="text-fuchsia-400" />
            <span className="text-xs text-fuchsia-400 font-bold border-b border-dashed border-fuchsia-400/50 cursor-help">
              Full E2E Automation
            </span>
          </div>
          <p className="text-[10px] text-slate-600 mt-2 relative z-10 hover:text-fuchsia-400/80 cursor-default transition-colors">
            Hover for multi-phase roadmap
          </p>
          <div className="flex items-start gap-1 mt-2 relative z-10">
            <AlertTriangle
              size={10}
              className="text-amber-400/80 shrink-0 mt-0.5"
            />
            <p className="text-[9px] text-amber-200/70 leading-snug">
              Model + AI estimate — directional only, not a delivery commitment.
              Validate against your team's velocity.
            </p>
          </div>

          {/* Hover Tooltip Dropdown (Z-Index Fixed & Dynamic AI Timeline) */}
          <div className="absolute top-[105%] left-0 w-[300px] p-4 bg-[#0f172a] border border-white/10 rounded-xl shadow-[0_0_40px_rgba(0,0,0,0.5)] opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none group-hover:pointer-events-auto z-[9999] before:absolute before:-top-3 before:left-0 before:right-0 before:h-3 before:content-['']">
            <h5 className="text-[11px] font-bold text-white mb-3 uppercase tracking-wider text-fuchsia-400">
              Full End-to-End Roadmap
            </h5>
            <ul className="text-[11px] text-slate-300 space-y-3">
              {project_timeline && project_timeline.phases ? (
                project_timeline.phases.map((phase, idx) => (
                  <li key={idx}>
                    <div className="flex justify-between items-center mb-0.5">
                      <span
                        className={`font-bold ${idx === 0 ? "text-emerald-400" : idx === 1 ? "text-amber-400" : "text-fuchsia-400"}`}
                      >
                        {phase.phase_name}
                      </span>
                      <span className="text-slate-400 text-[10px]">
                        {phase.total_phase_days} Days
                      </span>
                    </div>
                    <p className="text-[10px] text-slate-400 leading-tight mb-1">
                      {phase.complexity_rationale}
                    </p>
                    <div className="flex gap-2 text-[9px] text-slate-500 font-medium">
                      <span>Dev: {phase.development_days}d</span>
                      <span>Test/UAT: {phase.testing_days}d</span>
                      <span>Review: {phase.review_days}d</span>
                    </div>
                  </li>
                ))
              ) : (
                <>
                  <li>
                    <div className="flex justify-between items-center mb-0.5">
                      <span className="font-bold text-emerald-400">
                        Phase 1: Ingestion & Quick Wins
                      </span>
                      <span className="text-slate-400 text-[10px]">
                        7 Days/Step
                      </span>
                    </div>
                    <p className="text-[10px] text-slate-400 leading-tight">
                      Fast deployment of rules-based triggers (e.g. Email
                      download, SAP login).
                    </p>
                  </li>
                  <li>
                    <div className="flex justify-between items-center mb-0.5">
                      <span className="font-bold text-amber-400">
                        Phase 2: Intelligent Validation
                      </span>
                      <span className="text-slate-400 text-[10px]">
                        3-4 Weeks
                      </span>
                    </div>
                    <p className="text-[10px] text-slate-400 leading-tight">
                      Training Document Understanding (OCR) to read unstructured
                      invoices & MFA integration.
                    </p>
                  </li>
                  <li>
                    <div className="flex justify-between items-center mb-0.5">
                      <span className="font-bold text-fuchsia-400">
                        Phase 3: Smart Approvals
                      </span>
                      <span className="text-slate-400 text-[10px]">
                        2 Weeks
                      </span>
                    </div>
                    <p className="text-[10px] text-slate-400 leading-tight">
                      Action Center integration for Human-in-the-Loop decision
                      logic and threshold routing.
                    </p>
                  </li>
                </>
              )}
            </ul>
          </div>
        </div>
      </div>

      {/* ── ROW 2: Charts Grid ──────────────────────────────── */}
      <div className="grid grid-cols-1 md:grid-cols-2 2xl:grid-cols-3 gap-5">
        {/* ── Col 1: Time Before/After Donut ──────────────── */}
        <div className="rounded-2xl border border-white/[0.06] bg-white/[0.02] p-6">
          <h4 className="text-xs font-bold text-slate-300 uppercase tracking-widest mb-5 flex items-center gap-2">
            <Clock size={13} className="text-violet-400" />
            Time Comparison
          </h4>
          <div className="flex flex-wrap items-center justify-around gap-4">
            <DonutChart
              percentage={100}
              color="#f87171"
              label="Before"
              subLabel={`${metrics.totalTimeMin} min`}
              size={110}
              strokeWidth={12}
            />
            <div className="flex flex-col items-center gap-1 shrink-0">
              <ArrowDown size={20} className="text-emerald-400" />
              <span className="text-lg font-extrabold text-emerald-400">
                {metrics.timeSavedPct}%
              </span>
              <span className="text-[9px] text-slate-500 font-bold uppercase">
                Saved
              </span>
            </div>
            <DonutChart
              percentage={Math.round(
                (metrics.automatedTimeMin / Math.max(metrics.totalTimeMin, 1)) *
                  100,
              )}
              color="#34d399"
              label="After"
              subLabel={`${metrics.automatedTimeMin} min`}
              size={110}
              strokeWidth={12}
            />
          </div>
        </div>

        {/* ── Col 2: ACS Score Distribution ───────────────── */}
        <div className="rounded-2xl border border-white/[0.06] bg-white/[0.02] p-6">
          <h4 className="text-xs font-bold text-slate-300 uppercase tracking-widest mb-5 flex items-center gap-2">
            <Activity size={13} className="text-cyan-400" />
            ACS Score Distribution
          </h4>
          <div className="flex flex-wrap items-center justify-center gap-5 mb-5">
            <RadialGauge
              value={parseFloat(metrics.avgACS)}
              max={10}
              label="Avg ACS"
              color="#818cf8"
              size={72}
            />
            <RadialGauge
              value={scored_steps.reduce((m, s) => Math.max(m, s.acs), 0)}
              max={10}
              label="Highest"
              color="#34d399"
              size={72}
            />
            <RadialGauge
              value={scored_steps.reduce((m, s) => Math.min(m, s.acs), 10)}
              max={10}
              label="Lowest"
              color="#f87171"
              size={72}
            />
          </div>
          <ACSDistributionBar scoredSteps={scored_steps} />
        </div>

        {/* ── Col 3: Cost Impact ─────────────────────────── */}
        <div className="rounded-2xl border border-white/[0.06] bg-white/[0.02] p-6 relative">
          <div className="flex items-center justify-between mb-5">
            <h4 className="text-xs font-bold text-slate-300 uppercase tracking-widest flex items-center gap-2">
              <DollarSign size={13} className="text-emerald-400" />
              Cost Impact Projection
            </h4>
            {/* Hourly Rate Editor */}
            {hourlyRate && costMetrics && (
              <div className="flex items-center gap-1.5">
                {editingRateId === "impact" ? (
                  <div className="flex items-center gap-1 px-2 py-1 rounded-lg bg-slate-800/60 border border-emerald-500/20">
                    <span className="text-[10px] text-slate-400">{CUR}</span>
                    <input
                      type="number"
                      value={rateInput}
                      onChange={(e) => setRateInput(e.target.value)}
                      onKeyDown={(e) => e.key === "Enter" && handleRateSubmit()}
                      onBlur={handleRateSubmit}
                      autoFocus
                      className="w-16 h-5 px-1 rounded bg-slate-700 border border-white/10 text-[11px] text-white text-center outline-none focus:border-emerald-400"
                    />
                    <span className="text-[10px] text-slate-400">/hr</span>
                    <button
                      onMouseDown={(e) => e.preventDefault()}
                      onClick={handleRateSubmit}
                      className="p-0.5 rounded hover:bg-white/10 text-emerald-400"
                    >
                      <Check size={11} />
                    </button>
                  </div>
                ) : (
                  <button
                    onClick={(e) => {
                      e.preventDefault();
                      setRateInput(String(hourlyRate));
                      setEditingRateId("impact");
                    }}
                    className="flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-slate-800/40 border border-white/[0.06] hover:border-emerald-500/20 text-[10px] text-slate-400 hover:text-white transition-all"
                  >
                    <DollarSign size={10} />
                    {hourlyRate}/hr
                    <Pencil size={9} className="text-slate-600" />
                  </button>
                )}
              </div>
            )}
          </div>

          {hourlyRate && costMetrics ? (
            <>
              <div className="flex items-center justify-center mb-5">
                <DonutChart
                  percentage={
                    costMetrics.rawWeeklyCostBefore > 0
                      ? Math.round(
                          (costMetrics.rawWeeklySavings /
                            costMetrics.rawWeeklyCostBefore) *
                            100,
                        )
                      : 0
                  }
                  color="#10b981"
                  label="Cost Reduction"
                  subLabel={`${CUR}${costMetrics.weeklySavings}/week saved`}
                  size={110}
                  strokeWidth={12}
                />
              </div>
              <div className="space-y-3 mt-3">
                <div className="flex items-center justify-between py-2 px-3 rounded-lg bg-slate-800/40">
                  <span className="text-[10px] text-slate-400 font-semibold">
                    Weekly Cost (Before)
                  </span>
                  <span className="text-xs text-rose-400 font-bold">
                    {CUR}
                    {costMetrics.weeklyCostBefore}
                  </span>
                </div>
                <div className="flex items-center justify-between py-2 px-3 rounded-lg bg-slate-800/40">
                  <span className="text-[10px] text-slate-400 font-semibold">
                    Weekly Cost (After)
                  </span>
                  <span className="text-xs text-emerald-400 font-bold">
                    {CUR}
                    {costMetrics.weeklyCostAfter}
                  </span>
                </div>
                <div className="flex items-center justify-between py-2 px-3 rounded-lg bg-emerald-500/10 border border-emerald-500/15">
                  <span className="text-[10px] text-emerald-300 font-bold">
                    Annual Savings
                  </span>
                  <span className="text-sm text-emerald-400 font-extrabold">
                    {CUR}
                    {costMetrics.annualSavings.toLocaleString()}
                  </span>
                </div>
              </div>
            </>
          ) : (
            <div className="flex flex-col items-center justify-center py-8">
              <div className="w-16 h-16 rounded-full bg-emerald-500/5 flex items-center justify-center mb-4 border border-emerald-500/10">
                <DollarSign size={24} className="text-emerald-500/40" />
              </div>
              <h5 className="text-sm font-bold text-slate-300 mb-2">
                Unlock ROI Projections
              </h5>
              <p className="text-[11px] text-slate-500 text-center mb-6 max-w-[200px]">
                Enter your average AP staff hourly rate to calculate projected
                weekly and annual cost savings.
              </p>
              {editingRateId === "impact" ? (
                <div className="flex items-center justify-center gap-1 px-3 py-2 rounded-lg bg-slate-800/60 border border-emerald-500/20">
                  <span className="text-xs text-slate-400">{CUR}</span>
                  <input
                    type="number"
                    value={rateInput}
                    onChange={(e) => setRateInput(e.target.value)}
                    onKeyDown={(e) => e.key === "Enter" && handleRateSubmit()}
                    onBlur={handleRateSubmit}
                    autoFocus
                    placeholder="35"
                    className="w-16 h-6 px-1 rounded bg-slate-700 border border-white/10 text-xs text-white text-center outline-none focus:border-emerald-400"
                  />
                  <span className="text-xs text-slate-400">/hr</span>
                  <button
                    onMouseDown={(e) => e.preventDefault()}
                    onClick={handleRateSubmit}
                    className="p-1 rounded hover:bg-white/10 text-emerald-400 ml-1"
                  >
                    <Check size={14} />
                  </button>
                </div>
              ) : (
                <button
                  onClick={(e) => {
                    e.preventDefault();
                    setRateInput("35");
                    setEditingRateId("impact");
                  }}
                  className="px-4 py-2 rounded-lg bg-emerald-500/10 text-emerald-400 text-xs font-bold hover:bg-emerald-500/20 transition-colors border border-emerald-500/20 flex items-center gap-2 shadow-lg shadow-emerald-500/5"
                >
                  <DollarSign size={14} />
                  Enter Hourly Rate
                </button>
              )}
            </div>
          )}
        </div>
      </div>

      {/* ── ROW 3: Return on Investment ──────────────────────── */}
      <div className="rounded-2xl border border-white/[0.06] bg-gradient-to-br from-violet-500/[0.035] via-transparent to-emerald-500/[0.04] p-6 relative overflow-hidden">
        <div className="absolute -top-10 -right-10 w-40 h-40 bg-emerald-500/5 rounded-full blur-3xl pointer-events-none" />
        <div className="absolute -bottom-12 -left-10 w-40 h-40 bg-violet-500/5 rounded-full blur-3xl pointer-events-none" />

        {/* Header */}
        <div className="flex items-center justify-between gap-3 flex-wrap mb-5 relative z-10">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-xl bg-gradient-to-br from-violet-500/20 to-emerald-500/20 border border-white/10 flex items-center justify-center">
              <TrendingUp size={17} className="text-emerald-400" />
            </div>
            <div>
              <h4 className="text-sm font-bold text-white">
                Return on Investment
              </h4>
              <p className="text-[11px] text-slate-500 mt-0.5">
                Payback timeline & net value from automating these steps
              </p>
            </div>
          </div>

          {/* Editable investment */}
          {hourlyRate && costMetrics && roiMetrics && (
            <div className="flex items-center gap-1.5">
              {editingInvestment ? (
                <div className="flex items-center gap-1 px-2 py-1 rounded-lg bg-slate-800/60 border border-violet-500/20">
                  <span className="text-[10px] text-slate-400">{CUR}</span>
                  <input
                    type="number"
                    value={investmentInput}
                    onChange={(e) => setInvestmentInput(e.target.value)}
                    onKeyDown={(e) =>
                      e.key === "Enter" && handleInvestmentSubmit()
                    }
                    onBlur={handleInvestmentSubmit}
                    autoFocus
                    className="w-24 h-5 px-1 rounded bg-slate-700 border border-white/10 text-[11px] text-white text-center outline-none focus:border-violet-400"
                  />
                  <button
                    onMouseDown={(e) => e.preventDefault()}
                    onClick={handleInvestmentSubmit}
                    className="p-0.5 rounded hover:bg-white/10 text-violet-400"
                  >
                    <Check size={11} />
                  </button>
                </div>
              ) : (
                <button
                  onClick={(e) => {
                    e.preventDefault();
                    setInvestmentInput(String(investment));
                    setEditingInvestment(true);
                  }}
                  className="flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-slate-800/40 border border-white/[0.06] hover:border-violet-500/20 text-[10px] text-slate-400 hover:text-white transition-all"
                  title="One-time implementation cost (editable estimate)"
                >
                  <Wallet size={10} />
                  Investment: {CUR}
                  {investment.toLocaleString()}
                  <Pencil size={9} className="text-slate-600" />
                </button>
              )}
            </div>
          )}
        </div>

        {hourlyRate && costMetrics && roiMetrics ? (
          <div className="relative z-10">
            {/* Accuracy disclaimer */}
            <div className="flex items-start gap-2 mb-4 px-3 py-2 rounded-lg bg-amber-500/[0.06] border border-amber-500/15">
              <AlertTriangle
                size={12}
                className="text-amber-400 shrink-0 mt-0.5"
              />
              <p className="text-[10px] text-amber-200/75 leading-relaxed">
                These figures are produced by a deterministic model using your
                inputs plus AI estimates — a{" "}
                <span className="font-semibold text-amber-300">
                  directional projection, not a guarantee
                </span>
                . Accuracy improves when you provide real transaction volume,
                hourly rate and implementation cost.
              </p>
            </div>
            {/* KPI tiles */}
            <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 mb-6">
              {/* ROI Year 1 */}
              <div
                className={`rounded-xl border p-4 ${roiMetrics.roiYear1Pct >= 0 ? "border-emerald-500/15 bg-emerald-500/[0.05]" : "border-rose-500/15 bg-rose-500/[0.05]"}`}
              >
                <div className="flex items-center gap-1.5 mb-2">
                  <Target
                    size={12}
                    className={
                      roiMetrics.roiYear1Pct >= 0
                        ? "text-emerald-400"
                        : "text-rose-400"
                    }
                  />
                  <span className="text-[9px] text-slate-500 font-bold uppercase tracking-wider">
                    ROI · Year 1
                  </span>
                </div>
                <div
                  className={`text-2xl font-extrabold ${roiMetrics.roiYear1Pct >= 0 ? "text-emerald-400" : "text-rose-400"}`}
                >
                  <AnimatedNumber value={roiMetrics.roiYear1Pct} suffix="%" />
                </div>
                <p className="text-[9px] text-slate-600 mt-1">
                  Return in first 12 months
                </p>
              </div>

              {/* Payback period */}
              <div className="rounded-xl border border-violet-500/15 bg-violet-500/[0.05] p-4">
                <div className="flex items-center gap-1.5 mb-2">
                  <CalendarClock size={12} className="text-violet-400" />
                  <span className="text-[9px] text-slate-500 font-bold uppercase tracking-wider">
                    Payback Period
                  </span>
                </div>
                <div className="text-2xl font-extrabold text-violet-300">
                  {isFinite(roiMetrics.paybackMonths) ? (
                    <>
                      {roiMetrics.paybackMonths.toFixed(1)}
                      <span className="text-sm font-semibold text-slate-500 ml-1">
                        mo
                      </span>
                    </>
                  ) : (
                    <span className="text-slate-500">∞</span>
                  )}
                </div>
                <p className="text-[9px] text-slate-600 mt-1">
                  Time to recoup investment
                </p>
              </div>

              {/* Net benefit Year 1 */}
              <div className="rounded-xl border border-white/[0.06] bg-white/[0.02] p-4">
                <div className="flex items-center gap-1.5 mb-2">
                  <Wallet size={12} className="text-cyan-400" />
                  <span className="text-[9px] text-slate-500 font-bold uppercase tracking-wider">
                    Net Benefit · Yr 1
                  </span>
                </div>
                <div
                  className={`text-2xl font-extrabold ${roiMetrics.year1Net >= 0 ? "text-white" : "text-rose-400"}`}
                >
                  {roiMetrics.year1Net < 0 ? "−" : ""}
                  {CUR}
                  {Math.abs(Math.round(roiMetrics.year1Net)).toLocaleString()}
                </div>
                <p className="text-[9px] text-slate-600 mt-1">
                  Savings minus investment
                </p>
              </div>

              {/* 3-year net value */}
              <div className="rounded-xl border border-emerald-500/15 bg-gradient-to-br from-emerald-500/[0.08] to-transparent p-4">
                <div className="flex items-center gap-1.5 mb-2">
                  <Rocket size={12} className="text-emerald-400" />
                  <span className="text-[9px] text-slate-500 font-bold uppercase tracking-wider">
                    3-Year Net Value
                  </span>
                </div>
                <div
                  className={`text-2xl font-extrabold ${roiMetrics.threeYearNet >= 0 ? "text-emerald-400" : "text-rose-400"}`}
                >
                  {roiMetrics.threeYearNet < 0 ? "−" : ""}
                  {CUR}
                  {Math.abs(
                    Math.round(roiMetrics.threeYearNet),
                  ).toLocaleString()}
                </div>
                <p className="text-[9px] text-slate-600 mt-1">
                  {roiMetrics.roi3yrPct >= 0 ? "+" : ""}
                  {roiMetrics.roi3yrPct}% total return
                </p>
              </div>
            </div>

            {/* Payback curve chart */}
            <div className="rounded-xl border border-white/[0.05] bg-slate-900/40 p-4">
              <div className="flex items-center justify-between mb-1 flex-wrap gap-2">
                <span className="text-[11px] font-bold text-slate-300 uppercase tracking-widest flex items-center gap-1.5">
                  <Activity size={12} className="text-emerald-400" />
                  Cost Comparison Over Time
                </span>
                <span className="text-[10px] text-slate-400 bg-slate-950/50 px-2 py-1 rounded-md border border-white/5">
                  Based on user input ({costMetrics.assumedWeeklyVolume}{" "}
                  cycles/wk @ {CUR}
                  {hourlyRate}/hr) & AI estimates
                </span>
              </div>

              <DetailedROIChart
                monthlySavings={roiMetrics.monthlySavings}
                investment={investment}
                breakEvenMonth={
                  isFinite(roiMetrics.paybackMonths)
                    ? roiMetrics.paybackMonths
                    : null
                }
                horizonMonths={roiMetrics.horizonMonths}
                costMetrics={costMetrics}
              />
            </div>

            {/* Executive Summary */}
            <div className="mt-4 p-4 rounded-xl border border-emerald-500/10 bg-emerald-500/[0.03]">
              <h5 className="text-[11px] font-bold text-slate-300 uppercase tracking-widest mb-2 flex items-center gap-1.5">
                <Sparkles size={13} className="text-emerald-400" />
                Executive ROI Summary
              </h5>
              <p className="text-xs text-slate-400 leading-relaxed">
                By investing an estimated{" "}
                <strong className="text-violet-300">
                  {CUR}
                  {Math.round(investment).toLocaleString()}
                </strong>{" "}
                to implement this automation (with{" "}
                <strong className="text-rose-300">
                  {CUR}
                  {costMetrics.annualMaintenance.toLocaleString()}
                </strong>{" "}
                in annual maintenance), the organization is projected to
                generate{" "}
                <strong className="text-emerald-400">
                  {CUR}
                  {costMetrics.totalBenefits.toLocaleString()} in total annual
                  benefits
                </strong>{" "}
                ({CUR}
                {costMetrics.annualSavings.toLocaleString()} labour
                {costMetrics.otherBenefits > 0 ? (
                  <>
                    {" "}
                    + {CUR}
                    {costMetrics.otherBenefits.toLocaleString()} penalties
                    avoided / discounts captured
                  </>
                ) : null}
                ), or{" "}
                <strong className="text-emerald-400">
                  {CUR}
                  {costMetrics.netAnnualSavings.toLocaleString()} net of
                  maintenance
                </strong>
                .
                {isFinite(roiMetrics.paybackMonths) ? (
                  <>
                    {" "}
                    At that net rate the initial investment pays for itself in
                    just{" "}
                    <strong className="text-emerald-400">
                      {roiMetrics.paybackMonths.toFixed(1)} months
                    </strong>
                    .{" "}
                  </>
                ) : (
                  <>
                    {" "}
                    However, based on the current rates, the process does not
                    yield enough savings to break even.{" "}
                  </>
                )}
                Looking over a 3-year horizon, this initiative is expected to
                generate a total net financial benefit of{" "}
                <strong
                  className={`font-extrabold ${roiMetrics.threeYearNet >= 0 ? "text-emerald-400" : "text-rose-400"}`}
                >
                  {CUR}
                  {Math.round(roiMetrics.threeYearNet).toLocaleString()}
                </strong>
                , representing a return on investment of{" "}
                <strong
                  className={`${roiMetrics.roi3yrPct >= 0 ? "text-emerald-400" : "text-rose-400"}`}
                >
                  {roiMetrics.roi3yrPct}%
                </strong>
                .
              </p>
            </div>

            {/* Detailed Cost Breakdown */}
            {(() => {
              const breakdown =
                roi_estimate?.cost_breakdown &&
                roi_estimate.cost_breakdown.length > 0
                  ? roi_estimate.cost_breakdown
                  : roi_estimate?.implementation_cost_breakdown &&
                      roi_estimate.implementation_cost_breakdown.length > 0
                    ? roi_estimate.implementation_cost_breakdown
                    : [
                        {
                          category: "Baseline & Orchestration",
                          cost: 5000,
                          cost_type: "One-Time",
                          description:
                            "Core deployment, robot orchestration setup, and global logging framework.",
                        },
                        ...opportunities.map((opp) => ({
                          category: `Workflow: ${opp.step_name || "Automation Opportunity"}`,
                          cost: 2500,
                          cost_type: "One-Time",
                          description: `Development, testing, and deployment of '${opp.ap_pattern || "Custom Automation"}' pattern.`,
                        })),
                      ];

              return (
                <div className="mt-4 p-4 rounded-xl border border-white/[0.05] bg-slate-900/20">
                  <div className="flex justify-between items-center mb-3 flex-wrap gap-2">
                    <h5 className="text-[11px] font-bold text-slate-300 uppercase tracking-widest flex items-center gap-1.5">
                      <Wallet size={12} className="text-violet-400" />
                      Detailed Cost Breakdown
                    </h5>
                  </div>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    {breakdown.map((item, idx) => {
                      const isOneTime =
                        !item.cost_type ||
                        item.cost_type.toLowerCase().includes("one-time");
                      return (
                        <div
                          key={idx}
                          className="flex justify-between items-start gap-3 p-3 rounded-xl bg-slate-950/40 border border-white/[0.03] hover:border-violet-500/20 transition-all duration-300"
                        >
                          <div className="min-w-0 flex-1">
                            <div className="flex flex-wrap items-center gap-2">
                              <span className="text-xs font-bold text-violet-200">
                                {item.category}
                              </span>
                              <span
                                className={`text-[9px] px-1.5 py-0.5 rounded border ${isOneTime ? "bg-violet-500/10 text-violet-400 border-violet-500/10" : "bg-rose-500/10 text-rose-400 border-rose-500/10"} uppercase tracking-wider font-bold`}
                              >
                                {item.cost_type || "One-Time"}
                              </span>
                            </div>
                            <p className="text-[10px] text-slate-400 mt-1 leading-relaxed">
                              {item.description}
                            </p>
                          </div>
                          <span
                            className={`text-xs font-extrabold shrink-0 px-2.5 py-1 rounded-lg border shadow-md ${isOneTime ? "bg-violet-500/15 text-white border-violet-500/20" : "bg-rose-500/15 text-white border-rose-500/20"}`}
                          >
                            {CUR}
                            {Math.round(item.cost).toLocaleString()}
                          </span>
                        </div>
                      );
                    })}
                  </div>
                </div>
              );
            })()}
          </div>
        ) : (
          /* Locked state — ROI needs the hourly rate to derive savings */
          <div className="flex flex-col items-center justify-center py-10 relative z-10">
            <div className="w-16 h-16 rounded-full bg-violet-500/5 flex items-center justify-center mb-4 border border-violet-500/10">
              <TrendingUp size={24} className="text-violet-500/40" />
            </div>
            <h5 className="text-sm font-bold text-slate-300 mb-2">
              See Your Return on Investment
            </h5>
            <p className="text-[11px] text-slate-500 text-center mb-6 max-w-[260px]">
              Set your average AP staff hourly rate to project payback period,
              net benefit and multi-year ROI.
            </p>
            <button
              onClick={(e) => {
                e.preventDefault();
                setRateInput("35");
                setEditingRateId("impact");
              }}
              className="px-4 py-2 rounded-lg bg-violet-500/10 text-violet-300 text-xs font-bold hover:bg-violet-500/20 transition-colors border border-violet-500/20 flex items-center gap-2 shadow-lg shadow-violet-500/5"
            >
              <DollarSign size={14} />
              Enter Hourly Rate
            </button>
          </div>
        )}
      </div>

      {/* ── ROW 4: Automation Readiness Gauge ───────────────── */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
        {/* Readiness Overview */}
        <div className="rounded-2xl border border-white/[0.06] bg-white/[0.02] p-6">
          <h4 className="text-xs font-bold text-slate-300 uppercase tracking-widest mb-5 flex items-center gap-2">
            <Sparkles size={13} className="text-amber-400" />
            Automation Readiness
          </h4>
          <div className="flex flex-wrap items-center justify-center gap-8">
            <DonutChart
              percentage={metrics.autoReadyPct}
              color="#818cf8"
              label="Ready for Automation"
              subLabel={`ACS ≥ 7 threshold`}
              size={130}
              strokeWidth={14}
            />
            <div className="space-y-4">
              <div>
                <div className="text-2xl font-extrabold text-white">
                  {scored_steps.filter((s) => s.acs >= 7).length}
                </div>
                <div className="text-[10px] text-slate-500 font-bold uppercase tracking-wider">
                  Priority Steps
                </div>
              </div>
              <div>
                <div className="text-2xl font-extrabold text-white">
                  {scored_steps.filter((s) => s.acs < 5).length}
                </div>
                <div className="text-[10px] text-slate-500 font-bold uppercase tracking-wider">
                  Need Review
                </div>
              </div>
              <div>
                <div className="text-2xl font-extrabold text-white">
                  {scored_steps.filter((s) => s.acs >= 5 && s.acs < 7).length}
                </div>
                <div className="text-[10px] text-slate-500 font-bold uppercase tracking-wider">
                  Partial Candidates
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* Manual vs Assisted Breakdown */}
        <div className="rounded-2xl border border-white/[0.06] bg-white/[0.02] p-6">
          <h4 className="text-xs font-bold text-slate-300 uppercase tracking-widest mb-5 flex items-center gap-2">
            <Users size={13} className="text-cyan-400" />
            Manual vs Assisted Breakdown
          </h4>
          <div className="flex flex-wrap items-center justify-center gap-8">
            <DonutChart
              percentage={metrics.manualPct}
              color="#f87171"
              label="Manual Steps"
              subLabel={`${metrics.manualSteps} of ${metrics.totalSteps}`}
              size={130}
              strokeWidth={14}
            />
            <div className="space-y-3 flex-1 max-w-[200px]">
              {/* Time breakdown */}
              <div className="p-3 rounded-xl bg-rose-500/[0.06] border border-rose-500/10">
                <div className="text-[10px] text-rose-400 font-bold uppercase tracking-wider mb-0.5">
                  Manual Time
                </div>
                <div className="text-lg font-extrabold text-white">
                  {scored_steps
                    .filter((s) => s.is_manual)
                    .reduce((a, s) => a + s.estimated_time_minutes, 0)}{" "}
                  min
                </div>
              </div>
              <div className="p-3 rounded-xl bg-emerald-500/[0.06] border border-emerald-500/10">
                <div className="text-[10px] text-emerald-400 font-bold uppercase tracking-wider mb-0.5">
                  Assisted Time
                </div>
                <div className="text-lg font-extrabold text-white">
                  {scored_steps
                    .filter((s) => !s.is_manual)
                    .reduce((a, s) => a + s.estimated_time_minutes, 0)}{" "}
                  min
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
