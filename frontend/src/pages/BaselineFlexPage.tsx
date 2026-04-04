import React, { useState } from 'react'
import {
  ComposedChart, Area, Line, XAxis, YAxis, CartesianGrid, Tooltip,
  Legend, ResponsiveContainer, ReferenceLine, ReferenceArea, BarChart, Bar, Cell,
} from 'recharts'
import { TrendingDown, Zap, Shield, DollarSign, AlertTriangle, CheckCircle2 } from 'lucide-react'
import clsx from 'clsx'
import { LV_BRANCHES_DEMO, SPG_GROUPS, DEMO_DT } from '../data/auzanceNetwork'

// ─── constants ────────────────────────────────────────────────────────────────
const DT_LIMIT_KW = DEMO_DT.thermal_limit_kw    // 225 kW
const V_NOMINAL = 220                            // V
const EV_SURGE_KW = 350                          // kW added by 3 EV chargers on Branch B
const FLEX_CURTAILMENT_KW = 245                  // kW curtailed by SPG-B (from FlexOffer A26)
const FLEX_PRICE_MWH = 85                        // €/MWh
const EV_SURGE_START = 36                        // slot index (18:00)
const EV_SURGE_END = 44                          // slot index (22:00)

// ─── generate 24-hour profile data ───────────────────────────────────────────
function generateProfiles() {
  const data = []
  for (let slot = 0; slot < 48; slot++) {
    const h = slot / 2
    const label = `${String(Math.floor(h)).padStart(2, '0')}:${slot % 2 === 0 ? '00' : '30'}`
    const isEV = slot >= EV_SURGE_START && slot < EV_SURGE_END

    // Branch B base load varies through day
    const baseB = 129 + Math.sin((Math.PI * (h - 6)) / 12) * 18 + (Math.random() - 0.5) * 4

    // Baseline (no flex): full EV surge
    const baselineLoad = isEV ? baseB + EV_SURGE_KW : baseB

    // Post-flex: curtailment applied
    const flexLoad = isEV ? baseB + EV_SURGE_KW - FLEX_CURTAILMENT_KW : baseB

    // DistFlow voltage deviation: ΔV ≈ R·P / V²
    const R_B = 0.715 * 0.25  // 0.179 Ω
    const X_B = 0.715 * 0.08
    const P_base = baselineLoad * 1000          // W
    const P_flex = flexLoad * 1000
    const Q = P_base * 0.3                     // rough reactive component

    const dvSqBase = 2 * (R_B * P_base + X_B * Q) / (V_NOMINAL ** 2)
    const vBase = V_NOMINAL * Math.sqrt(Math.max(1.0 - dvSqBase, 0.01))

    const dvSqFlex = 2 * (R_B * P_flex + X_B * (P_flex * 0.3)) / (V_NOMINAL ** 2)
    const vFlex = V_NOMINAL * Math.sqrt(Math.max(1.0 - dvSqFlex, 0.01))

    data.push({
      slot,
      label,
      isEV,
      baselineLoad: parseFloat(baselineLoad.toFixed(1)),
      flexLoad: parseFloat(Math.max(flexLoad, 0).toFixed(1)),
      dtLimit: DT_LIMIT_KW,
      vBase: parseFloat(vBase.toFixed(1)),
      vFlex: parseFloat(vFlex.toFixed(1)),
      vNominal: V_NOMINAL,
      vWarnLow: 198,
      vWarnHigh: 253,
    })
  }
  return data
}

const PROFILES = generateProfiles()

// ─── KPI calculations ────────────────────────────────────────────────────────
const surgeDuration_h = (EV_SURGE_END - EV_SURGE_START) * 0.5   // 4h
const peakBaseline = Math.max(...PROFILES.map((p) => p.baselineLoad))  // ~479 kW
const peakFlex = Math.max(...PROFILES.map((p) => p.flexLoad))         // ~234 kW
const peakReduction_kw = peakBaseline - peakFlex
const peakReduction_pct = (peakReduction_kw / peakBaseline) * 100

const energyBaseline_MWh = PROFILES.reduce((s, p) => s + p.baselineLoad * 0.5 / 1000, 0)
const energyFlex_MWh = PROFILES.reduce((s, p) => s + p.flexLoad * 0.5 / 1000, 0)
const energyCurtailed_MWh = FLEX_CURTAILMENT_KW * 0.001 * surgeDuration_h  // 0.98 MWh

const settlementCost = energyCurtailed_MWh * FLEX_PRICE_MWH   // ~€83.30
const thermalHeadroomGained_kw = peakReduction_kw             // kW freed on DT

// voltage stats during surge
const surgeSlotsBase = PROFILES.filter((p) => p.isEV)
const minVBase = Math.min(...surgeSlotsBase.map((p) => p.vBase))
const minVFlex = Math.min(...surgeSlotsBase.map((p) => p.vFlex))
const vImprovement_pct = ((minVFlex - minVBase) / V_NOMINAL) * 100

// SPG curtailment breakdown
const SPG_CURTAILMENT = [
  { id: 'SPG-A', name: 'Vendée Flex — Phase A', curtail_kw: 0,   color: '#6366f1' },
  { id: 'SPG-B', name: 'Vendée Flex — Phase B', curtail_kw: 245, color: '#f59e0b' },
  { id: 'SPG-C', name: 'Vendée Flex — Phase C', curtail_kw: 0,   color: '#10b981' },
]

// Settlement slots
const SETTLEMENT_SLOTS = Array.from({ length: EV_SURGE_END - EV_SURGE_START }, (_, i) => {
  const slot = EV_SURGE_START + i
  const label = PROFILES[slot].label
  const qty_MAW = FLEX_CURTAILMENT_KW / 1000
  const energy_MWh = qty_MAW * 0.5
  const cost = energy_MWh * FLEX_PRICE_MWH
  return { slot: i + 1, time: label, qty_kW: FLEX_CURTAILMENT_KW, energy_MWh: parseFloat(energy_MWh.toFixed(4)), cost_eur: parseFloat(cost.toFixed(2)) }
})

// ─── Tooltip helpers ──────────────────────────────────────────────────────────
function LoadTooltip({ active, payload, label }: any) {
  if (!active || !payload?.length) return null
  return (
    <div className="bg-gray-900 border border-gray-700 rounded-lg p-2.5 text-xs shadow-xl">
      <div className="font-semibold text-gray-300 mb-1.5">{label}</div>
      {payload.map((p: any) => (
        <div key={p.dataKey} style={{ color: p.color }} className="flex justify-between gap-4">
          <span>{p.name}</span>
          <span className="font-mono font-bold">{p.value} kW</span>
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
          <span>{p.name}</span>
          <span className="font-mono font-bold">{p.value} V</span>
        </div>
      ))}
    </div>
  )
}

// ─── KPI Card ─────────────────────────────────────────────────────────────────
function KpiCard({ label, value, unit, sub, icon: Icon, color }: {
  label: string; value: string; unit: string; sub?: string;
  icon: React.ElementType; color: string
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
  const [view, setView] = useState<'load' | 'voltage'>('load')
  const [showSettlement, setShowSettlement] = useState(false)

  return (
    <div className="space-y-5">
      {/* Header */}
      <div>
        <div className="flex items-center gap-3">
          <h1 className="text-xl font-bold text-white">Baseline vs Flex</h1>
          <span className="px-2 py-0.5 rounded text-xs font-bold bg-amber-900/60 text-amber-300 border border-amber-700/40">
            Branch B · EV Scenario
          </span>
        </div>
        <p className="text-sm text-gray-400 mt-0.5">
          DT-AUZ-001 · IEC 62746-4 · FlexOffer A26 activation · 18:00–22:00 EV surge window
        </p>
      </div>

      {/* KPI row */}
      <div className="grid grid-cols-4 gap-4">
        <KpiCard
          label="Peak Load Reduction"
          value={`−${peakReduction_kw.toFixed(0)}`}
          unit="kW"
          sub={`${peakReduction_pct.toFixed(0)}% reduction (${peakBaseline.toFixed(0)} → ${peakFlex.toFixed(0)} kW)`}
          icon={TrendingDown}
          color="bg-green-600"
        />
        <KpiCard
          label="Thermal Headroom Gained"
          value={`+${thermalHeadroomGained_kw.toFixed(0)}`}
          unit="kW"
          sub={`DT limit: ${DT_LIMIT_KW} kW · post-flex: ${peakFlex.toFixed(0)} kW`}
          icon={Shield}
          color="bg-indigo-600"
        />
        <KpiCard
          label="Voltage Improvement"
          value={`+${vImprovement_pct.toFixed(1)}`}
          unit="% pu"
          sub={`Min V: ${minVBase.toFixed(0)} V → ${minVFlex.toFixed(0)} V (nom ${V_NOMINAL} V)`}
          icon={Zap}
          color="bg-blue-600"
        />
        <KpiCard
          label="Settlement Cost"
          value={`€${settlementCost.toFixed(2)}`}
          unit=""
          sub={`${energyCurtailed_MWh.toFixed(2)} MWh × €${FLEX_PRICE_MWH}/MWh · SPG-B`}
          icon={DollarSign}
          color="bg-amber-600"
        />
      </div>

      {/* Comparison charts */}
      <div className="card">
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-sm font-semibold text-white">24-Hour Comparison — Branch B</h2>
          <div className="flex gap-1 bg-gray-800 rounded-lg p-1">
            <button
              onClick={() => setView('load')}
              className={clsx('px-3 py-1.5 rounded text-xs font-medium transition-colors',
                view === 'load' ? 'bg-indigo-600 text-white' : 'text-gray-400 hover:text-gray-200')}
            >
              Load Profile
            </button>
            <button
              onClick={() => setView('voltage')}
              className={clsx('px-3 py-1.5 rounded text-xs font-medium transition-colors',
                view === 'voltage' ? 'bg-indigo-600 text-white' : 'text-gray-400 hover:text-gray-200')}
            >
              Voltage Profile
            </button>
          </div>
        </div>

        {view === 'load' && (
          <>
            <div className="flex items-center gap-4 mb-3 text-xs text-gray-400">
              <div className="flex items-center gap-1.5"><div className="w-3 h-0.5 bg-red-400" /> Baseline (no flex)</div>
              <div className="flex items-center gap-1.5"><div className="w-3 h-0.5 bg-green-400" /> Post-Flex (A26 activated)</div>
              <div className="flex items-center gap-1.5"><div className="w-3 h-0.5 bg-amber-400 border-dashed" /> DT thermal limit (225 kW)</div>
              <div className="flex items-center gap-1.5">
                <div className="w-3 h-3 rounded-sm bg-red-900/50" /> EV surge window
              </div>
            </div>
            <div className="h-64">
              <ResponsiveContainer width="100%" height="100%">
                <ComposedChart data={PROFILES} margin={{ top: 5, right: 10, left: 0, bottom: 5 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#374151" />
                  <XAxis dataKey="label" tick={{ fill: '#9ca3af', fontSize: 9 }} interval={5} />
                  <YAxis tick={{ fill: '#9ca3af', fontSize: 10 }} unit=" kW" domain={[0, 520]} />
                  <Tooltip content={<LoadTooltip />} />
                  <ReferenceArea x1={PROFILES[EV_SURGE_START].label} x2={PROFILES[EV_SURGE_END - 1].label}
                    fill="#ef44441a" label={{ value: 'EV Surge', position: 'insideTop', fill: '#f87171', fontSize: 9 }} />
                  <ReferenceLine y={DT_LIMIT_KW} stroke="#f59e0b" strokeDasharray="4 3" strokeWidth={1.5}
                    label={{ value: 'DT limit 225 kW', position: 'right', fill: '#f59e0b', fontSize: 9 }} />
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
              <div className="flex items-center gap-1.5"><div className="w-3 h-0.5 bg-red-400" /> Baseline voltage (Branch B end)</div>
              <div className="flex items-center gap-1.5"><div className="w-3 h-0.5 bg-green-400" /> Post-Flex voltage</div>
              <div className="flex items-center gap-1.5"><div className="w-3 h-0.5 bg-amber-400 border-dashed" /> Warning bounds ±15%</div>
            </div>
            <div className="h-64">
              <ResponsiveContainer width="100%" height="100%">
                <ComposedChart data={PROFILES} margin={{ top: 5, right: 10, left: 0, bottom: 5 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#374151" />
                  <XAxis dataKey="label" tick={{ fill: '#9ca3af', fontSize: 9 }} interval={5} />
                  <YAxis tick={{ fill: '#9ca3af', fontSize: 10 }} unit=" V" domain={[150, 240]} />
                  <Tooltip content={<VoltageTooltip />} />
                  <ReferenceArea x1={PROFILES[EV_SURGE_START].label} x2={PROFILES[EV_SURGE_END - 1].label}
                    fill="#ef44441a" />
                  <ReferenceLine y={198} stroke="#f59e0b" strokeDasharray="3 3" strokeWidth={1.5}
                    label={{ value: '198 V (−10%)', position: 'right', fill: '#f59e0b', fontSize: 9 }} />
                  <ReferenceLine y={V_NOMINAL} stroke="#6366f155" strokeDasharray="2 2" strokeWidth={1}
                    label={{ value: '220 V nom', position: 'right', fill: '#6366f1', fontSize: 9 }} />
                  <Line type="monotone" dataKey="vBase" name="Baseline V" stroke="#ef4444" strokeWidth={2} dot={false} />
                  <Line type="monotone" dataKey="vFlex" name="Post-Flex V" stroke="#10b981" strokeWidth={2} dot={false} />
                </ComposedChart>
              </ResponsiveContainer>
            </div>
          </>
        )}
      </div>

      {/* Bottom row: SPG curtailment + settlement */}
      <div className="grid grid-cols-2 gap-4">
        {/* SPG Curtailment */}
        <div className="card">
          <h2 className="text-sm font-semibold text-white mb-4">Curtailment by SPG</h2>
          <div className="h-44">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={SPG_CURTAILMENT} margin={{ top: 5, right: 10, left: 0, bottom: 5 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#374151" />
                <XAxis dataKey="id" tick={{ fill: '#9ca3af', fontSize: 11 }} />
                <YAxis tick={{ fill: '#9ca3af', fontSize: 10 }} unit=" kW" domain={[0, 280]} />
                <Tooltip
                  contentStyle={{ background: '#1f2937', border: '1px solid #374151', borderRadius: 8, fontSize: 11 }}
                  formatter={(v: any) => [`${v} kW`, 'Curtailment']}
                />
                <Bar dataKey="curtail_kw" radius={[4, 4, 0, 0]}>
                  {SPG_CURTAILMENT.map((s) => (
                    <Cell key={s.id} fill={s.curtail_kw > 0 ? '#f59e0b' : '#374151'} />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </div>
          <div className="mt-3 space-y-1.5">
            {SPG_CURTAILMENT.map((s) => (
              <div key={s.id} className="flex items-center justify-between text-xs">
                <div className="flex items-center gap-2">
                  <div className="w-2 h-2 rounded-full" style={{ background: s.color }} />
                  <span className="text-gray-300">{s.name}</span>
                </div>
                <span className={clsx('font-mono font-medium', s.curtail_kw > 0 ? 'text-amber-300' : 'text-gray-500')}>
                  {s.curtail_kw > 0 ? `−${s.curtail_kw} kW` : '0 kW'}
                </span>
              </div>
            ))}
            <div className="pt-1 border-t border-gray-700 flex items-center justify-between text-xs">
              <span className="text-gray-400 font-medium">Total curtailment</span>
              <span className="font-mono font-bold text-amber-300">−{FLEX_CURTAILMENT_KW} kW</span>
            </div>
          </div>
        </div>

        {/* Simulated Settlement */}
        <div className="card">
          <div className="flex items-center justify-between mb-3">
            <h2 className="text-sm font-semibold text-white">Settlement Report — SPG-B</h2>
            <div className="flex items-center gap-2">
              <span className="text-[10px] text-gray-500 font-mono">IEC 62746-4 A16 basis</span>
              <button
                onClick={() => setShowSettlement(!showSettlement)}
                className="text-xs text-indigo-400 hover:text-indigo-300 transition-colors"
              >
                {showSettlement ? 'Hide slots' : 'Show slots'}
              </button>
            </div>
          </div>

          {/* Summary metrics */}
          <div className="grid grid-cols-3 gap-2 mb-3">
            <div className="bg-gray-800 rounded-lg p-2 text-center">
              <div className="text-[10px] text-gray-400">Duration</div>
              <div className="text-sm font-bold text-white">{surgeDuration_h}h</div>
              <div className="text-[10px] text-gray-500">18:00–22:00</div>
            </div>
            <div className="bg-gray-800 rounded-lg p-2 text-center">
              <div className="text-[10px] text-gray-400">Energy Curtailed</div>
              <div className="text-sm font-bold text-amber-300">{energyCurtailed_MWh.toFixed(2)} MWh</div>
              <div className="text-[10px] text-gray-500">@{FLEX_CURTAILMENT_KW} kW</div>
            </div>
            <div className="bg-gray-800 rounded-lg p-2 text-center">
              <div className="text-[10px] text-gray-400">Settlement</div>
              <div className="text-sm font-bold text-green-300">€{settlementCost.toFixed(2)}</div>
              <div className="text-[10px] text-gray-500">€{FLEX_PRICE_MWH}/MWh</div>
            </div>
          </div>

          {/* Outcome badges */}
          <div className="flex flex-wrap gap-2 mb-3">
            <div className="flex items-center gap-1 px-2 py-1 rounded bg-green-900/30 border border-green-800/40 text-green-400 text-[10px]">
              <CheckCircle2 className="w-3 h-3" /> Thermal violation resolved
            </div>
            <div className="flex items-center gap-1 px-2 py-1 rounded bg-blue-900/30 border border-blue-800/40 text-blue-400 text-[10px]">
              <CheckCircle2 className="w-3 h-3" /> Voltage restored &gt;{minVFlex.toFixed(0)} V
            </div>
            <div className="flex items-center gap-1 px-2 py-1 rounded bg-amber-900/30 border border-amber-800/40 text-amber-400 text-[10px]">
              <AlertTriangle className="w-3 h-3" /> Peak residual {peakFlex.toFixed(0)} kW (+4% over DT)
            </div>
          </div>

          {/* Slot-level settlement table */}
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
                  {SETTLEMENT_SLOTS.map((s) => (
                    <tr key={s.slot} className="border-t border-gray-700/50 hover:bg-gray-800/40">
                      <td className="px-2 py-1 text-gray-400 font-mono">{s.slot}</td>
                      <td className="px-2 py-1 text-gray-300 font-mono">{s.time}</td>
                      <td className="px-2 py-1 text-right text-amber-300 font-mono">{s.qty_kW}</td>
                      <td className="px-2 py-1 text-right text-gray-300 font-mono">{s.energy_MWh}</td>
                      <td className="px-2 py-1 text-right text-green-300 font-mono">{s.cost_eur}</td>
                    </tr>
                  ))}
                  <tr className="border-t border-gray-600 bg-gray-800/60">
                    <td colSpan={3} className="px-2 py-1.5 text-gray-400 text-[10px] font-medium">Total</td>
                    <td className="px-2 py-1.5 text-right text-gray-200 font-mono font-bold">
                      {energyCurtailed_MWh.toFixed(4)}
                    </td>
                    <td className="px-2 py-1.5 text-right text-green-300 font-mono font-bold">
                      €{settlementCost.toFixed(2)}
                    </td>
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
