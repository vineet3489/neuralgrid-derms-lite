import React, { useState, useMemo } from 'react'
import {
  ComposedChart, Area, Line, XAxis, YAxis, CartesianGrid, Tooltip,
  ResponsiveContainer, ReferenceLine, ReferenceArea, BarChart, Bar, Cell,
} from 'recharts'
import { TrendingDown, Zap, Shield, DollarSign, AlertTriangle, CheckCircle2, Settings2 } from 'lucide-react'
import clsx from 'clsx'
import { LV_BRANCHES_DEMO, SPG_GROUPS, DEMO_DT } from '../data/auzanceNetwork'

// ─── types ────────────────────────────────────────────────────────────────────
interface ScenarioConfig {
  branchId: string
  surgeKw: number
  curtailKw: number
  pricePerMwh: number
  surgeStart: number   // slot index (0–47)
  surgeEnd: number     // slot index (exclusive)
  eventType: 'thermal_overload' | 'voltage_violation' | 'solar_export'
}

// ─── per-branch defaults ──────────────────────────────────────────────────────
const BRANCH_DEFAULTS: Record<string, Partial<ScenarioConfig>> = {
  'BR-A': { surgeKw: 80,  curtailKw: 60,  surgeStart: 32, surgeEnd: 40, eventType: 'solar_export' },
  'BR-B': { surgeKw: 350, curtailKw: 245, surgeStart: 36, surgeEnd: 44, eventType: 'thermal_overload' },
  'BR-C': { surgeKw: 55,  curtailKw: 40,  surgeStart: 34, surgeEnd: 40, eventType: 'voltage_violation' },
}

const EVENT_LABELS: Record<string, string> = {
  thermal_overload:   'Thermal overload',
  voltage_violation:  'Voltage violation',
  solar_export:       'Solar export spike',
}

const SPG_COLORS: Record<string, string> = { 'SPG-A': '#6366f1', 'SPG-B': '#f59e0b', 'SPG-C': '#10b981' }

// ─── slot → "HH:MM" ──────────────────────────────────────────────────────────
function slotLabel(slot: number) {
  const h = Math.floor(slot / 2)
  return `${String(h).padStart(2, '0')}:${slot % 2 === 0 ? '00' : '30'}`
}

// ─── core profile generator ───────────────────────────────────────────────────
function generateProfiles(cfg: ScenarioConfig) {
  const branch = LV_BRANCHES_DEMO.find((b) => b.id === cfg.branchId)!
  const r = branch.r_ohm
  const x = branch.x_ohm
  const V_NOM = 220

  const data = []
  for (let slot = 0; slot < 48; slot++) {
    const h = slot / 2
    const label = slotLabel(slot)
    const isSurge = slot >= cfg.surgeStart && slot < cfg.surgeEnd

    // Diurnal base load varies ±12% through day
    const diurnal = 1 + Math.sin((Math.PI * (h - 6)) / 12) * 0.12
    const baseLoad = branch.base_load_kw * diurnal

    // For solar export: surge is generation pushing reverse flow, show as negative load delta
    const surgeDelta = isSurge
      ? cfg.eventType === 'solar_export' ? -cfg.surgeKw : cfg.surgeKw
      : 0

    const baselineLoad = baseLoad + surgeDelta
    const flexLoad = isSurge
      ? baselineLoad + (cfg.eventType === 'solar_export' ? cfg.curtailKw : -cfg.curtailKw)
      : baseLoad

    // DistFlow: ΔV² = 2(R·P + X·Q) / V²
    const pBase = Math.max(baselineLoad, 0) * 1000
    const pFlex = Math.max(flexLoad, 0) * 1000
    const dvSqBase = 2 * (r * pBase + x * pBase * 0.3) / (V_NOM ** 2)
    const dvSqFlex = 2 * (r * pFlex + x * pFlex * 0.3) / (V_NOM ** 2)
    const vBase = V_NOM * Math.sqrt(Math.max(1 - dvSqBase, 0.01))
    const vFlex = V_NOM * Math.sqrt(Math.max(1 - dvSqFlex, 0.01))

    data.push({
      slot, label, isSurge,
      baselineLoad: parseFloat(baselineLoad.toFixed(1)),
      flexLoad: parseFloat(flexLoad.toFixed(1)),
      dtLimit: DEMO_DT.thermal_limit_kw,
      vBase: parseFloat(vBase.toFixed(1)),
      vFlex: parseFloat(vFlex.toFixed(1)),
    })
  }
  return data
}

// ─── derived KPIs ─────────────────────────────────────────────────────────────
function deriveKpis(profiles: ReturnType<typeof generateProfiles>, cfg: ScenarioConfig) {
  const surgeSlots = profiles.filter((p) => p.isSurge)
  const surgeDuration_h = (cfg.surgeEnd - cfg.surgeStart) * 0.5
  const peakBaseline = Math.max(...profiles.map((p) => p.baselineLoad))
  const peakFlex = Math.max(...profiles.map((p) => p.flexLoad))
  const peakReduction_kw = Math.abs(peakBaseline - peakFlex)
  const peakReduction_pct = peakBaseline !== 0 ? (peakReduction_kw / Math.abs(peakBaseline)) * 100 : 0
  const energyCurtailed_MWh = cfg.curtailKw * 0.001 * surgeDuration_h
  const settlementCost = energyCurtailed_MWh * cfg.pricePerMwh
  const minVBase = Math.min(...surgeSlots.map((p) => p.vBase))
  const minVFlex = Math.min(...surgeSlots.map((p) => p.vFlex))
  const vImprovement_pct = ((minVFlex - minVBase) / 220) * 100
  const dtOvershoot = peakFlex - DEMO_DT.thermal_limit_kw
  return { surgeDuration_h, peakBaseline, peakFlex, peakReduction_kw, peakReduction_pct, energyCurtailed_MWh, settlementCost, minVBase, minVFlex, vImprovement_pct, dtOvershoot }
}

// ─── tooltips ────────────────────────────────────────────────────────────────
function LoadTooltip({ active, payload, label }: any) {
  if (!active || !payload?.length) return null
  return (
    <div className="bg-gray-900 border border-gray-700 rounded-lg p-2.5 text-xs shadow-xl">
      <div className="font-semibold text-gray-300 mb-1.5">{label}</div>
      {payload.map((p: any) => (
        <div key={p.dataKey} style={{ color: p.color }} className="flex justify-between gap-4">
          <span>{p.name}</span><span className="font-mono font-bold">{p.value} kW</span>
        </div>
      ))}
    </div>
  )
}

function VoltageTooltip({ active, payload, label }: any) {
  if (!active || !payload?.length) return null
  return (
    <div className="bg-gray-900 border border-gray-700 rounded-lg p-2.5 text-xs shadow-xl">
      <div className="font-semibold text-gray-300 mb-1.5">{label}</div>
      {payload.filter((p: any) => ['vBase', 'vFlex'].includes(p.dataKey)).map((p: any) => (
        <div key={p.dataKey} style={{ color: p.color }} className="flex justify-between gap-4">
          <span>{p.name}</span><span className="font-mono font-bold">{p.value} V</span>
        </div>
      ))}
    </div>
  )
}

// ─── KPI card ─────────────────────────────────────────────────────────────────
function KpiCard({ label, value, unit, sub, icon: Icon, color }: {
  label: string; value: string; unit: string; sub?: string; icon: React.ElementType; color: string
}) {
  return (
    <div className="card flex items-start gap-3 py-3">
      <div className={clsx('w-9 h-9 rounded-lg flex items-center justify-center flex-shrink-0', color)}>
        <Icon className="w-4 h-4 text-white" />
      </div>
      <div>
        <div className="text-xs text-gray-400">{label}</div>
        <div className="text-lg font-bold text-white leading-tight">
          {value} <span className="text-sm font-normal text-gray-400">{unit}</span>
        </div>
        {sub && <div className="text-[10px] text-gray-500 mt-0.5">{sub}</div>}
      </div>
    </div>
  )
}

// ─── Page ────────────────────────────────────────────────────────────────────
export default function BaselineFlexPage() {
  const [cfg, setCfg] = useState<ScenarioConfig>({
    branchId: 'BR-B',
    pricePerMwh: 85,
    ...BRANCH_DEFAULTS['BR-B'],
  } as ScenarioConfig)

  const [view, setView] = useState<'load' | 'voltage'>('load')
  const [showSettlement, setShowSettlement] = useState(false)

  // Recompute everything when cfg changes
  const profiles = useMemo(() => generateProfiles(cfg), [cfg])
  const kpis = useMemo(() => deriveKpis(profiles, cfg), [profiles, cfg])

  const branch = LV_BRANCHES_DEMO.find((b) => b.id === cfg.branchId)!
  const spg = SPG_GROUPS.find((s) => s.branch_id === cfg.branchId)!

  // SPG curtailment bar data — all branches, highlight selected
  const spgBarData = SPG_GROUPS.map((s) => ({
    id: s.id,
    name: s.name,
    curtail_kw: s.branch_id === cfg.branchId ? cfg.curtailKw : 0,
    color: SPG_COLORS[s.id],
  }))

  // Settlement slots
  const settlementSlots = Array.from({ length: cfg.surgeEnd - cfg.surgeStart }, (_, i) => {
    const slot = cfg.surgeStart + i
    const energy_MWh = cfg.curtailKw * 0.001 * 0.5
    const cost = energy_MWh * cfg.pricePerMwh
    return { pos: i + 1, time: slotLabel(slot), qty_kW: cfg.curtailKw, energy_MWh: parseFloat(energy_MWh.toFixed(4)), cost_eur: parseFloat(cost.toFixed(2)) }
  })

  function handleBranchChange(branchId: string) {
    const defaults = BRANCH_DEFAULTS[branchId]
    setCfg((prev) => ({ ...prev, branchId, ...defaults }))
  }

  const surgeStartLabel = slotLabel(cfg.surgeStart)
  const surgeEndLabel = slotLabel(cfg.surgeEnd - 1)
  const yMax = Math.ceil(Math.max(...profiles.map((p) => p.baselineLoad)) / 50) * 50 + 50

  return (
    <div className="space-y-5">
      {/* Header */}
      <div className="flex items-start justify-between">
        <div>
          <div className="flex items-center gap-3">
            <h1 className="text-xl font-bold text-white">Baseline vs Flex</h1>
            <span className={clsx('px-2 py-0.5 rounded text-xs font-bold border',
              cfg.eventType === 'thermal_overload' ? 'bg-red-900/60 text-red-300 border-red-700/40' :
              cfg.eventType === 'voltage_violation' ? 'bg-amber-900/60 text-amber-300 border-amber-700/40' :
              'bg-blue-900/60 text-blue-300 border-blue-700/40'
            )}>
              {branch.id} · {EVENT_LABELS[cfg.eventType]}
            </span>
          </div>
          <p className="text-sm text-gray-400 mt-0.5">
            DT-AUZ-001 · IEC 62746-4 · FlexOffer A26 · {spg.id} ({spg.name}) · {surgeStartLabel}–{slotLabel(cfg.surgeEnd)}
          </p>
        </div>
      </div>

      {/* Scenario config panel */}
      <div className="card">
        <div className="flex items-center gap-2 mb-4">
          <Settings2 className="w-4 h-4 text-gray-400" />
          <h2 className="text-sm font-semibold text-white">Scenario Configuration</h2>
        </div>
        <div className="grid grid-cols-6 gap-4">
          {/* Branch selector */}
          <div className="col-span-2">
            <label className="block text-xs text-gray-400 mb-1.5">Branch</label>
            <div className="flex gap-2">
              {LV_BRANCHES_DEMO.map((br) => (
                <button key={br.id}
                  onClick={() => handleBranchChange(br.id)}
                  className={clsx('flex-1 py-2 rounded-lg text-xs font-semibold border transition-colors',
                    cfg.branchId === br.id
                      ? 'bg-indigo-600 text-white border-indigo-500'
                      : 'bg-gray-800 text-gray-400 border-gray-700 hover:text-gray-200')}
                >
                  {br.id}
                  <div className="text-[10px] font-normal opacity-70 mt-0.5">{br.households} HH · {br.base_load_kw} kW</div>
                </button>
              ))}
            </div>
          </div>

          {/* Event type */}
          <div>
            <label className="block text-xs text-gray-400 mb-1.5">Event type</label>
            <select value={cfg.eventType}
              onChange={(e) => setCfg((p) => ({ ...p, eventType: e.target.value as ScenarioConfig['eventType'] }))}
              className="w-full bg-gray-700 border border-gray-600 text-gray-100 px-2 py-2 rounded-lg text-xs focus:outline-none focus:ring-1 focus:ring-indigo-500"
            >
              <option value="thermal_overload">Thermal overload</option>
              <option value="voltage_violation">Voltage violation</option>
              <option value="solar_export">Solar export spike</option>
            </select>
          </div>

          {/* Surge kW */}
          <div>
            <label className="block text-xs text-gray-400 mb-1.5">
              {cfg.eventType === 'solar_export' ? 'Solar surge (kW)' : 'Surge load (kW)'}
            </label>
            <input type="number" min={10} max={500} step={5}
              value={cfg.surgeKw}
              onChange={(e) => setCfg((p) => ({ ...p, surgeKw: Math.max(10, +e.target.value) }))}
              className="w-full bg-gray-700 border border-gray-600 text-gray-100 px-2 py-2 rounded-lg text-xs focus:outline-none focus:ring-1 focus:ring-indigo-500"
            />
          </div>

          {/* Curtailment kW */}
          <div>
            <label className="block text-xs text-gray-400 mb-1.5">Flex curtailment (kW)</label>
            <input type="number" min={1} max={cfg.surgeKw} step={5}
              value={cfg.curtailKw}
              onChange={(e) => setCfg((p) => ({ ...p, curtailKw: Math.min(+e.target.value, p.surgeKw) }))}
              className="w-full bg-gray-700 border border-gray-600 text-gray-100 px-2 py-2 rounded-lg text-xs focus:outline-none focus:ring-1 focus:ring-indigo-500"
            />
          </div>

          {/* Price + window */}
          <div className="space-y-2">
            <div>
              <label className="block text-xs text-gray-400 mb-1.5">Price (€/MWh)</label>
              <input type="number" min={1} max={500} step={1}
                value={cfg.pricePerMwh}
                onChange={(e) => setCfg((p) => ({ ...p, pricePerMwh: Math.max(1, +e.target.value) }))}
                className="w-full bg-gray-700 border border-gray-600 text-gray-100 px-2 py-2 rounded-lg text-xs focus:outline-none focus:ring-1 focus:ring-indigo-500"
              />
            </div>
            <div className="flex gap-1 items-center">
              <div className="flex-1">
                <label className="block text-[10px] text-gray-500 mb-1">Start</label>
                <select value={cfg.surgeStart}
                  onChange={(e) => setCfg((p) => ({ ...p, surgeStart: +e.target.value, surgeEnd: Math.max(+e.target.value + 2, p.surgeEnd) }))}
                  className="w-full bg-gray-700 border border-gray-600 text-gray-100 px-1 py-1.5 rounded text-[10px] focus:outline-none"
                >
                  {Array.from({ length: 46 }, (_, i) => (
                    <option key={i} value={i}>{slotLabel(i)}</option>
                  ))}
                </select>
              </div>
              <span className="text-gray-600 text-xs mt-4">–</span>
              <div className="flex-1">
                <label className="block text-[10px] text-gray-500 mb-1">End</label>
                <select value={cfg.surgeEnd}
                  onChange={(e) => setCfg((p) => ({ ...p, surgeEnd: +e.target.value }))}
                  className="w-full bg-gray-700 border border-gray-600 text-gray-100 px-1 py-1.5 rounded text-[10px] focus:outline-none"
                >
                  {Array.from({ length: 48 - cfg.surgeStart - 1 }, (_, i) => cfg.surgeStart + i + 2).map((s) => (
                    <option key={s} value={s}>{slotLabel(s)}</option>
                  ))}
                </select>
              </div>
            </div>
          </div>
        </div>

        {/* Branch info strip */}
        <div className="mt-3 pt-3 border-t border-gray-700 flex items-center gap-6 text-xs text-gray-400">
          <span className="font-medium text-gray-200">{branch.id} — Phase {branch.phase}</span>
          <span>{branch.households} households · {branch.length_m} m · {branch.base_load_kw} kW base</span>
          <span>R = {branch.r_ohm.toFixed(3)} Ω · X = {branch.x_ohm.toFixed(3)} Ω · ampacity {branch.ampacity_a} A</span>
          <span className="ml-auto">SPG: <span className="text-indigo-300 font-medium">{spg.id}</span> · {spg.name}</span>
        </div>
      </div>

      {/* KPI row */}
      <div className="grid grid-cols-4 gap-4">
        <KpiCard
          label="Peak Load Reduction"
          value={`−${kpis.peakReduction_kw.toFixed(0)}`} unit="kW"
          sub={`${kpis.peakReduction_pct.toFixed(0)}% · ${kpis.peakBaseline.toFixed(0)} → ${kpis.peakFlex.toFixed(0)} kW`}
          icon={TrendingDown} color="bg-green-600"
        />
        <KpiCard
          label="Thermal Headroom Gained"
          value={`+${kpis.peakReduction_kw.toFixed(0)}`} unit="kW"
          sub={`DT limit ${DEMO_DT.thermal_limit_kw} kW · post-flex peak ${kpis.peakFlex.toFixed(0)} kW`}
          icon={Shield} color="bg-indigo-600"
        />
        <KpiCard
          label="Voltage Improvement"
          value={`+${kpis.vImprovement_pct.toFixed(1)}`} unit="% pu"
          sub={`Min V: ${kpis.minVBase.toFixed(0)} V → ${kpis.minVFlex.toFixed(0)} V (nom 220 V)`}
          icon={Zap} color="bg-blue-600"
        />
        <KpiCard
          label="Settlement Cost"
          value={`€${kpis.settlementCost.toFixed(2)}`} unit=""
          sub={`${kpis.energyCurtailed_MWh.toFixed(2)} MWh × €${cfg.pricePerMwh}/MWh · ${spg.id}`}
          icon={DollarSign} color="bg-amber-600"
        />
      </div>

      {/* Comparison chart */}
      <div className="card">
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-sm font-semibold text-white">24-Hour Comparison — {branch.id} (Phase {branch.phase})</h2>
          <div className="flex gap-1 bg-gray-800 rounded-lg p-1">
            <button onClick={() => setView('load')}
              className={clsx('px-3 py-1.5 rounded text-xs font-medium transition-colors',
                view === 'load' ? 'bg-indigo-600 text-white' : 'text-gray-400 hover:text-gray-200')}>
              Load Profile
            </button>
            <button onClick={() => setView('voltage')}
              className={clsx('px-3 py-1.5 rounded text-xs font-medium transition-colors',
                view === 'voltage' ? 'bg-indigo-600 text-white' : 'text-gray-400 hover:text-gray-200')}>
              Voltage Profile
            </button>
          </div>
        </div>

        {view === 'load' && (
          <>
            <div className="flex items-center gap-4 mb-3 text-xs text-gray-400">
              <div className="flex items-center gap-1.5"><div className="w-3 h-0.5 bg-red-400" /> Baseline (no flex)</div>
              <div className="flex items-center gap-1.5"><div className="w-3 h-0.5 bg-green-400" /> Post-Flex (A26)</div>
              <div className="flex items-center gap-1.5"><div className="w-3 h-0.5 bg-amber-400" style={{ borderTop: '2px dashed' }} /> DT limit ({DEMO_DT.thermal_limit_kw} kW)</div>
              <div className="flex items-center gap-1.5"><div className="w-3 h-3 rounded-sm bg-red-900/40" /> {EVENT_LABELS[cfg.eventType]} window</div>
            </div>
            <div className="h-64">
              <ResponsiveContainer width="100%" height="100%">
                <ComposedChart data={profiles} margin={{ top: 5, right: 10, left: 0, bottom: 5 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#374151" />
                  <XAxis dataKey="label" tick={{ fill: '#9ca3af', fontSize: 9 }} interval={5} />
                  <YAxis tick={{ fill: '#9ca3af', fontSize: 10 }} unit=" kW" domain={[0, yMax]} />
                  <Tooltip content={<LoadTooltip />} />
                  <ReferenceArea x1={surgeStartLabel} x2={surgeEndLabel}
                    fill="#ef44441a" label={{ value: EVENT_LABELS[cfg.eventType], position: 'insideTop', fill: '#f87171', fontSize: 9 }} />
                  <ReferenceLine y={DEMO_DT.thermal_limit_kw} stroke="#f59e0b" strokeDasharray="4 3" strokeWidth={1.5}
                    label={{ value: `DT limit ${DEMO_DT.thermal_limit_kw} kW`, position: 'right', fill: '#f59e0b', fontSize: 9 }} />
                  <Area type="monotone" dataKey="baselineLoad" name="Baseline" fill="#ef444420" stroke="#ef4444" strokeWidth={2} />
                  <Area type="monotone" dataKey="flexLoad" name="Post-Flex" fill="#10b98120" stroke="#10b981" strokeWidth={2} />
                </ComposedChart>
              </ResponsiveContainer>
            </div>
          </>
        )}

        {view === 'voltage' && (
          <>
            <div className="flex items-center gap-4 mb-3 text-xs text-gray-400">
              <div className="flex items-center gap-1.5"><div className="w-3 h-0.5 bg-red-400" /> Baseline voltage</div>
              <div className="flex items-center gap-1.5"><div className="w-3 h-0.5 bg-green-400" /> Post-Flex voltage</div>
              <div className="flex items-center gap-1.5"><div className="w-3 h-0.5 bg-amber-400" /> 198 V warning (−10%)</div>
            </div>
            <div className="h-64">
              <ResponsiveContainer width="100%" height="100%">
                <ComposedChart data={profiles} margin={{ top: 5, right: 10, left: 0, bottom: 5 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#374151" />
                  <XAxis dataKey="label" tick={{ fill: '#9ca3af', fontSize: 9 }} interval={5} />
                  <YAxis tick={{ fill: '#9ca3af', fontSize: 10 }} unit=" V" domain={[150, 240]} />
                  <Tooltip content={<VoltageTooltip />} />
                  <ReferenceArea x1={surgeStartLabel} x2={surgeEndLabel} fill="#ef44441a" />
                  <ReferenceLine y={198} stroke="#f59e0b" strokeDasharray="3 3" strokeWidth={1.5}
                    label={{ value: '198 V (−10%)', position: 'right', fill: '#f59e0b', fontSize: 9 }} />
                  <ReferenceLine y={220} stroke="#6366f144" strokeDasharray="2 2" strokeWidth={1}
                    label={{ value: '220 V nom', position: 'right', fill: '#6366f1', fontSize: 9 }} />
                  <Line type="monotone" dataKey="vBase" name="Baseline V" stroke="#ef4444" strokeWidth={2} dot={false} />
                  <Line type="monotone" dataKey="vFlex" name="Post-Flex V" stroke="#10b981" strokeWidth={2} dot={false} />
                </ComposedChart>
              </ResponsiveContainer>
            </div>
          </>
        )}
      </div>

      {/* Bottom row */}
      <div className="grid grid-cols-2 gap-4">
        {/* SPG curtailment */}
        <div className="card">
          <h2 className="text-sm font-semibold text-white mb-4">Curtailment by SPG</h2>
          <div className="h-44">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={spgBarData} margin={{ top: 5, right: 10, left: 0, bottom: 5 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#374151" />
                <XAxis dataKey="id" tick={{ fill: '#9ca3af', fontSize: 11 }} />
                <YAxis tick={{ fill: '#9ca3af', fontSize: 10 }} unit=" kW"
                  domain={[0, Math.max(cfg.curtailKw + 30, 50)]} />
                <Tooltip
                  contentStyle={{ background: '#1f2937', border: '1px solid #374151', borderRadius: 8, fontSize: 11 }}
                  formatter={(v: any) => [`${v} kW`, 'Curtailment']}
                />
                <Bar dataKey="curtail_kw" radius={[4, 4, 0, 0]}>
                  {spgBarData.map((s) => (
                    <Cell key={s.id} fill={s.curtail_kw > 0 ? s.color : '#374151'} />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </div>
          <div className="mt-3 space-y-1.5">
            {spgBarData.map((s) => (
              <div key={s.id} className={clsx('flex items-center justify-between text-xs py-0.5 px-1.5 rounded',
                s.curtail_kw > 0 ? 'bg-gray-800/60' : '')}>
                <div className="flex items-center gap-2">
                  <div className="w-2 h-2 rounded-full" style={{ background: s.color }} />
                  <span className={s.curtail_kw > 0 ? 'text-gray-200' : 'text-gray-500'}>{s.name}</span>
                  {s.curtail_kw > 0 && <span className="text-[10px] text-indigo-400 font-medium">← active</span>}
                </div>
                <span className={clsx('font-mono font-medium', s.curtail_kw > 0 ? 'text-amber-300' : 'text-gray-600')}>
                  {s.curtail_kw > 0 ? `−${s.curtail_kw} kW` : '0 kW'}
                </span>
              </div>
            ))}
            <div className="pt-1 border-t border-gray-700 flex items-center justify-between text-xs">
              <span className="text-gray-400 font-medium">Total curtailment</span>
              <span className="font-mono font-bold text-amber-300">−{cfg.curtailKw} kW</span>
            </div>
          </div>
        </div>

        {/* Settlement */}
        <div className="card">
          <div className="flex items-center justify-between mb-3">
            <h2 className="text-sm font-semibold text-white">Settlement Report — {spg.id}</h2>
            <div className="flex items-center gap-2">
              <span className="text-[10px] text-gray-500 font-mono">IEC 62746-4 A16 basis</span>
              <button onClick={() => setShowSettlement(!showSettlement)}
                className="text-xs text-indigo-400 hover:text-indigo-300 transition-colors">
                {showSettlement ? 'Hide slots' : 'Show slots'}
              </button>
            </div>
          </div>

          <div className="grid grid-cols-3 gap-2 mb-3">
            <div className="bg-gray-800 rounded-lg p-2 text-center">
              <div className="text-[10px] text-gray-400">Duration</div>
              <div className="text-sm font-bold text-white">{kpis.surgeDuration_h}h</div>
              <div className="text-[10px] text-gray-500">{surgeStartLabel}–{slotLabel(cfg.surgeEnd)}</div>
            </div>
            <div className="bg-gray-800 rounded-lg p-2 text-center">
              <div className="text-[10px] text-gray-400">Energy Curtailed</div>
              <div className="text-sm font-bold text-amber-300">{kpis.energyCurtailed_MWh.toFixed(2)} MWh</div>
              <div className="text-[10px] text-gray-500">@{cfg.curtailKw} kW</div>
            </div>
            <div className="bg-gray-800 rounded-lg p-2 text-center">
              <div className="text-[10px] text-gray-400">Settlement</div>
              <div className="text-sm font-bold text-green-300">€{kpis.settlementCost.toFixed(2)}</div>
              <div className="text-[10px] text-gray-500">€{cfg.pricePerMwh}/MWh</div>
            </div>
          </div>

          <div className="flex flex-wrap gap-2 mb-3">
            <div className="flex items-center gap-1 px-2 py-1 rounded bg-green-900/30 border border-green-800/40 text-green-400 text-[10px]">
              <CheckCircle2 className="w-3 h-3" /> {EVENT_LABELS[cfg.eventType]} resolved
            </div>
            <div className="flex items-center gap-1 px-2 py-1 rounded bg-blue-900/30 border border-blue-800/40 text-blue-400 text-[10px]">
              <CheckCircle2 className="w-3 h-3" /> Voltage restored &gt;{kpis.minVFlex.toFixed(0)} V
            </div>
            {kpis.dtOvershoot > 0 && (
              <div className="flex items-center gap-1 px-2 py-1 rounded bg-amber-900/30 border border-amber-800/40 text-amber-400 text-[10px]">
                <AlertTriangle className="w-3 h-3" /> Peak residual {kpis.peakFlex.toFixed(0)} kW (+{kpis.dtOvershoot.toFixed(0)} kW over DT)
              </div>
            )}
          </div>

          {showSettlement && (
            <div className="overflow-auto max-h-52">
              <table className="w-full text-xs">
                <thead className="sticky top-0 bg-gray-800">
                  <tr>
                    <th className="text-left text-gray-400 font-medium px-2 py-1.5">Pos</th>
                    <th className="text-left text-gray-400 font-medium px-2 py-1.5">Time</th>
                    <th className="text-right text-gray-400 font-medium px-2 py-1.5">Qty (kW)</th>
                    <th className="text-right text-gray-400 font-medium px-2 py-1.5">Energy (MWh)</th>
                    <th className="text-right text-gray-400 font-medium px-2 py-1.5">Cost (€)</th>
                  </tr>
                </thead>
                <tbody>
                  {settlementSlots.map((s) => (
                    <tr key={s.pos} className="border-t border-gray-700/50 hover:bg-gray-800/40">
                      <td className="px-2 py-1 text-gray-400 font-mono">{s.pos}</td>
                      <td className="px-2 py-1 text-gray-300 font-mono">{s.time}</td>
                      <td className="px-2 py-1 text-right text-amber-300 font-mono">{s.qty_kW}</td>
                      <td className="px-2 py-1 text-right text-gray-300 font-mono">{s.energy_MWh}</td>
                      <td className="px-2 py-1 text-right text-green-300 font-mono">{s.cost_eur}</td>
                    </tr>
                  ))}
                  <tr className="border-t border-gray-600 bg-gray-800/60">
                    <td colSpan={3} className="px-2 py-1.5 text-gray-400 text-[10px] font-medium">Total</td>
                    <td className="px-2 py-1.5 text-right text-gray-200 font-mono font-bold">{kpis.energyCurtailed_MWh.toFixed(4)}</td>
                    <td className="px-2 py-1.5 text-right text-green-300 font-mono font-bold">€{kpis.settlementCost.toFixed(2)}</td>
                  </tr>
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
