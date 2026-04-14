import React, { useState, useCallback, useEffect, useRef } from 'react'
import { useNavigate, useLocation } from 'react-router-dom'
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip,
  ResponsiveContainer, ReferenceLine, Cell,
} from 'recharts'
import {
  DEMO_DT, LV_BRANCHES_DEMO, EV_CHARGERS_DEMO,
} from '../data/auzanceNetwork'
import { AlertTriangle, CheckCircle, ChevronRight, Loader2, Zap, Car } from 'lucide-react'
import clsx from 'clsx'

// ─── LinDistFlow constants ────────────────────────────────────────────────────

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
// Average base loads per branch (kW) — multiplied by DIURNAL to get 30-min slot demand
const BASE_LOADS: Record<string, number> = { 'BR-A': 34, 'BR-B': 55, 'BR-C': 17 }
// 3 community AC Type-2 chargers (22+20+18 kW) on Branch B, 18:00–22:00
const EV_SURGE_KW = 60
const DT_LIMIT = DEMO_DT.thermal_limit_kw

function slotToTime(slot: number): string {
  const h = Math.floor(slot / 2)
  const m = slot % 2 === 0 ? '00' : '30'
  return `${String(h).padStart(2, '0')}:${m}`
}

const defaultSlot = () => {
  const now = new Date()
  const slot = now.getHours() * 2 + (now.getMinutes() >= 30 ? 1 : 0)
  return slot >= 36 ? Math.min(47, slot) : 37
}

// ─── 48-slot aggregate forecast ───────────────────────────────────────────────

interface ForecastSlot {
  slot: number
  time: string
  totalLoad: number
  dtPct: number
  evSurge: boolean
  violation: boolean
}

function buildForecast(): ForecastSlot[] {
  const baseSum = BASE_LOADS['BR-A'] + BASE_LOADS['BR-B'] + BASE_LOADS['BR-C']
  return DIURNAL.map((mult, i) => {
    const evSurge = i >= 36 && i < 44
    const evLoad = evSurge ? EV_SURGE_KW : 0
    const totalLoad = parseFloat((mult * baseSum + evLoad).toFixed(1))
    const dtPct = parseFloat(((totalLoad / DT_LIMIT) * 100).toFixed(1))
    return {
      slot: i,
      time: slotToTime(i),
      totalLoad,
      dtPct,
      evSurge,
      violation: totalLoad > DT_LIMIT,
    }
  })
}

const X_TICKS = [0, 4, 8, 12, 16, 20, 24, 28, 32, 36, 40, 44, 47]
const TICK_LABELS: Record<number, string> = {
  0: '00:00', 4: '02:00', 8: '04:00', 12: '06:00', 16: '08:00',
  20: '10:00', 24: '12:00', 28: '14:00', 32: '16:00', 36: '18:00',
  40: '20:00', 44: '22:00', 47: '23:30',
}

function ForecastTooltip({ active, payload }: any) {
  if (!active || !payload?.length) return null
  const d = payload[0]?.payload as ForecastSlot
  return (
    <div className="bg-white border border-gray-200 rounded-lg p-3 text-xs shadow-xl">
      <p className="font-semibold text-gray-900 mb-1.5">{d?.time}</p>
      <div className="flex justify-between gap-4">
        <span className="text-gray-500">DT Load</span>
        <span className="font-mono text-gray-900">{d?.totalLoad} kW</span>
      </div>
      <div className="flex justify-between gap-4">
        <span className="text-gray-500">DT %</span>
        <span className={clsx('font-mono', d?.dtPct > 100 ? 'text-red-400' : d?.dtPct > 75 ? 'text-amber-400' : 'text-gray-700')}>
          {d?.dtPct}%
        </span>
      </div>
      {d?.evSurge && <div className="text-blue-400 mt-1">EV surge window</div>}
      {d?.violation && <div className="text-red-400 mt-1 font-semibold">Thermal violation</div>}
      <div className="text-gray-400 mt-1 text-[10px]">Click bar to snap slider →</div>
    </div>
  )
}

// ─── Power flow solver ────────────────────────────────────────────────────────

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
  ev_surge: boolean
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
}

function solveFrontend(slot: number): PowerFlowResult {
  const V_NOM = 400.0
  const PF = 0.9
  const mult = DIURNAL[slot]
  const evSurge = slot >= 36 && slot < 44

  const branches: BranchResult[] = LV_BRANCHES_DEMO.map((br) => {
    const baseKw = BASE_LOADS[br.id] ?? br.base_load_kw
    const residentialLoad = baseKw * mult
    const evLoad = (br.id === 'BR-B' && evSurge) ? EV_SURGE_KW : 0
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
    ev_surge: evSurge,
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
  }
}

function branchStatusBadge(thermal: string, voltage: string) {
  const isCritical = thermal === 'CRITICAL' || voltage === 'CRITICAL'
  const isWarning = !isCritical && (thermal === 'WARNING' || voltage !== 'NORMAL')
  const cls = isCritical
    ? 'bg-red-100 text-red-600 border-red-200'
    : isWarning
    ? 'bg-amber-100 text-amber-600 border-amber-200'
    : 'bg-green-100 text-green-700 border-green-200'
  const label = isCritical ? 'Critical' : isWarning ? 'Warning' : 'Normal'
  return <span className={clsx('inline-flex px-2 py-0.5 rounded text-[10px] font-semibold border', cls)}>{label}</span>
}

// ─── Main page ────────────────────────────────────────────────────────────────

export default function ForecastPage() {
  const navigate = useNavigate()
  const location = useLocation()
  const navState = location.state as { slot?: number; dtId?: string } | null

  const [slotIndex, setSlotIndex] = useState<number>(() => navState?.slot ?? defaultSlot())
  const [running, setRunning] = useState(false)
  const [result, setResult] = useState<PowerFlowResult | null>(null)
  const [ranSlot, setRanSlot] = useState<number | null>(null)
  const [forecastData, setForecastData] = useState<ForecastSlot[]>(() => buildForecast())
  const [forecastLoading, setForecastLoading] = useState(false)

  const controlsRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    setForecastLoading(true)
    fetch(`${import.meta.env.VITE_API_URL || ''}/api/v1/lv-network/lindistflow-oe?dt_id=DT-AUZ-001`, {
      headers: { Authorization: `Bearer ${localStorage.getItem('ng_token') || ''}` },
    })
      .then(r => r.ok ? r.json() : null)
      .then(data => {
        if (!data?.slots) return
        const mapped: ForecastSlot[] = data.slots.map((s: any) => ({
          slot: s.position - 1,
          time: s.time,
          totalLoad: s.total_load_kw ?? 0,
          dtPct: s.dt_loading_pct ?? 0,
          evSurge: s.ev_surge ?? false,
          violation: (s.total_load_kw ?? 0) > DT_LIMIT,
        }))
        setForecastData(mapped)
      })
      .catch(() => {})
      .finally(() => setForecastLoading(false))
  }, [])

  useEffect(() => {
    if (navState?.slot !== undefined && controlsRef.current) {
      setTimeout(() => controlsRef.current?.scrollIntoView({ behavior: 'smooth', block: 'center' }), 300)
    }
  }, [])

  const evSurge = slotIndex >= 36 && slotIndex < 44
  const alreadyRan = result !== null && ranSlot === slotIndex

  const violations = forecastData.filter(d => d.violation)
  const peakSlot = forecastData.reduce((max, d) => d.totalLoad > max.totalLoad ? d : max, forecastData[0])

  const handleBarClick = useCallback((data: any) => {
    if (data?.activePayload?.[0]?.payload) {
      const slot = data.activePayload[0].payload.slot as number
      setSlotIndex(slot)
      setResult(null)
      setRanSlot(null)
    }
  }, [])

  const runPowerFlow = useCallback(async () => {
    setRunning(true)
    setResult(null)

    try {
      const url = `${import.meta.env.VITE_API_URL || ''}/api/v1/lv-network/powsybl-power-flow?ev_surge=${evSurge}`
      const res = await fetch(url, { headers: { Authorization: `Bearer ${localStorage.getItem('ng_token') || ''}` } })
      if (res.ok) {
        const data = await res.json()
        setResult({ ...data, engine: 'Powsybl' })
        setRanSlot(slotIndex)
        setRunning(false)
        return
      }
    } catch { /* fall through */ }

    await new Promise(r => setTimeout(r, 1200))
    setResult(solveFrontend(slotIndex))
    setRanSlot(slotIndex)
    setRunning(false)
  }, [slotIndex, evSurge])

  return (
    <div className="space-y-4 max-w-5xl mx-auto">
      {/* Workflow breadcrumb */}
      <div className="flex items-center gap-1 text-xs text-gray-500 bg-white border border-gray-200 rounded-lg px-4 py-2">
        <span className="text-indigo-400 font-medium">Step 1</span>
        <span className="mx-1.5 text-gray-300">·</span>
        <span className="font-medium text-gray-900">Look-Ahead &amp; Power Flow</span>
        <ChevronRight className="w-3.5 h-3.5 mx-1 text-gray-400" />
        <span>Step 2 · OE Dispatch</span>
        <ChevronRight className="w-3.5 h-3.5 mx-1 text-gray-400" />
        <span>Step 3 · IEC Messages</span>
      </div>

      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-bold text-gray-900">Look-Ahead &amp; Power Flow</h1>
          <p className="text-sm text-gray-500 mt-0.5">
            DT-AUZ-001 · 48 × PT30M slots · {DT_LIMIT} kW limit · Click a bar to inspect that slot
          </p>
        </div>
        <div className="flex items-center gap-1.5 bg-indigo-50 border border-indigo-200 rounded-lg px-3 py-1.5">
          <Zap className="w-3.5 h-3.5 text-indigo-500" />
          <span className="text-xs text-indigo-600 font-medium">{result ? result.engine : 'Powsybl'}</span>
          {!result && <span className="text-xs text-gray-500">OpenLoadFlow</span>}
        </div>
      </div>

      {/* Violation banner */}
      {violations.length > 0 && (
        <div className="flex items-start gap-3 bg-red-50 border border-red-200 rounded-lg px-4 py-3">
          <AlertTriangle className="w-4 h-4 text-red-400 flex-shrink-0 mt-0.5" />
          <div className="flex-1">
            <p className="text-sm text-red-600 font-semibold">
              Forecast violation — Branch B thermal overload {violations[0].time}–{violations[violations.length - 1].time}
            </p>
            <p className="text-xs text-gray-500 mt-0.5">
              Peak {peakSlot.totalLoad.toFixed(0)} kW · {peakSlot.dtPct.toFixed(0)}% of {DT_LIMIT} kW limit · {violations.length} slots in violation
            </p>
          </div>
        </div>
      )}

      {/* 48-slot bar chart */}
      <div className="card">
        <h3 className="text-sm font-semibold text-gray-900 mb-0.5">
          DT Aggregate Load — 48 × PT30M
          {forecastLoading && <span className="ml-2 text-xs text-gray-400 font-normal">Loading…</span>}
        </h3>
        <p className="text-xs text-gray-500 mb-4">Click any bar to snap the time slider to that slot</p>
        <div className="h-56">
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={forecastData} margin={{ top: 5, right: 10, left: 0, bottom: 5 }} onClick={handleBarClick} style={{ cursor: 'pointer' }}>
              <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" />
              <XAxis
                dataKey="slot"
                tick={{ fill: '#6b7280', fontSize: 9 }}
                ticks={X_TICKS}
                tickFormatter={(v) => TICK_LABELS[v] || ''}
              />
              <YAxis
                tick={{ fill: '#6b7280', fontSize: 10 }}
                unit=" kW"
                domain={[0, Math.ceil(Math.max(...forecastData.map(d => d.totalLoad)) / 100) * 100 + 50]}
              />
              <Tooltip content={<ForecastTooltip />} />
              <ReferenceLine
                y={DT_LIMIT}
                stroke="#ef4444"
                strokeDasharray="6 3"
                strokeWidth={1.5}
                label={{ value: `${DT_LIMIT} kW limit`, position: 'insideTopRight', fontSize: 9, fill: '#ef4444' }}
              />
              {/* Selected slot indicator */}
              <ReferenceLine
                x={slotIndex}
                stroke="#818cf8"
                strokeWidth={2}
                strokeDasharray="4 2"
              />
              <Bar dataKey="totalLoad" radius={[2, 2, 0, 0]}>
                {forecastData.map((d) => (
                  <Cell
                    key={d.slot}
                    fill={
                      d.slot === slotIndex ? '#a5b4fc'
                      : d.violation ? '#ef4444'
                      : d.evSurge ? '#f59e0b'
                      : '#6366f1'
                    }
                    opacity={d.slot === slotIndex ? 1 : d.evSurge ? 0.85 : 0.7}
                  />
                ))}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        </div>
        <div className="flex items-center gap-5 mt-2 text-[10px] text-gray-500">
          <span className="flex items-center gap-1.5"><span className="w-3 h-3 bg-indigo-500/70 rounded-sm inline-block" />Normal</span>
          <span className="flex items-center gap-1.5"><span className="w-3 h-3 bg-amber-500/85 rounded-sm inline-block" />EV surge</span>
          <span className="flex items-center gap-1.5"><span className="w-3 h-3 bg-red-500 rounded-sm inline-block" />Thermal violation</span>
          <span className="flex items-center gap-1.5"><span className="w-3 h-3 bg-indigo-300 rounded-sm inline-block" />Selected slot</span>
        </div>
      </div>

      {/* Power flow controls */}
      <div ref={controlsRef} className="card flex items-center gap-6">
        <div className="flex-shrink-0">
          <div className="text-xs text-gray-500 mb-0.5">DT</div>
          <div className="text-sm font-semibold text-gray-900">{DEMO_DT.name}</div>
          <div className="text-xs text-gray-500">{DEMO_DT.thermal_limit_kw} kW limit · 65 HH</div>
        </div>

        <div className="flex-1">
          <div className="flex items-center justify-between mb-1.5">
            <span className="text-xs text-gray-500">Time of day</span>
            <div className="flex items-center gap-2">
              <span className="text-sm font-semibold text-gray-900 font-mono">{slotToTime(slotIndex)}</span>
              {evSurge && (
                <span className="flex items-center gap-1 text-[10px] bg-blue-100 text-blue-600 border border-blue-200 px-1.5 py-0.5 rounded">
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
            onChange={(e) => { setSlotIndex(Number(e.target.value)); setResult(null); setRanSlot(null) }}
            className="w-full accent-indigo-500 cursor-pointer"
          />
          <div className="flex justify-between text-[9px] text-gray-400 mt-0.5">
            <span>00:00</span><span>06:00</span><span>12:00</span><span>18:00</span><span>23:30</span>
          </div>
        </div>

        <button
          onClick={runPowerFlow}
          disabled={running || alreadyRan}
          className={clsx(
            'flex items-center gap-2 flex-shrink-0 px-4 py-2 rounded-lg text-sm font-medium transition-colors',
            alreadyRan
              ? 'bg-green-100 text-green-700 border border-green-200 cursor-default'
              : 'btn-primary'
          )}
        >
          {running && <Loader2 className="w-4 h-4 animate-spin" />}
          {alreadyRan && <CheckCircle className="w-4 h-4" />}
          {running ? 'Solving…' : alreadyRan ? `✓ ${slotToTime(slotIndex)}` : `Run Power Flow · ${slotToTime(slotIndex)}`}
        </button>
      </div>

      {/* Running state */}
      {running && (
        <div className="card flex flex-col items-center justify-center py-10 text-gray-500">
          <Loader2 className="w-7 h-7 animate-spin mb-3 text-indigo-400" />
          <p className="text-sm font-medium">Running power flow…</p>
          <p className="text-xs text-gray-400 mt-1">{slotToTime(slotIndex)} · 250 kVA · 3 branches</p>
        </div>
      )}

      {/* Empty state */}
      {!result && !running && (
        <div className="card flex flex-col items-center justify-center py-10 text-gray-500">
          <Zap className="w-7 h-7 mb-3 text-gray-400" />
          <p className="text-sm">Click a bar or move the slider, then <strong className="text-gray-700">Run Power Flow</strong></p>
        </div>
      )}

      {/* Power flow results */}
      {result && (
        <>
          {/* DT summary */}
          <div className={clsx(
            'rounded-xl border px-5 py-3 flex items-center gap-6',
            result.dt.status === 'CRITICAL'
              ? 'bg-red-50 border-red-200'
              : result.dt.status === 'WARNING'
              ? 'bg-amber-50 border-amber-200'
              : 'bg-green-50 border-green-200'
          )}>
            <div className="flex items-center gap-3">
              {result.dt.status === 'CRITICAL'
                ? <AlertTriangle className="w-5 h-5 text-red-400 flex-shrink-0" />
                : <CheckCircle className="w-5 h-5 text-green-400 flex-shrink-0" />
              }
              <span className="text-sm font-semibold text-gray-900">{result.dt.id}</span>
            </div>
            <span className="text-sm font-mono text-gray-700">
              {result.dt.total_load_kw} / {result.dt.thermal_limit_kw} kW
            </span>
            <div className={clsx(
              'text-lg font-bold',
              result.dt.status === 'CRITICAL' ? 'text-red-400' :
              result.dt.status === 'WARNING' ? 'text-amber-400' : 'text-green-400'
            )}>
              {result.dt.loading_pct.toFixed(0)}%
            </div>
            <div className="ml-auto flex items-center gap-2">
              <span className="text-xs text-gray-500">{result.engine} · {slotToTime(slotIndex)}</span>
              {result.violations.length > 0
                ? <span className="text-xs text-red-500 font-medium">{result.violations.length} violation{result.violations.length > 1 ? 's' : ''}</span>
                : <span className="text-xs text-green-500">No violations</span>
              }
            </div>
          </div>

          {/* Branch table */}
          <div className="card p-0 overflow-hidden">
            <table className="w-full text-sm">
              <thead className="bg-gray-50 border-b border-gray-200">
                <tr>
                  <th className="text-left text-xs text-gray-500 font-medium px-4 py-3">Branch</th>
                  <th className="text-right text-xs text-gray-500 font-medium px-4 py-3">Households</th>
                  <th className="text-right text-xs text-gray-500 font-medium px-4 py-3">Load (kW)</th>
                  <th className="text-right text-xs text-gray-500 font-medium px-4 py-3">Loading %</th>
                  <th className="text-right text-xs text-gray-500 font-medium px-4 py-3">V_end (pu)</th>
                  <th className="text-center text-xs text-gray-500 font-medium px-4 py-3">Status</th>
                </tr>
              </thead>
              <tbody>
                {result.branches.map((br) => (
                  <tr
                    key={br.branch_id}
                    className={clsx(
                      'border-t border-gray-200',
                      (br.thermal_status === 'CRITICAL' || br.voltage_status === 'CRITICAL')
                        ? 'bg-red-50'
                        : (br.thermal_status === 'WARNING' || br.voltage_status !== 'NORMAL')
                        ? 'bg-amber-50'
                        : ''
                    )}
                  >
                    <td className="px-4 py-3 font-mono text-xs text-gray-700 font-medium">
                      {br.branch_id}
                      <span className="ml-2 text-gray-400">Phase {br.phase}</span>
                    </td>
                    <td className="px-4 py-3 text-right text-gray-500 text-xs">{br.households} HH</td>
                    <td className="px-4 py-3 text-right font-mono">
                      <span className={clsx(
                        br.thermal_status === 'CRITICAL' ? 'text-red-400' :
                        br.thermal_status === 'WARNING' ? 'text-amber-400' : 'text-gray-800'
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
                        br.loading_pct > 75 ? 'text-amber-400' : 'text-gray-700'
                      )}>
                        {br.loading_pct.toFixed(0)}%
                      </span>
                    </td>
                    <td className="px-4 py-3 text-right font-mono">
                      <span className={clsx(br.voltage_status === 'NORMAL' ? 'text-gray-700' : 'text-red-400')}>
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

          {/* EV charger detail */}
          {result.ev_surge && (
            <div className="card border-blue-200 bg-blue-50">
              <h3 className="text-xs font-semibold text-blue-600 mb-3">EV Chargers active on Branch B</h3>
              <table className="w-full text-xs">
                <thead>
                  <tr>
                    <th className="text-left text-gray-500 font-medium pb-2">ID</th>
                    <th className="text-left text-gray-500 font-medium pb-2">Location</th>
                    <th className="text-right text-gray-500 font-medium pb-2">kW</th>
                    <th className="text-left text-gray-500 font-medium pb-2">Phase</th>
                  </tr>
                </thead>
                <tbody>
                  {EV_CHARGERS_DEMO.filter(ev => ev.branch_id === 'BR-B').map((ev) => (
                    <tr key={ev.id} className="border-t border-gray-200">
                      <td className="py-1.5 font-mono text-gray-700">{ev.id}</td>
                      <td className="py-1.5 text-gray-500">{ev.label}</td>
                      <td className="py-1.5 text-right font-mono text-blue-500 font-semibold">{ev.kw}</td>
                      <td className="py-1.5 text-gray-400 pl-4">Phase B</td>
                    </tr>
                  ))}
                  <tr className="border-t border-gray-300">
                    <td colSpan={2} className="py-1.5 text-gray-500 font-medium">Total EV load</td>
                    <td className="py-1.5 text-right font-mono text-blue-500 font-bold">
                      {EV_CHARGERS_DEMO.filter(ev => ev.branch_id === 'BR-B').reduce((s, ev) => s + ev.kw, 0)} kW
                    </td>
                    <td />
                  </tr>
                </tbody>
              </table>
            </div>
          )}

          {/* Available Flex Program panel */}
          {result.violations.length > 0 && (
            <div className="rounded-xl border border-indigo-200 bg-indigo-50 p-4">
              <div className="flex items-start justify-between gap-4">
                <div className="flex-1">
                  <div className="flex items-center gap-2 mb-2">
                    <span className="text-xs font-bold uppercase tracking-wide text-indigo-600">Available Flex Program</span>
                    <span className="px-2 py-0.5 rounded-full text-[10px] font-semibold bg-green-100 text-green-700 border border-green-200">Active</span>
                  </div>
                  <h3 className="text-sm font-bold text-gray-900 mb-1">EDF Réseau Peak Flex</h3>
                  <div className="grid grid-cols-2 gap-x-8 gap-y-1 text-xs text-gray-600 mb-3">
                    <div><span className="text-gray-400">Type</span> · Thermal constraint relief</div>
                    <div><span className="text-gray-400">DT</span> · DT-AUZ-001</div>
                    <div><span className="text-gray-400">Assets</span> · 3 EV chargers on Branch B</div>
                    <div><span className="text-gray-400">Lead time</span> · 15 min</div>
                    <div><span className="text-gray-400">Flex capacity</span> · <span className="font-semibold text-gray-800">350 kW curtailable</span></div>
                    <div><span className="text-gray-400">Price</span> · €85 / MWh</div>
                  </div>
                  {/* Projected outcome */}
                  <div className="flex items-center gap-2 text-xs bg-white rounded-lg px-3 py-2 border border-indigo-100">
                    <CheckCircle className="w-3.5 h-3.5 text-green-500 flex-shrink-0" />
                    <span className="text-gray-600">
                      Dispatch full curtailment →
                      <span className="font-semibold text-gray-900 mx-1">DT load: ~{Math.round((result.dt.total_load_kw - 350) * 10) / 10} kW</span>
                      ({Math.round(((result.dt.total_load_kw - 350) / result.dt.thermal_limit_kw) * 100)}% of limit) · Violation resolved
                    </span>
                  </div>
                </div>
                <div className="flex flex-col gap-2 flex-shrink-0">
                  <button
                    onClick={() => navigate('/oe')}
                    className="flex items-center gap-1.5 bg-indigo-600 hover:bg-indigo-700 text-white text-xs px-3 py-2 rounded-lg font-medium transition-colors"
                  >
                    Generate OE <ChevronRight className="w-3.5 h-3.5" />
                  </button>
                  <button
                    onClick={() => navigate('/admin/programs')}
                    className="flex items-center gap-1.5 bg-white hover:bg-gray-50 text-gray-600 text-xs px-3 py-2 rounded-lg font-medium border border-gray-200 transition-colors"
                  >
                    View Program
                  </button>
                </div>
              </div>
            </div>
          )}
        </>
      )}
    </div>
  )
}
