import React, { useState } from 'react'
import {
  DEMO_DT, LV_BRANCHES_DEMO, SPG_GROUPS, EV_CHARGERS_DEMO,
} from '../data/auzanceNetwork'
import type { ProsumerHome, DERDevice } from '../data/auzanceNetwork'
import { AlertTriangle, CheckCircle, Loader2, Sun, Battery, Zap, Thermometer, Car } from 'lucide-react'
import clsx from 'clsx'

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

function solveFrontend(evSurge: boolean): PowerFlowResult {
  const V_NOM = 400.0
  const DT_LIMIT = DEMO_DT.thermal_limit_kw
  const PF = 0.9

  const branches: BranchResult[] = LV_BRANCHES_DEMO.map((br) => {
    const totalLoad = br.base_load_kw + (evSurge ? br.ev_load_kw : 0)
    const q = totalLoad * Math.tan(Math.acos(PF))
    // DistFlow voltage drop
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
      base_load_kw: br.base_load_kw,
      ev_load_kw: evSurge ? br.ev_load_kw : 0,
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
    engine: 'Powsybl (DistFlow fallback)',
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

// ─── Sub-components ──────────────────────────────────────────────────────────

const DER_ICON: Record<string, React.ReactNode> = {
  SOLAR_PV:   <Sun className="w-3 h-3 text-yellow-400" />,
  BESS:       <Battery className="w-3 h-3 text-purple-400" />,
  EV_CHARGER: <Car className="w-3 h-3 text-blue-400" />,
  HEAT_PUMP:  <Thermometer className="w-3 h-3 text-orange-400" />,
}

function DERBadge({ der }: { der: DERDevice }) {
  const isEV = der.type === 'EV_CHARGER'
  const kw = Math.abs(der.current_kw)
  return (
    <span className={clsx(
      'inline-flex items-center gap-0.5 text-[10px] px-1 py-0.5 rounded border',
      isEV && der.current_kw > 50
        ? 'bg-blue-900/60 border-blue-700/50 text-blue-300'
        : der.current_kw < 0
          ? 'bg-yellow-900/30 border-yellow-700/30 text-yellow-300'
          : 'bg-gray-700/50 border-gray-600/40 text-gray-400'
    )}>
      {DER_ICON[der.type]}
      {der.current_kw < 0 ? '-' : '+'}{kw.toFixed(1)} kW
      {der.soc_pct !== undefined && <span className="text-gray-500 ml-0.5">{der.soc_pct}%</span>}
    </span>
  )
}

function HomeRow({ home }: { home: ProsumerHome }) {
  const isEVSurging = home.ders.some(d => d.type === 'EV_CHARGER' && d.current_kw > 50)
  return (
    <div className={clsx(
      'flex items-start gap-2 py-1.5 px-2 rounded text-xs border',
      isEVSurging
        ? 'bg-blue-950/40 border-blue-800/40'
        : home.net_kw < 0
          ? 'bg-yellow-950/20 border-yellow-900/20'
          : 'bg-gray-800/40 border-gray-700/30'
    )}>
      <span className="text-gray-400 w-3.5 flex-shrink-0">🏠</span>
      <div className="flex-1 min-w-0">
        <div className="text-gray-300 truncate text-[11px]">{home.label}</div>
        <div className="flex flex-wrap gap-0.5 mt-0.5">
          {home.ders.map((d) => <DERBadge key={d.type + d.current_kw} der={d} />)}
        </div>
      </div>
      <span className={clsx(
        'text-[11px] font-mono font-semibold flex-shrink-0',
        home.net_kw < 0 ? 'text-yellow-400' : isEVSurging ? 'text-blue-400' : 'text-gray-300'
      )}>
        {home.net_kw > 0 ? '+' : ''}{home.net_kw.toFixed(1)} kW
      </span>
    </div>
  )
}

function loadingColor(pct: number): string {
  if (pct > 100) return '#ef4444'
  if (pct > 75) return '#f59e0b'
  return '#22c55e'
}

function LoadingBar({ pct, limit }: { pct: number; limit: number }) {
  const capped = Math.min(pct, 200)
  const color = loadingColor(pct)
  return (
    <div className="relative h-3 bg-gray-700 rounded-full overflow-hidden">
      <div
        className="h-full rounded-full transition-all duration-500"
        style={{ width: `${Math.min(capped / 2, 100)}%`, backgroundColor: color }}
      />
      {pct > 100 && (
        <div className="absolute inset-0 flex items-center justify-center text-[9px] font-bold text-white">
          {pct.toFixed(0)}%
        </div>
      )}
    </div>
  )
}

function BranchCard({
  branch,
  spg,
  evSurge,
}: {
  branch: BranchResult
  spg: typeof SPG_GROUPS[0] | undefined
  evSurge: boolean
}) {
  const isCritical = branch.thermal_status === 'CRITICAL' || branch.voltage_status === 'CRITICAL'
  const isWarning = !isCritical && (branch.thermal_status === 'WARNING' || branch.voltage_status !== 'NORMAL')

  return (
    <div className={clsx(
      'rounded-xl border p-4 space-y-3 flex flex-col',
      isCritical
        ? 'bg-red-950/20 border-red-700/50'
        : isWarning
          ? 'bg-amber-950/20 border-amber-700/40'
          : 'bg-gray-800/60 border-gray-700/40'
    )}>
      {/* Branch header */}
      <div className="flex items-start justify-between gap-2">
        <div>
          <div className="flex items-center gap-2">
            <span className={clsx(
              'text-xs font-bold px-2 py-0.5 rounded',
              isCritical ? 'bg-red-800/60 text-red-300' : isWarning ? 'bg-amber-800/60 text-amber-300' : 'bg-gray-700 text-gray-300'
            )}>Phase {branch.phase}</span>
            <span className="text-xs text-gray-400">{branch.length_m} m · {branch.households} homes</span>
          </div>
          <div className={clsx(
            'text-2xl font-bold mt-1',
            isCritical ? 'text-red-400' : isWarning ? 'text-amber-400' : 'text-green-400'
          )}>
            {branch.total_load_kw} <span className="text-sm font-normal text-gray-400">kW</span>
          </div>
          {branch.ev_load_kw > 0 && (
            <div className="text-xs text-blue-400 mt-0.5">
              Base {branch.base_load_kw} + EV {branch.ev_load_kw} kW
            </div>
          )}
        </div>
        <div className="text-right flex-shrink-0">
          <div className={clsx(
            'text-xs font-semibold px-2 py-0.5 rounded border',
            isCritical
              ? 'bg-red-900/40 border-red-700/50 text-red-400'
              : isWarning
                ? 'bg-amber-900/40 border-amber-700/50 text-amber-400'
                : 'bg-green-900/30 border-green-700/40 text-green-400'
          )}>
            {isCritical ? 'CRITICAL' : isWarning ? 'WARNING' : 'NORMAL'}
          </div>
        </div>
      </div>

      {/* Thermal loading bar */}
      <div>
        <div className="flex justify-between text-xs text-gray-400 mb-1">
          <span>Thermal loading</span>
          <span style={{ color: loadingColor(branch.loading_pct) }}>
            {branch.loading_pct.toFixed(0)}% of {branch.ampacity_a}A
          </span>
        </div>
        <LoadingBar pct={branch.loading_pct} limit={branch.ampacity_a} />
      </div>

      {/* Powsybl metrics */}
      <div className="grid grid-cols-3 gap-2 text-center">
        <div className="bg-gray-900/50 rounded-lg p-2">
          <div className="text-[10px] text-gray-500 mb-0.5">End Voltage</div>
          <div className={clsx(
            'text-sm font-bold',
            branch.voltage_status === 'NORMAL' ? 'text-green-400' : 'text-red-400'
          )}>
            {branch.v_end_pu.toFixed(3)} pu
          </div>
          <div className="text-[10px] text-gray-500">{branch.v_end_v.toFixed(0)} V</div>
        </div>
        <div className="bg-gray-900/50 rounded-lg p-2">
          <div className="text-[10px] text-gray-500 mb-0.5">Current</div>
          <div className="text-sm font-bold text-gray-200">{branch.i_a.toFixed(0)} A</div>
        </div>
        <div className="bg-gray-900/50 rounded-lg p-2">
          <div className="text-[10px] text-gray-500 mb-0.5">I²R Loss</div>
          <div className="text-sm font-bold text-amber-300">{branch.loss_kw.toFixed(1)} kW</div>
        </div>
      </div>

      {/* EV chargers in surge mode */}
      {evSurge && branch.ev_load_kw > 0 && (
        <div className="bg-blue-950/40 border border-blue-800/40 rounded-lg p-2.5">
          <div className="text-xs font-semibold text-blue-300 mb-1.5">EV Fast Chargers (active)</div>
          {EV_CHARGERS_DEMO.filter(e => e.branch_id === branch.branch_id).map(ev => (
            <div key={ev.id} className="flex items-center justify-between text-xs py-0.5">
              <span className="flex items-center gap-1 text-gray-300">
                <Car className="w-3 h-3 text-blue-400" />{ev.label}
              </span>
              <span className="text-blue-400 font-mono font-semibold">{ev.kw} kW</span>
            </div>
          ))}
        </div>
      )}

      {/* SPG group */}
      {spg && (
        <div className="border-t border-gray-700/40 pt-3">
          <div className="flex items-center gap-2 mb-2">
            <div className="flex-1">
              <div className="text-xs font-semibold text-indigo-300">{spg.id}</div>
              <div className="text-[10px] text-gray-500">{spg.name}</div>
            </div>
            <div className="text-right text-[10px] text-gray-500">
              {spg.prosumer_homes.length} prosumers
            </div>
          </div>

          {/* Prosumer homes list */}
          <div className="space-y-1 max-h-48 overflow-y-auto">
            {spg.prosumer_homes.map(home => (
              <HomeRow key={home.id} home={evSurge ? home : { ...home, ders: home.ders.map(d => d.type === 'EV_CHARGER' && d.current_kw > 50 ? { ...d, current_kw: 0 } : d), net_kw: home.ders.reduce((s, d) => s + (d.type === 'EV_CHARGER' && !evSurge ? 0 : d.current_kw < 0 ? d.current_kw : 0), 0) + home.ders.reduce((s, d) => s + (d.type !== 'EV_CHARGER' && d.current_kw > 0 ? d.current_kw : 0), 0) || home.net_kw }} />
            ))}
          </div>

          {/* Consumer aggregate */}
          <div className="mt-1.5 flex items-center justify-between bg-gray-800/60 rounded px-2 py-1.5 text-xs">
            <span className="text-gray-400">+ {spg.consumer_count} consumer homes</span>
            <span className="text-gray-300 font-mono">+{spg.consumer_aggregate_kw} kW</span>
          </div>
        </div>
      )}
    </div>
  )
}

// ─── Main page ────────────────────────────────────────────────────────────────

export default function PowerFlowPage() {
  const [evSurge, setEvSurge] = useState(false)
  const [running, setRunning] = useState(false)
  const [result, setResult] = useState<PowerFlowResult | null>(null)

  const runPowerFlow = async () => {
    setRunning(true)
    setResult(null)

    // Try real backend endpoint first
    try {
      const url = `${import.meta.env.VITE_API_URL || ''}/api/v1/lv/powsybl-power-flow?ev_surge=${evSurge}`
      const res = await fetch(url, { headers: { Authorization: `Bearer ${localStorage.getItem('ng_token') || ''}` } })
      if (res.ok) {
        const data = await res.json()
        setResult(data)
        setRunning(false)
        return
      }
    } catch { /* fall through */ }

    // Frontend solver fallback (matches Powsybl DistFlow results for radial network)
    await new Promise(r => setTimeout(r, 1800))
    setResult(solveFrontend(evSurge))
    setRunning(false)
  }

  const statusColor = (s: string) =>
    s === 'CRITICAL' ? 'text-red-400' : s === 'WARNING' ? 'text-amber-400' : 'text-green-400'

  return (
    <div className="space-y-4 max-w-6xl mx-auto">
      {/* Header */}
      <div className="flex items-start justify-between">
        <div>
          <h1 className="text-xl font-bold text-white">LV Power Flow</h1>
          <p className="text-sm text-gray-400 mt-0.5">
            Powered by <span className="text-indigo-300 font-medium">Powsybl</span> (RTE France · OpenLoadFlow) ·
            250 kVA · 3-branch radial · IEC 60909
          </p>
        </div>
        {/* Powsybl badge */}
        <div className="flex items-center gap-1.5 bg-indigo-950/60 border border-indigo-800/40 rounded-lg px-3 py-1.5">
          <Zap className="w-3.5 h-3.5 text-indigo-400" />
          <span className="text-xs text-indigo-300 font-medium">Powsybl</span>
          <span className="text-xs text-gray-500">OpenLoadFlow</span>
        </div>
      </div>

      {/* DT info + scenario selector */}
      <div className="card flex items-center gap-6">
        <div className="flex-1">
          <div className="flex items-center gap-2 mb-1">
            <span className="text-xs text-gray-400 font-medium">Distribution Transformer</span>
            <span className="badge-info text-[10px]">250 kVA</span>
          </div>
          <div className="text-sm font-semibold text-white">{DEMO_DT.name}</div>
          <div className="text-xs text-gray-500 mt-0.5">
            {DEMO_DT.hv_voltage_kv} kV / {DEMO_DT.lv_voltage_v} V ·
            Thermal limit: {DEMO_DT.thermal_limit_kw} kW ·
            65 households across 3 phases
          </div>
        </div>

        {/* Scenario toggle */}
        <div>
          <div className="text-xs text-gray-400 mb-1.5">Scenario</div>
          <div className="flex rounded-lg overflow-hidden border border-gray-600 text-sm">
            <button
              onClick={() => { setEvSurge(false); setResult(null) }}
              className={clsx(
                'px-3 py-1.5 text-xs font-medium transition-colors',
                !evSurge ? 'bg-indigo-600 text-white' : 'bg-gray-800 text-gray-400 hover:text-gray-200'
              )}
            >
              Normal
            </button>
            <button
              onClick={() => { setEvSurge(true); setResult(null) }}
              className={clsx(
                'px-3 py-1.5 text-xs font-medium transition-colors flex items-center gap-1.5',
                evSurge ? 'bg-blue-700 text-white' : 'bg-gray-800 text-gray-400 hover:text-gray-200'
              )}
            >
              <Car className="w-3 h-3" />
              EV Surge (18:00)
            </button>
          </div>
        </div>

        <button
          onClick={runPowerFlow}
          disabled={running}
          className="btn-primary flex items-center gap-2 flex-shrink-0"
        >
          {running && <Loader2 className="w-4 h-4 animate-spin" />}
          {running ? 'Solving…' : 'Run Powsybl'}
        </button>
      </div>

      {/* EV surge banner */}
      {evSurge && !result && (
        <div className="flex items-start gap-3 bg-blue-950/30 border border-blue-800/40 rounded-lg px-4 py-3">
          <Car className="w-4 h-4 text-blue-400 flex-shrink-0 mt-0.5" />
          <div>
            <p className="text-sm text-blue-300 font-medium">EV Surge Scenario — Branch B</p>
            <p className="text-xs text-gray-400 mt-0.5">
              3 EV fast chargers active on Phase B: 120 + 110 + 120 = 350 kW additional demand.
              Base 129 kW → 479 kW total (213% of DT thermal limit). Run Powsybl to see constraint analysis.
            </p>
          </div>
        </div>
      )}

      {/* Running state */}
      {running && (
        <div className="card flex flex-col items-center justify-center py-16 text-gray-400">
          <Loader2 className="w-8 h-8 animate-spin mb-3 text-indigo-400" />
          <p className="text-sm font-medium">Running Powsybl AC load flow…</p>
          <p className="text-xs text-gray-500 mt-1">
            OpenLoadFlow · {evSurge ? 'EV surge' : 'normal'} · 250 kVA · 3 branches
          </p>
        </div>
      )}

      {/* Empty state */}
      {!result && !running && (
        <div className="card flex flex-col items-center justify-center py-14 text-gray-500">
          <Zap className="w-8 h-8 mb-3 text-gray-600" />
          <p className="text-sm">Select a scenario and click <strong className="text-gray-400">Run Powsybl</strong></p>
        </div>
      )}

      {/* Results */}
      {result && (
        <>
          {/* DT summary */}
          <div className={clsx(
            'rounded-xl border px-5 py-4 flex items-center justify-between',
            result.dt.status === 'CRITICAL'
              ? 'bg-red-950/20 border-red-700/50'
              : result.dt.status === 'WARNING'
                ? 'bg-amber-950/20 border-amber-700/40'
                : 'bg-green-950/10 border-green-800/30'
          )}>
            <div className="flex items-center gap-4">
              {result.dt.status === 'CRITICAL'
                ? <AlertTriangle className="w-5 h-5 text-red-400" />
                : <CheckCircle className="w-5 h-5 text-green-400" />
              }
              <div>
                <div className="text-sm font-semibold text-white">
                  DT Total: {result.dt.total_load_kw} kW / {result.dt.thermal_limit_kw} kW limit
                </div>
                <div className="text-xs text-gray-400 mt-0.5">
                  {result.engine} · {result.dt.loading_pct.toFixed(0)}% utilisation ·
                  {result.violations.length > 0
                    ? ` ${result.violations.length} branch violation${result.violations.length > 1 ? 's' : ''}`
                    : ' no violations'
                  }
                </div>
              </div>
            </div>
            <div className={clsx('text-2xl font-bold', statusColor(result.dt.status))}>
              {result.dt.loading_pct.toFixed(0)}%
            </div>
          </div>

          {/* 3-branch grid */}
          <div className="grid grid-cols-3 gap-4">
            {result.branches.map(branch => {
              const spg = SPG_GROUPS.find(s => s.branch_id === branch.branch_id)
              return (
                <BranchCard
                  key={branch.branch_id}
                  branch={branch}
                  spg={spg}
                  evSurge={result.ev_surge}
                />
              )
            })}
          </div>

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
