import React, { useState } from 'react'
import {
  DEMO_DT, LV_BRANCHES_DEMO, EV_CHARGERS_DEMO,
} from '../data/auzanceNetwork'
import { AlertTriangle, CheckCircle, Loader2, Zap, Car } from 'lucide-react'
import clsx from 'clsx'

// ─── Diurnal profile ─────────────────────────────────────────────────────────

const DIURNAL = [
  0.55, 0.50, 0.48, 0.45, 0.45, 0.48,
  0.55, 0.70, 0.95, 1.05, 1.00, 0.95,
  0.90, 0.88, 0.85, 0.85, 0.85, 0.88,
  0.90, 0.95, 0.95, 0.92, 0.88, 0.85,
  0.85, 0.85, 0.88, 0.90, 0.95, 1.00,
  1.10, 1.20, 1.35, 1.45, 1.55, 1.65,
  1.70, 1.70, 1.65, 1.60, 1.55, 1.50,
  1.40, 1.20, 1.00, 0.85, 0.72, 0.62,
]
// Base loads (day-ahead average, from LinDistFlow)
const BASE_LOADS: Record<string, number> = { 'BR-A': 46, 'BR-B': 58, 'BR-C': 27 }
const EV_SURGE_KW = 350  // added to BR-B for slots 36-43

function slotToTime(slot: number): string {
  const h = Math.floor(slot / 2)
  const m = slot % 2 === 0 ? '00' : '30'
  return `${String(h).padStart(2, '0')}:${m}`
}

const currentSlot = () => {
  const now = new Date()
  const slot = now.getHours() * 2 + (now.getMinutes() >= 30 ? 1 : 0)
  // Default to 18:30 (slot 37, EV surge window) unless it's already evening
  return slot >= 36 ? Math.min(47, slot) : 37
}

// ─── Types ───────────────────────────────────────────────────────────────────

interface BranchResult {
  branch_id: string
  phase: string
  households: number
  length_m: number
  base_load_kw: number
  ev_load_kw: number
  total_load_kw: number
  v_end_pu: number
  v_end_v: number
  i_a: number
  ampacity_a: number
  loading_pct: number
  loss_kw: number
  voltage_status: string
  thermal_status: string
}

interface PowerFlowResult {
  engine: string
  converged: boolean
  scenario: string
  dt: {
    id: string
    rating_kva: number
    thermal_limit_kw: number
    total_load_kw: number
    total_loss_kw: number
    loading_pct: number
    status: string
  }
  branches: BranchResult[]
  violations: BranchResult[]
  ev_surge: boolean
}

// ─── Synthetic solver (frontend fallback) ─────────────────────────────────────

function solveFrontend(slot: number): PowerFlowResult {
  const V_NOM = 400.0
  const DT_LIMIT = DEMO_DT.thermal_limit_kw
  const PF = 0.9
  const mult = DIURNAL[slot]
  const evSurge = slot >= 36 && slot < 44

  const branches: BranchResult[] = LV_BRANCHES_DEMO.map((br) => {
    const baseKw = BASE_LOADS[br.id] ?? br.base_load_kw
    const residentialLoad = baseKw * mult
    const evLoad = (br.id === 'BR-B' && slot >= 36 && slot < 44) ? EV_SURGE_KW : 0
    const totalLoad = residentialLoad + evLoad
    const q = totalLoad * Math.tan(Math.acos(PF))
    const delta_v_sq = 2 * (br.r_ohm * totalLoad * 1000 + br.x_ohm * q * 1000) / (V_NOM ** 2)
    const v_end_pu = Math.sqrt(Math.max(1.0 - delta_v_sq, 0.01))
    const s_kva = Math.sqrt(totalLoad ** 2 + q ** 2)
    const i_a = (s_kva * 1000) / (Math.sqrt(3) * V_NOM)
    const loading_pct = (i_a / br.ampacity_a) * 100
    const loss_kw = br.r_ohm * i_a ** 2 / 1000

    let v_status = 'NORMAL'
    if (v_end_pu < 0.90 || v_end_pu > 1.10) v_status = 'CRITICAL'
    else if (v_end_pu < 0.94) v_status = 'LOW'
    else if (v_end_pu > 1.06) v_status = 'HIGH'

    return {
      branch_id: br.id,
      phase: br.phase,
      households: br.households,
      length_m: br.length_m,
      base_load_kw: parseFloat(residentialLoad.toFixed(1)),
      ev_load_kw: parseFloat(evLoad.toFixed(1)),
      total_load_kw: parseFloat(totalLoad.toFixed(1)),
      v_end_pu: parseFloat(v_end_pu.toFixed(4)),
      v_end_v: parseFloat((v_end_pu * V_NOM).toFixed(1)),
      i_a: parseFloat(i_a.toFixed(1)),
      ampacity_a: br.ampacity_a,
      loading_pct: parseFloat(loading_pct.toFixed(1)),
      loss_kw: parseFloat(loss_kw.toFixed(2)),
      voltage_status: v_status,
      thermal_status: loading_pct > 100 ? 'CRITICAL' : loading_pct > 75 ? 'WARNING' : 'NORMAL',
    }
  })

  const total_load = branches.reduce((s, b) => s + b.total_load_kw, 0)
  const total_loss = branches.reduce((s, b) => s + b.loss_kw, 0)
  const dt_loading = (total_load / DT_LIMIT) * 100
  const violations = branches.filter(b => b.voltage_status !== 'NORMAL' || b.thermal_status !== 'NORMAL')

  return {
    engine: 'DistFlow',
    converged: true,
    scenario: evSurge ? 'ev_surge' : 'normal',
    dt: {
      id: DEMO_DT.id,
      rating_kva: DEMO_DT.capacity_kva,
      thermal_limit_kw: DT_LIMIT,
      total_load_kw: parseFloat(total_load.toFixed(1)),
      total_loss_kw: parseFloat(total_loss.toFixed(2)),
      loading_pct: parseFloat(dt_loading.toFixed(1)),
      status: dt_loading > 100 ? 'CRITICAL' : dt_loading > 75 ? 'WARNING' : 'NORMAL',
    },
    branches,
    violations,
    ev_surge: evSurge,
  }
}

function branchStatusBadge(thermal: string, voltage: string) {
  const isCritical = thermal === 'CRITICAL' || voltage === 'CRITICAL'
  const isWarning = !isCritical && (thermal === 'WARNING' || voltage !== 'NORMAL')
  const cls = isCritical
    ? 'bg-red-900/40 text-red-400 border-red-800/40'
    : isWarning
    ? 'bg-amber-900/40 text-amber-400 border-amber-800/40'
    : 'bg-green-900/30 text-green-400 border-green-800/30'
  const label = isCritical ? 'Critical' : isWarning ? 'Warning' : 'Normal'
  return <span className={clsx('inline-flex px-2 py-0.5 rounded text-[10px] font-semibold border', cls)}>{label}</span>
}

// ─── Main page ────────────────────────────────────────────────────────────────

export default function PowerFlowPage() {
  const [slotIndex, setSlotIndex] = useState<number>(currentSlot)
  const [running, setRunning] = useState(false)
  const [result, setResult] = useState<PowerFlowResult | null>(null)
  const [engine, setEngine] = useState<'Powsybl' | 'DistFlow'>('DistFlow')

  const evSurge = slotIndex >= 36 && slotIndex < 44

  const runPowerFlow = async () => {
    setRunning(true)
    setResult(null)

    // Try real backend endpoint first
    try {
      const url = `${import.meta.env.VITE_API_URL || ''}/api/v1/lv/powsybl-power-flow?ev_surge=${evSurge}&slot=${slotIndex}`
      const res = await fetch(url, { headers: { Authorization: `Bearer ${localStorage.getItem('ng_token') || ''}` } })
      if (res.ok) {
        const data = await res.json()
        setResult({ ...data, engine: 'Powsybl' })
        setEngine('Powsybl')
        setRunning(false)
        return
      }
    } catch { /* fall through */ }

    // DistFlow fallback
    await new Promise(r => setTimeout(r, 1200))
    const r = solveFrontend(slotIndex)
    setEngine('DistFlow')
    setResult(r)
    setRunning(false)
  }

  return (
    <div className="space-y-4 max-w-5xl mx-auto">
      {/* Header */}
      <div className="flex items-start justify-between">
        <div>
          <h1 className="text-xl font-bold text-white">Power Flow</h1>
          <p className="text-sm text-gray-400 mt-0.5">
            DT-AUZ-001 · 250 kVA · 3-branch radial · IEC 60909
          </p>
        </div>
        <div className="flex items-center gap-1.5 bg-indigo-950/60 border border-indigo-800/40 rounded-lg px-3 py-1.5">
          <Zap className="w-3.5 h-3.5 text-indigo-400" />
          <span className="text-xs text-indigo-300 font-medium">{result ? engine : 'Powsybl'}</span>
          {!result && <span className="text-xs text-gray-500">OpenLoadFlow</span>}
        </div>
      </div>

      {/* Controls */}
      <div className="card flex items-center gap-6">
        <div className="flex-1">
          <div className="flex items-center gap-2 mb-1">
            <span className="text-xs text-gray-400 font-medium">Distribution Transformer</span>
            <span className="badge-info text-[10px]">250 kVA</span>
          </div>
          <div className="text-sm font-semibold text-white">{DEMO_DT.name}</div>
          <div className="text-xs text-gray-500 mt-0.5">
            {DEMO_DT.hv_voltage_kv} kV / {DEMO_DT.lv_voltage_v} V · Thermal limit: {DEMO_DT.thermal_limit_kw} kW · 65 households
          </div>
        </div>

        {/* Time of day slider */}
        <div className="flex-1">
          <div className="flex items-center justify-between mb-1.5">
            <span className="text-xs text-gray-400">Time of day</span>
            <div className="flex items-center gap-2">
              <span className="text-sm font-semibold text-white font-mono">{slotToTime(slotIndex)}</span>
              {evSurge && (
                <span className="flex items-center gap-1 text-[10px] bg-blue-900/50 text-blue-300 border border-blue-700/40 px-1.5 py-0.5 rounded">
                  <Car className="w-2.5 h-2.5" /> EV surge active
                </span>
              )}
            </div>
          </div>
          <input
            type="range"
            min={0}
            max={47}
            value={slotIndex}
            onChange={(e) => { setSlotIndex(Number(e.target.value)); setResult(null) }}
            className="w-full accent-indigo-500 cursor-pointer"
          />
          <div className="flex justify-between text-[9px] text-gray-600 mt-0.5">
            <span>00:00</span><span>06:00</span><span>12:00</span><span>18:00</span><span>23:30</span>
          </div>
        </div>

        <button
          onClick={runPowerFlow}
          disabled={running}
          className="btn-primary flex items-center gap-2 flex-shrink-0"
        >
          {running && <Loader2 className="w-4 h-4 animate-spin" />}
          {running ? 'Solving…' : `Run Power Flow · ${slotToTime(slotIndex)}`}
        </button>
      </div>

      {/* Running state */}
      {running && (
        <div className="card flex flex-col items-center justify-center py-12 text-gray-400">
          <Loader2 className="w-8 h-8 animate-spin mb-3 text-indigo-400" />
          <p className="text-sm font-medium">Running power flow…</p>
          <p className="text-xs text-gray-500 mt-1">{slotToTime(slotIndex)} · 250 kVA · 3 branches</p>
        </div>
      )}

      {/* Empty state */}
      {!result && !running && (
        <div className="card flex flex-col items-center justify-center py-12 text-gray-500">
          <Zap className="w-8 h-8 mb-3 text-gray-600" />
          <p className="text-sm">Select a time and click <strong className="text-gray-400">Run Power Flow</strong></p>
        </div>
      )}

      {/* Results */}
      {result && (
        <>
          {/* DT summary row */}
          <div className={clsx(
            'rounded-xl border px-5 py-3 flex items-center gap-6',
            result.dt.status === 'CRITICAL'
              ? 'bg-red-950/20 border-red-700/50'
              : result.dt.status === 'WARNING'
              ? 'bg-amber-950/20 border-amber-700/40'
              : 'bg-green-950/10 border-green-800/30'
          )}>
            <div className="flex items-center gap-3">
              {result.dt.status === 'CRITICAL'
                ? <AlertTriangle className="w-5 h-5 text-red-400 flex-shrink-0" />
                : <CheckCircle className="w-5 h-5 text-green-400 flex-shrink-0" />
              }
              <span className="text-sm font-semibold text-white">{result.dt.id}</span>
            </div>
            <div className="flex items-center gap-2">
              <span className="text-sm font-mono text-gray-200">{result.dt.total_load_kw} / {result.dt.thermal_limit_kw} kW</span>
            </div>
            <div className={clsx(
              'text-lg font-bold',
              result.dt.status === 'CRITICAL' ? 'text-red-400' :
              result.dt.status === 'WARNING' ? 'text-amber-400' : 'text-green-400'
            )}>
              {result.dt.loading_pct.toFixed(0)}%
            </div>
            <div className="ml-auto flex items-center gap-2">
              <span className="text-xs text-gray-500">{result.engine}</span>
              {result.violations.length > 0 ? (
                <span className="text-xs text-red-400 font-medium">
                  {result.violations.length} violation{result.violations.length > 1 ? 's' : ''}
                </span>
              ) : (
                <span className="text-xs text-green-400">No violations</span>
              )}
            </div>
          </div>

          {/* Branch table */}
          <div className="card p-0 overflow-hidden">
            <table className="w-full text-sm">
              <thead className="bg-gray-800/80 border-b border-gray-700">
                <tr>
                  <th className="text-left text-xs text-gray-400 font-medium px-4 py-3">Branch</th>
                  <th className="text-right text-xs text-gray-400 font-medium px-4 py-3">Households</th>
                  <th className="text-right text-xs text-gray-400 font-medium px-4 py-3">Load (kW)</th>
                  <th className="text-right text-xs text-gray-400 font-medium px-4 py-3">Loading %</th>
                  <th className="text-right text-xs text-gray-400 font-medium px-4 py-3">V_end (pu)</th>
                  <th className="text-center text-xs text-gray-400 font-medium px-4 py-3">Status</th>
                </tr>
              </thead>
              <tbody>
                {result.branches.map((br) => (
                  <tr
                    key={br.branch_id}
                    className={clsx(
                      'border-t border-gray-700/50',
                      (br.thermal_status === 'CRITICAL' || br.voltage_status === 'CRITICAL')
                        ? 'bg-red-950/10'
                        : (br.thermal_status === 'WARNING' || br.voltage_status !== 'NORMAL')
                        ? 'bg-amber-950/10'
                        : ''
                    )}
                  >
                    <td className="px-4 py-3 font-mono text-xs text-gray-300 font-medium">
                      {br.branch_id}
                      <span className="ml-2 text-gray-600">Phase {br.phase}</span>
                    </td>
                    <td className="px-4 py-3 text-right text-gray-400 text-xs">{br.households} HH</td>
                    <td className="px-4 py-3 text-right font-mono">
                      <span className={clsx(
                        br.thermal_status === 'CRITICAL' ? 'text-red-400' :
                        br.thermal_status === 'WARNING' ? 'text-amber-400' : 'text-gray-200'
                      )}>
                        {br.total_load_kw}
                      </span>
                      {br.ev_load_kw > 0 && (
                        <span className="text-blue-400 text-[10px] ml-1">(+{br.ev_load_kw} EV)</span>
                      )}
                    </td>
                    <td className="px-4 py-3 text-right font-mono">
                      <span className={clsx(
                        br.loading_pct > 100 ? 'text-red-400 font-bold' :
                        br.loading_pct > 75 ? 'text-amber-400' : 'text-gray-300'
                      )}>
                        {br.loading_pct.toFixed(0)}%
                      </span>
                    </td>
                    <td className="px-4 py-3 text-right font-mono">
                      <span className={clsx(
                        br.voltage_status === 'NORMAL' ? 'text-gray-300' : 'text-red-400'
                      )}>
                        {br.v_end_pu.toFixed(3)}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-center">
                      {branchStatusBadge(br.thermal_status, br.voltage_status)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {/* EV charger sub-table (only when EV surge active) */}
          {result.ev_surge && (
            <div className="card border-blue-900/40 bg-blue-950/10">
              <h3 className="text-xs font-semibold text-blue-300 mb-3">EV Chargers active on Branch B</h3>
              <table className="w-full text-xs">
                <thead>
                  <tr>
                    <th className="text-left text-gray-400 font-medium pb-2">ID</th>
                    <th className="text-left text-gray-400 font-medium pb-2">Location</th>
                    <th className="text-right text-gray-400 font-medium pb-2">kW</th>
                    <th className="text-left text-gray-400 font-medium pb-2">Phase</th>
                  </tr>
                </thead>
                <tbody>
                  {EV_CHARGERS_DEMO.filter(ev => ev.branch_id === 'BR-B').map((ev) => (
                    <tr key={ev.id} className="border-t border-gray-700/40">
                      <td className="py-1.5 font-mono text-gray-300">{ev.id}</td>
                      <td className="py-1.5 text-gray-400">{ev.label}</td>
                      <td className="py-1.5 text-right font-mono text-blue-400 font-semibold">{ev.kw}</td>
                      <td className="py-1.5 text-gray-500 pl-4">Phase B</td>
                    </tr>
                  ))}
                  <tr className="border-t border-gray-600">
                    <td colSpan={2} className="py-1.5 text-gray-400 font-medium">Total EV load</td>
                    <td className="py-1.5 text-right font-mono text-blue-400 font-bold">
                      {EV_CHARGERS_DEMO.filter(ev => ev.branch_id === 'BR-B').reduce((s, ev) => s + ev.kw, 0)} kW
                    </td>
                    <td />
                  </tr>
                </tbody>
              </table>
            </div>
          )}

          {/* Violation action prompt */}
          {result.violations.length > 0 && (
            <div className="flex items-center gap-3 bg-red-950/20 border border-red-800/40 rounded-lg px-4 py-3">
              <AlertTriangle className="w-4 h-4 text-red-400 flex-shrink-0" />
              <p className="text-sm text-red-300">
                <span className="font-semibold">
                  {result.violations.map(v => `Branch ${v.phase}`).join(', ')} overloaded
                </span>
                {' '}— thermal constraint detected. Generate OE to curtail EV charging via D4G A38 dispatch.
              </p>
            </div>
          )}
        </>
      )}
    </div>
  )
}
