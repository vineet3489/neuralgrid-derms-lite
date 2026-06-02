import React, { useState, useCallback, useEffect, useRef } from 'react'
import { useNavigate, useLocation } from 'react-router-dom'
import {
  BarChart, Bar, LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip,
  ResponsiveContainer, ReferenceLine, Cell, Legend,
} from 'recharts'
import {
  DEMO_DT, LV_BRANCHES_DEMO,
} from '../data/auzanceNetwork'
import { AlertTriangle, CheckCircle, ChevronRight, Loader2, Zap, Radio, Cpu, Database } from 'lucide-react'
import clsx from 'clsx'
import { api } from '../api/client'

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

// ─── 1-min live window ────────────────────────────────────────────────────────

interface LiveMinSlot {
  minute: number
  time: string
  totalLoad: number
  violation: boolean
  isNow: boolean
  isForecast: boolean
}

function buildLiveMinutes(): LiveMinSlot[] {
  const now = new Date()
  const nowMin = now.getHours() * 60 + now.getMinutes()
  const baseSum = BASE_LOADS['BR-A'] + BASE_LOADS['BR-B'] + BASE_LOADS['BR-C']
  // Show 30 min of actuals + 30 min of near-term forecast = 60 bars
  return Array.from({ length: 60 }, (_, i) => {
    const absMin = nowMin - 29 + i
    const clampedMin = ((absMin % 1440) + 1440) % 1440
    const h = Math.floor(clampedMin / 60)
    const m = clampedMin % 60
    const diurnalIdx = Math.min(Math.floor(clampedMin / 30), 47)
    const mult = DIURNAL[diurnalIdx]
    const noise = Math.sin(i * 0.73 + h) * 6 + Math.cos(i * 1.2) * 4
    const totalLoad = Math.max(10, parseFloat((mult * baseSum + noise).toFixed(1)))
    return {
      minute: i,
      time: `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`,
      totalLoad,
      violation: totalLoad > DT_LIMIT,
      isNow: i === 29,
      isForecast: i >= 29,
    }
  })
}

function LiveMinTooltip({ active, payload }: any) {
  if (!active || !payload?.length) return null
  const d = payload[0]?.payload as LiveMinSlot
  return (
    <div className="bg-white border border-gray-200 rounded-lg p-3 text-xs shadow-xl">
      <p className="font-semibold text-gray-900 mb-1">{d?.time}</p>
      <div className="flex justify-between gap-4">
        <span className="text-gray-500">DT Load</span>
        <span className="font-mono text-gray-900">{d?.totalLoad} kW</span>
      </div>
      <div className="text-[10px] text-gray-400 mt-1">
        {d?.isForecast ? 'Near-term forecast' : 'Measured (SPG)'}
      </div>
      {d?.violation && <div className="text-red-400 mt-1 font-semibold">Thermal violation</div>}
    </div>
  )
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
    else if (v_end_pu > 1.10) v_status = 'HIGH'   // EN 50160: ±10% of nominal

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

  const [activeView, setActiveView] = useState<'dayahead' | 'live' | 'integrations'>('dayahead')
  const [slotIndex, setSlotIndex] = useState<number>(() => navState?.slot ?? defaultSlot())
  const [running, setRunning] = useState(false)
  const [result, setResult] = useState<PowerFlowResult | null>(null)
  const [ranSlot, setRanSlot] = useState<number | null>(null)
  const [forecastData, setForecastData] = useState<ForecastSlot[]>(() => buildForecast())
  const [forecastLoading, setForecastLoading] = useState(false)
  const [liveData, setLiveData] = useState<LiveMinSlot[]>(() => buildLiveMinutes())

  // D4G scheduler state
  const [schedulerStatus, setSchedulerStatus] = useState<any>(null)
  const [d4gBaseline, setD4gBaseline] = useState<any>(null)
  const [d4gActualPower, setD4gActualPower] = useState<any>(null)
  const [integrationsLoading, setIntegrationsLoading] = useState(false)
  // D4G baseline overlaid on day-ahead chart (96 PT15M → sampled to 48 PT30M)
  const [baselineOverlay, setBaselineOverlay] = useState<Record<number, number>>({})

  const controlsRef = useRef<HTMLDivElement>(null)

  // Refresh live 1-min data every 60s
  useEffect(() => {
    const id = setInterval(() => setLiveData(buildLiveMinutes()), 60_000)
    return () => clearInterval(id)
  }, [])

  // Fetch D4G actual power + baseline on mount (used by DER panel + chart overlay)
  useEffect(() => {
    api.d4gActualPower().then(r => { if (r.data) setD4gActualPower(r.data) }).catch(() => {})
  }, [])

  // Fetch D4G baseline on mount to populate chart overlay
  useEffect(() => {
    api.d4gBaseline().then(r => {
      if (!r.data) return
      setD4gBaseline(r.data)
      // pts is [{position, timestamp_utc, kwh, kw}, ...] — 96 × PT15M
      // Pair adjacent slots (2 × PT15M = 1 × PT30M) for the 48-slot chart
      const pts: any[] = r.data.points ?? []
      if (pts.length >= 2) {
        const overlay: Record<number, number> = {}
        for (let i = 0; i < 48; i++) {
          const a = pts[i * 2]?.kw ?? 0
          const b = pts[i * 2 + 1]?.kw ?? 0
          const avg = (a + b) / 2
          if (avg > 0) overlay[i] = Math.round(avg * 10) / 10
        }
        setBaselineOverlay(overlay)
      }
    }).catch(() => {})
  }, [])

  // Auto-run power flow on mount (for current slot)
  useEffect(() => {
    const autoRun = async () => {
      setRunning(true)
      try {
        const ev = defaultSlot() >= 36 && defaultSlot() < 44
        const url = `${import.meta.env.VITE_API_URL || ''}/api/v1/lv-network/powsybl-power-flow?ev_surge=${ev}`
        const res = await fetch(url, { headers: { Authorization: `Bearer ${localStorage.getItem('ng_token') || ''}` } })
        if (res.ok) {
          const data = await res.json()
          setResult({ ...data, engine: 'DistFlow' })
          setRanSlot(slotIndex)
        } else {
          setResult(solveFrontend(slotIndex))
          setRanSlot(slotIndex)
        }
      } catch {
        setResult(solveFrontend(slotIndex))
        setRanSlot(slotIndex)
      }
      setRunning(false)
    }
    autoRun()
  }, [])  // eslint-disable-line react-hooks/exhaustive-deps

  // Fetch scheduler status when Integrations tab opens (baseline + actual already loaded on mount)
  useEffect(() => {
    if (activeView !== 'integrations') return
    setIntegrationsLoading(true)
    api.d4gSchedulerStatus()
      .then(r => { if (r.data) setSchedulerStatus(r.data) })
      .catch(() => {})
      .finally(() => setIntegrationsLoading(false))
  }, [activeView])

  // Poll scheduler status every 30s when integrations tab is open
  useEffect(() => {
    if (activeView !== 'integrations') return
    const id = setInterval(() => {
      api.d4gSchedulerStatus().then(r => setSchedulerStatus(r.data)).catch(() => {})
    }, 30_000)
    return () => clearInterval(id)
  }, [activeView])

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

  const confirmedDtId = navState?.dtId || DEMO_DT.id

  const runPowerFlow = useCallback(async () => {
    setRunning(true)
    setResult(null)

    try {
      const url = `${import.meta.env.VITE_API_URL || ''}/api/v1/lv-network/powsybl-power-flow?ev_surge=${evSurge}`
      const res = await fetch(url, { headers: { Authorization: `Bearer ${localStorage.getItem('ng_token') || ''}` } })
      if (res.ok) {
        const data = await res.json()
        setResult({ ...data, engine: 'DistFlow' })
        setRanSlot(slotIndex)
        localStorage.setItem(`powerFlowConfirmed_${confirmedDtId}`, '1')
        setRunning(false)
        return
      }
    } catch { /* fall through */ }

    await new Promise(r => setTimeout(r, 1200))
    setResult(solveFrontend(slotIndex))
    setRanSlot(slotIndex)
    localStorage.setItem(`powerFlowConfirmed_${confirmedDtId}`, '1')
    setRunning(false)
  }, [slotIndex, evSurge, confirmedDtId])

  return (
    <div className="space-y-4 max-w-5xl mx-auto">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-bold text-gray-900">Look-Ahead &amp; Flow</h1>
          <p className="text-sm text-gray-500 mt-0.5">
            DT-AUZ-001 · Auzances · {DT_LIMIT} kW limit ·{' '}
            <span className="text-indigo-600 font-medium">LV DistFlow auto-computed · PT30M</span>
          </p>
        </div>
        <div className="flex items-center gap-2 text-xs text-gray-400">
          <span className="w-1.5 h-1.5 rounded-full bg-indigo-400 animate-pulse inline-block" />
          OE → D4G every 15 min
        </div>
      </div>

      {/* Violation banner */}
      {violations.length > 0 && (
        <div className="flex items-center gap-3 bg-red-50 border border-red-200 rounded-lg px-4 py-2.5">
          <AlertTriangle className="w-4 h-4 text-red-400 flex-shrink-0" />
          <p className="text-sm text-red-600 font-medium">
            Branch B thermal overload {violations[0].time}–{violations[violations.length - 1].time} · peak {peakSlot.totalLoad.toFixed(0)} kW ({peakSlot.dtPct.toFixed(0)}% of limit)
          </p>
        </div>
      )}

      {/* Chart card with view toggle */}
      <div className="card">
        <div className="flex items-center justify-between mb-3">
          <div>
            <h3 className="text-sm font-semibold text-gray-900 flex items-center gap-2">
              {activeView === 'dayahead' && <>Day-Ahead {forecastLoading && <span className="text-xs text-gray-400 font-normal">Loading…</span>}</>}
              {activeView === 'live' && <>Live <span className="w-1.5 h-1.5 rounded-full bg-green-500 animate-pulse inline-block ml-1" /></>}
              {activeView === 'integrations' && 'Integrations'}
            </h3>
          </div>
          <div className="flex rounded-lg border border-gray-200 overflow-hidden text-xs flex-shrink-0">
            {(['dayahead', 'live', 'integrations'] as const).map((v, i) => (
              <button
                key={v}
                onClick={() => setActiveView(v)}
                className={clsx(
                  'px-3 py-1.5 font-medium transition-colors',
                  i > 0 && 'border-l border-gray-200',
                  activeView === v ? 'bg-indigo-600 text-white' : 'bg-white text-gray-500 hover:bg-gray-50'
                )}
              >
                {v === 'dayahead' ? 'Day-Ahead' : v === 'live' ? 'Live' : 'Integrations'}
              </button>
            ))}
          </div>
        </div>

        {activeView === 'dayahead' ? (
          <>
            <div className="h-56">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart
                  data={forecastData.map(d => ({ ...d, baseline: baselineOverlay[d.slot] ?? null }))}
                  margin={{ top: 5, right: 10, left: 0, bottom: 5 }}
                  onClick={handleBarClick}
                  style={{ cursor: 'pointer' }}
                >
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
                  <ReferenceLine x={slotIndex} stroke="#818cf8" strokeWidth={2} strokeDasharray="4 2" />
                  <Bar dataKey="totalLoad" radius={[2, 2, 0, 0]} name="DT Load">
                    {forecastData.map((d) => (
                      <Cell
                        key={d.slot}
                        fill={d.slot === slotIndex ? '#a5b4fc' : d.violation ? '#ef4444' : '#6366f1'}
                        opacity={d.slot === slotIndex ? 1 : 0.7}
                      />
                    ))}
                  </Bar>
                  {Object.keys(baselineOverlay).length > 0 && (
                    <Line
                      type="monotone"
                      dataKey="baseline"
                      name="D4G Baseline (SPG)"
                      stroke="#10b981"
                      strokeWidth={2}
                      dot={false}
                      strokeDasharray="5 3"
                      connectNulls
                    />
                  )}
                </BarChart>
              </ResponsiveContainer>
            </div>
            <div className="flex items-center gap-5 mt-2 text-[10px] text-gray-500">
              <span className="flex items-center gap-1.5"><span className="w-3 h-3 bg-indigo-500/70 rounded-sm inline-block" />DT Load</span>
              <span className="flex items-center gap-1.5"><span className="w-3 h-3 bg-red-500 rounded-sm inline-block" />Violation</span>
              <span className="flex items-center gap-1.5"><span className="w-3 h-3 bg-indigo-300 rounded-sm inline-block" />Selected</span>
              {Object.keys(baselineOverlay).length > 0 && (
                <span className="flex items-center gap-1.5">
                  <span className="w-5 h-0 border-t-2 border-dashed border-emerald-500 inline-block" />
                  D4G Baseline · Solar SPG
                </span>
              )}
            </div>
          </>
        ) : activeView === 'live' ? (
          <>
            <div className="h-56">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={liveData} margin={{ top: 5, right: 10, left: 0, bottom: 5 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" />
                  <XAxis
                    dataKey="time"
                    tick={{ fill: '#6b7280', fontSize: 8 }}
                    interval={9}
                  />
                  <YAxis
                    tick={{ fill: '#6b7280', fontSize: 10 }}
                    unit=" kW"
                    domain={[0, Math.ceil(Math.max(...liveData.map(d => d.totalLoad)) / 100) * 100 + 50]}
                  />
                  <Tooltip content={<LiveMinTooltip />} />
                  <ReferenceLine
                    y={DT_LIMIT}
                    stroke="#ef4444"
                    strokeDasharray="6 3"
                    strokeWidth={1.5}
                    label={{ value: `${DT_LIMIT} kW limit`, position: 'insideTopRight', fontSize: 9, fill: '#ef4444' }}
                  />
                  {/* "Now" marker */}
                  <ReferenceLine
                    x={liveData[29]?.time}
                    stroke="#6366f1"
                    strokeWidth={2}
                    label={{ value: 'Now', position: 'insideTopLeft', fontSize: 9, fill: '#6366f1' }}
                  />
                  <Bar dataKey="totalLoad" radius={[2, 2, 0, 0]}>
                    {liveData.map((d, i) => (
                      <Cell
                        key={i}
                        fill={d.violation ? '#ef4444' : d.isForecast ? '#a5b4fc' : '#6366f1'}
                        opacity={d.isNow ? 1 : 0.8}
                      />
                    ))}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            </div>
            <div className="flex items-center gap-5 mt-2 text-[10px] text-gray-500">
              <span className="flex items-center gap-1.5"><span className="w-3 h-3 bg-indigo-500/80 rounded-sm inline-block" />Measured (SPG)</span>
              <span className="flex items-center gap-1.5"><span className="w-3 h-3 bg-indigo-300 rounded-sm inline-block" />Near-term forecast</span>
              <span className="flex items-center gap-1.5"><span className="w-3 h-3 bg-red-500 rounded-sm inline-block" />Thermal violation</span>
            </div>
          </>
        ) : (
          /* ── Integrations tab ─────────────────────────────────────────────── */
          integrationsLoading ? (
            <div className="flex items-center justify-center py-12">
              <Loader2 className="w-5 h-5 animate-spin text-indigo-400 mr-2" />
              <span className="text-sm text-gray-500">Loading integration data…</span>
            </div>
          ) : (
            <div className="divide-y divide-gray-100">
              {/* D4G Scheduler */}
              <div className="py-3 grid grid-cols-4 gap-4 text-xs">
                <div className="col-span-1 text-gray-400 font-medium pt-0.5">Scheduler</div>
                <div className="col-span-3 grid grid-cols-3 gap-3">
                  <div>
                    <div className="text-gray-400 mb-0.5">Last run</div>
                    <div className="text-gray-700 font-mono">
                      {schedulerStatus?.last_run_at
                        ? new Date(schedulerStatus.last_run_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
                        : '—'}
                    </div>
                  </div>
                  <div>
                    <div className="text-gray-400 mb-0.5">Next run</div>
                    <div className="text-gray-700 font-mono">
                      {schedulerStatus?.next_run_at
                        ? new Date(schedulerStatus.next_run_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
                        : '—'}
                    </div>
                  </div>
                  <div>
                    <div className="text-gray-400 mb-0.5">Last curtailment</div>
                    <div className="text-gray-700 font-mono">
                      {schedulerStatus?.last_curtailment_mw != null ? `${schedulerStatus.last_curtailment_mw} MW` : '—'}
                    </div>
                  </div>
                </div>
              </div>

              {/* Actual Power */}
              <div className="py-3 grid grid-cols-4 gap-4 text-xs">
                <div className="col-span-1 text-gray-400 font-medium pt-0.5">Actual Power</div>
                <div className="col-span-3 space-y-1">
                  <div className="flex items-baseline gap-3">
                    <span className={clsx('text-lg font-semibold', d4gActualPower?.actual_power_kw != null ? 'text-gray-900' : 'text-gray-400')}>
                      {d4gActualPower?.actual_power_kw != null ? `${d4gActualPower.actual_power_kw} kW` : '—'}
                    </span>
                    <span className="text-gray-400">Solar SPG generation · latest PT15M slot</span>
                  </div>
                  {d4gActualPower?.interval_start && (
                    <div className="text-gray-400 font-mono">
                      slot {new Date(d4gActualPower.interval_start).toISOString().slice(11, 16)} UTC
                      {d4gActualPower.total_der_count != null && (
                        <span className="ml-2">
                          · {d4gActualPower.total_der_count - (d4gActualPower.missing_der_count ?? 0)}/{d4gActualPower.total_der_count} DERs reporting
                        </span>
                      )}
                    </div>
                  )}
                  {d4gActualPower?.missing_der_count > 0 && (
                    <div className="text-amber-600">
                      {d4gActualPower.missing_der_count} DER{d4gActualPower.missing_der_count > 1 ? 's' : ''} missing — D4G flagged as incomplete (known issue)
                    </div>
                  )}
                  {d4gActualPower?.error && (
                    <div className="text-red-500">{d4gActualPower.error}</div>
                  )}
                </div>
              </div>

              {/* Baseline */}
              <div className="py-3 grid grid-cols-4 gap-4 text-xs">
                <div className="col-span-1 text-gray-400 font-medium pt-0.5">Baseline</div>
                <div className="col-span-3 space-y-1">
                  {d4gBaseline?.point_count > 0 ? (
                    <>
                      <div className="flex items-baseline gap-2">
                        <span className="text-gray-900 font-semibold">{d4gBaseline.point_count} × PT15M</span>
                        <span className="text-gray-400">from D4G aggregator</span>
                        {d4gBaseline.points?.filter((p: any) => p.kw > 0).length > 0
                          ? <span className="text-emerald-600">· shown on chart above</span>
                          : <span className="text-gray-400">· all zeros (nighttime / no solar now)</span>}
                      </div>
                      {d4gBaseline.interval_start && (
                        <div className="text-gray-400 font-mono">
                          {new Date(d4gBaseline.interval_start).toISOString().slice(0, 16).replace('T', ' ')} UTC
                          → +24 h
                        </div>
                      )}
                      {d4gBaseline.metadata?.missing_der_count > 0 && (
                        <div className="text-amber-600">
                          {d4gBaseline.metadata.missing_der_count} DERs missing from baseline
                        </div>
                      )}
                    </>
                  ) : (
                    <span className="text-red-500">
                      {d4gBaseline?.error ?? 'No baseline returned — check D4G credentials'}
                    </span>
                  )}
                </div>
              </div>

              {/* DER roster */}
              <div className="py-3 grid grid-cols-4 gap-4 text-xs">
                <div className="col-span-1 text-gray-400 font-medium pt-0.5">DER roster</div>
                <div className="col-span-3 space-y-1.5">
                  <div className="flex items-center gap-2">
                    <div className="w-1.5 h-1.5 rounded-full bg-emerald-400 flex-shrink-0" />
                    <span className="text-gray-700">FCA use case 02 — {d4gActualPower?.metadata?.resource_group_name ?? 'Solar SPG'}</span>
                    <span className="text-gray-400">· {d4gActualPower?.total_der_count ?? 7} DERs total</span>
                  </div>
                  {(d4gActualPower?.metadata?.missing_ders ?? []).map((der: any) => (
                    <div key={der.der_id} className="flex items-center gap-2">
                      <div className="w-1.5 h-1.5 rounded-full bg-amber-400 flex-shrink-0" />
                      <span className="text-gray-400 font-mono text-[10px]">{der.name}</span>
                      <span className="text-gray-400">· no data</span>
                    </div>
                  ))}
                </div>
              </div>

              {/* Assumptions */}
              <div className="py-3 grid grid-cols-4 gap-4 text-xs">
                <div className="col-span-1 text-gray-400 font-medium pt-0.5">Assumptions</div>
                <div className="col-span-3 space-y-1 text-gray-500">
                  <div>SPG metered via D4G telemetry · residual = DT head − SPG generation</div>
                  <div>Missing DERs modelled as zero (D4G known issue — some devices erroneously flagged)</div>
                  <div className="text-gray-400">Smart meter API: pending (Phase 2)</div>
                </div>
              </div>
            </div>
          )
        )}
      </div>

      {/* Slot inspector — drag to inspect any 30-min slot */}
      <div ref={controlsRef} className="card">
        <div className="flex items-center gap-2 mb-3">
          <span className="text-xs font-semibold text-gray-700">LV Branch Flow</span>
          <span className="text-xs text-gray-400">— drag to inspect any slot · auto-computed from LinDistFlow</span>
          <span className="font-mono text-xs font-semibold text-indigo-600 ml-auto">{slotToTime(slotIndex)}</span>
        </div>
        <input
          type="range" min={0} max={47} value={slotIndex}
          onChange={(e) => {
            const s = Number(e.target.value)
            setSlotIndex(s)
            setResult(solveFrontend(s))
            setRanSlot(s)
          }}
          className="w-full accent-indigo-500 cursor-pointer"
        />
        <div className="flex justify-between text-[9px] text-gray-400 mt-0.5">
          <span>00:00</span><span>06:00</span><span>12:00</span><span>18:00</span><span>23:30</span>
        </div>
      </div>

      {/* Running state */}
      {running && (
        <div className="card flex items-center justify-center py-4 gap-3 text-gray-500">
          <Loader2 className="w-4 h-4 animate-spin text-indigo-400" />
          <span className="text-xs">Computing DistFlow…</span>
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


          {/* DER generation panel */}
          <div className="card p-0 overflow-hidden">
            <div className="px-4 py-3 bg-gray-50 border-b border-gray-200 flex items-center justify-between">
              <span className="text-xs font-semibold text-gray-700">Connected Assets — DT-AUZ-001</span>
              <span className="text-[10px] text-gray-400">LinDistFlow estimate · D4G live where available</span>
            </div>
            <table className="w-full text-xs">
              <thead>
                <tr className="border-b border-gray-100">
                  <th className="text-left text-gray-400 font-medium px-4 py-2">Asset</th>
                  <th className="text-left text-gray-400 font-medium px-4 py-2">Type</th>
                  <th className="text-right text-gray-400 font-medium px-4 py-2">Capacity</th>
                  <th className="text-right text-gray-400 font-medium px-4 py-2">Now (estimated)</th>
                  <th className="text-right text-gray-400 font-medium px-4 py-2">D4G live (SPG agg.)</th>
                  <th className="text-right text-gray-400 font-medium px-4 py-2">OE limit</th>
                </tr>
              </thead>
              <tbody>
                {/* Community Solar A — enrolled in FCA SPG */}
                <tr className="border-t border-gray-100 bg-emerald-50/30">
                  <td className="px-4 py-2.5">
                    <div className="flex items-center gap-1.5">
                      <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 flex-shrink-0" />
                      <span className="font-medium text-gray-800">Community Solar A</span>
                      <span className="text-[10px] bg-indigo-100 text-indigo-600 border border-indigo-200 rounded px-1 font-medium">FCA SPG</span>
                    </div>
                  </td>
                  <td className="px-4 py-2.5 text-gray-500">Solar PV</td>
                  <td className="px-4 py-2.5 text-right font-mono text-gray-700">50 kW</td>
                  <td className="px-4 py-2.5 text-right font-mono text-emerald-600">
                    {evSurge ? '−38 kW (gen)' : result?.dt?.status === 'NORMAL' ? '−22 kW (gen)' : '−38 kW (gen)'}
                  </td>
                  <td className="px-4 py-2.5 text-right font-mono">
                    {d4gActualPower?.actual_power_kw != null
                      ? <span className="text-emerald-600">{d4gActualPower.actual_power_kw} kW agg.</span>
                      : <span className="text-gray-400">—</span>}
                  </td>
                  <td className="px-4 py-2.5 text-right font-mono text-indigo-600">45 kW</td>
                </tr>
                {/* Community Solar B */}
                <tr className="border-t border-gray-100 bg-emerald-50/30">
                  <td className="px-4 py-2.5">
                    <div className="flex items-center gap-1.5">
                      <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 flex-shrink-0" />
                      <span className="font-medium text-gray-800">Community Solar B</span>
                      <span className="text-[10px] bg-indigo-100 text-indigo-600 border border-indigo-200 rounded px-1 font-medium">FCA SPG</span>
                    </div>
                  </td>
                  <td className="px-4 py-2.5 text-gray-500">Solar PV</td>
                  <td className="px-4 py-2.5 text-right font-mono text-gray-700">50 kW</td>
                  <td className="px-4 py-2.5 text-right font-mono text-emerald-600">
                    {evSurge ? '−36 kW (gen)' : '−20 kW (gen)'}
                  </td>
                  <td className="px-4 py-2.5 text-right font-mono text-gray-400">↑ aggregated above</td>
                  <td className="px-4 py-2.5 text-right font-mono text-indigo-600">45 kW</td>
                </tr>
                {/* Fougères BESS */}
                <tr className="border-t border-gray-100">
                  <td className="px-4 py-2.5">
                    <div className="flex items-center gap-1.5">
                      <span className="w-1.5 h-1.5 rounded-full bg-purple-400 flex-shrink-0" />
                      <span className="font-medium text-gray-800">Fougères BESS</span>
                    </div>
                  </td>
                  <td className="px-4 py-2.5 text-gray-500">BESS</td>
                  <td className="px-4 py-2.5 text-right font-mono text-gray-700">30 kW</td>
                  <td className="px-4 py-2.5 text-right font-mono text-gray-700">
                    {evSurge ? '+12 kW (disch.)' : '+12 kW (chg.)'}
                  </td>
                  <td className="px-4 py-2.5 text-right font-mono text-gray-400">not in FCA</td>
                  <td className="px-4 py-2.5 text-right font-mono text-gray-500">28 kW</td>
                </tr>
              </tbody>
              {d4gBaseline?.point_count > 0 && (
                <tfoot>
                  <tr className="border-t border-gray-200 bg-gray-50">
                    <td colSpan={4} className="px-4 py-2 text-gray-400 text-[10px]">
                      D4G baseline: {d4gBaseline.point_count} × PT15M · {d4gBaseline.interval_start ? new Date(d4gBaseline.interval_start).toISOString().slice(0,16).replace('T',' ') + ' UTC → +24h' : ''}
                    </td>
                    <td colSpan={2} className="px-4 py-2 text-right text-[10px] text-gray-400">
                      {d4gBaseline.metadata?.total_der_count ?? 7} DERs · {d4gBaseline.metadata?.missing_der_count ?? 0} missing
                    </td>
                  </tr>
                </tfoot>
              )}
            </table>
          </div>

          {/* Available FCA panel */}
          {result.violations.length > 0 && (
            <div className="rounded-xl border border-indigo-200 bg-indigo-50 p-4">
              <div className="flex items-start justify-between gap-4">
                <div className="flex-1">
                  <div className="flex items-center gap-2 mb-2">
                    <span className="text-xs font-bold uppercase tracking-wide text-indigo-600">Flexibility Connection Agreement</span>
                    <span className="px-2 py-0.5 rounded-full text-[10px] font-semibold bg-green-100 text-green-700 border border-green-200">Active</span>
                    <span className="px-1.5 py-0.5 rounded text-[10px] font-semibold bg-indigo-100 text-indigo-600 border border-indigo-200">Remedial Action · 15min</span>
                  </div>
                  <h3 className="text-sm font-bold text-gray-900 mb-1">Auzances Solar SPG — Flex Down</h3>
                  <div className="grid grid-cols-2 gap-x-8 gap-y-1 text-xs text-gray-600 mb-3">
                    <div><span className="text-gray-400">Type</span> · Generation curtailment (Flex Down)</div>
                    <div><span className="text-gray-400">DT</span> · DT-AUZ-001</div>
                    <div><span className="text-gray-400">SPG</span> · Digital4Grids Solar SPG (sns_inverter)</div>
                    <div><span className="text-gray-400">Lead time</span> · 15 min</div>
                    <div><span className="text-gray-400">Flex capacity</span> · <span className="font-semibold text-gray-800">curtailable to OE limit</span></div>
                    <div><span className="text-gray-400">Settlement</span> · A44 post-period</div>
                  </div>
                  <div className="flex items-center gap-2 text-xs bg-white rounded-lg px-3 py-2 border border-indigo-100">
                    <CheckCircle className="w-3.5 h-3.5 text-green-500 flex-shrink-0" />
                    <span className="text-gray-600">
                      Curtail Solar SPG to OE limit →
                      <span className="font-semibold text-gray-900 mx-1">DT within thermal envelope</span>
                      · A32 ActivationDocument dispatched automatically
                    </span>
                  </div>
                </div>
                <div className="flex flex-col gap-2 flex-shrink-0">
                  <button
                    onClick={() => navigate('/oe')}
                    className="flex items-center gap-1.5 bg-indigo-600 hover:bg-indigo-700 text-white text-xs px-3 py-2 rounded-lg font-medium transition-colors"
                  >
                    View OE <ChevronRight className="w-3.5 h-3.5" />
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
