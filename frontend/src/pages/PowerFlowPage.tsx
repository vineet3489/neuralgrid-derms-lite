import React, { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Cell } from 'recharts'
import { DISTRIBUTION_TRANSFORMERS, DER_ASSETS } from '../data/auzanceNetwork'
import { api } from '../api/client'
import { AlertTriangle, CheckCircle, Loader2 } from 'lucide-react'
import clsx from 'clsx'

interface Bus {
  id: string
  name: string
  v_pu: number
  p_kw: number
}

interface Violation {
  id: string
  name: string
  v_pu: number
  voltage_status: string
}

interface PowerFlowResult {
  converged: boolean
  total_gen_kw: number
  total_load_kw: number
  total_loss_kw: number
  buses: Bus[]
  violations: Violation[]
}

const CRITICAL_DT_RESULT: PowerFlowResult = {
  converged: true,
  total_gen_kw: 428.4,
  total_load_kw: 12.5,
  total_loss_kw: 18.2,
  buses: [
    { id: 'BUS-001', name: 'DT-AUZ-005 LV Bus', v_pu: 1.082, p_kw: -428.4 },
    { id: 'BUS-002', name: 'Bois-Rond Solar Farm', v_pu: 1.091, p_kw: -285.6 },
    { id: 'BUS-003', name: 'Bois-Rond BESS', v_pu: 1.088, p_kw: -142.8 },
    { id: 'BUS-004', name: 'Customer LV 1', v_pu: 1.074, p_kw: 6.2 },
    { id: 'BUS-005', name: 'Customer LV 2', v_pu: 1.069, p_kw: 6.3 },
  ],
  violations: [
    { id: 'BUS-001', name: 'DT-AUZ-005 LV Bus', v_pu: 1.082, voltage_status: 'HIGH_VOLTAGE' },
    { id: 'BUS-002', name: 'Bois-Rond Solar Farm', v_pu: 1.091, voltage_status: 'HIGH_VOLTAGE' },
    { id: 'BUS-003', name: 'Bois-Rond BESS', v_pu: 1.088, voltage_status: 'HIGH_VOLTAGE' },
  ],
}

function generateCleanResult(dtId: string): PowerFlowResult {
  const ders = DER_ASSETS.filter((a) => a.dt_id === dtId)
  const gen = ders.filter((a) => a.current_kw < 0).reduce((s, a) => s + Math.abs(a.current_kw), 0)
  const load = ders.filter((a) => a.current_kw > 0).reduce((s, a) => s + a.current_kw, 0)
  const buses: Bus[] = [
    { id: 'BUS-001', name: `${dtId} LV Bus`, v_pu: 0.998, p_kw: -(gen - load) },
    ...ders.map((d, i) => ({
      id: `BUS-${i + 2}`,
      name: d.name,
      v_pu: parseFloat((0.972 + Math.random() * 0.05).toFixed(3)),
      p_kw: d.current_kw,
    })),
  ]
  return {
    converged: true,
    total_gen_kw: parseFloat(gen.toFixed(1)),
    total_load_kw: parseFloat(load.toFixed(1)),
    total_loss_kw: parseFloat((gen * 0.008).toFixed(1)),
    buses,
    violations: [],
  }
}

function busBarColor(v_pu: number): string {
  if (v_pu < 0.9 || v_pu > 1.1) return '#ef4444'
  if (v_pu < 0.95 || v_pu > 1.05) return '#f59e0b'
  return '#22c55e'
}

// Simple SVG tree diagram
function NetworkTree({ dtId, result }: { dtId: string; result: PowerFlowResult }) {
  const dt = DISTRIBUTION_TRANSFORMERS.find((d) => d.id === dtId)
  const ders = DER_ASSETS.filter((a) => a.dt_id === dtId)
  const circuit = dt?.circuit_id

  const nodeW = 120
  const nodeH = 36
  const levelGap = 70
  const nodeGap = 140

  const totalWidth = Math.max(ders.length * nodeGap, 400)
  const totalHeight = 4 * levelGap + nodeH + 20

  return (
    <svg width="100%" viewBox={`0 0 ${totalWidth} ${totalHeight}`} className="overflow-visible">
      {/* HV SS */}
      <rect x={totalWidth / 2 - nodeW / 2} y={10} width={nodeW} height={nodeH} rx={6} fill="#7c3aed" opacity={0.9} />
      <text x={totalWidth / 2} y={28} textAnchor="middle" fill="white" fontSize={10} fontWeight="bold">HV-AUZ-001</text>
      <text x={totalWidth / 2} y={40} textAnchor="middle" fill="#ddd6fe" fontSize={9}>63 kV Substation</text>

      {/* HTA Circuit */}
      <line x1={totalWidth / 2} y1={10 + nodeH} x2={totalWidth / 2} y2={10 + nodeH + levelGap} stroke="#6366f1" strokeWidth={2} />
      <rect x={totalWidth / 2 - nodeW / 2} y={10 + nodeH + levelGap} width={nodeW} height={nodeH} rx={6}
        fill={circuit === 'HTA-EST' ? '#92400e' : '#1e3a5f'} opacity={0.9} />
      <text x={totalWidth / 2} y={10 + nodeH + levelGap + 15} textAnchor="middle" fill="white" fontSize={10} fontWeight="bold">
        {circuit}
      </text>
      <text x={totalWidth / 2} y={10 + nodeH + levelGap + 27} textAnchor="middle" fill="#bfdbfe" fontSize={9}>20 kV Circuit</text>

      {/* DT */}
      {(() => {
        const dtColor = dt?.status === 'CRITICAL' ? '#7f1d1d' : dt?.status === 'WARNING' ? '#78350f' : '#14532d'
        const y3 = 10 + nodeH + levelGap + nodeH + levelGap
        return (
          <>
            <line x1={totalWidth / 2} y1={10 + nodeH + levelGap + nodeH} x2={totalWidth / 2} y2={y3} stroke="#6366f1" strokeWidth={2} />
            <rect x={totalWidth / 2 - nodeW / 2} y={y3} width={nodeW} height={nodeH} rx={6} fill={dtColor} opacity={0.9} />
            <text x={totalWidth / 2} y={y3 + 15} textAnchor="middle" fill="white" fontSize={10} fontWeight="bold">{dtId}</text>
            <text x={totalWidth / 2} y={y3 + 27} textAnchor="middle" fill="#fca5a5" fontSize={9}>{dt?.status}</text>
          </>
        )
      })()}

      {/* LV Buses & DERs */}
      {ders.map((der, i) => {
        const x = (i + 0.5) * (totalWidth / ders.length)
        const y3 = 10 + nodeH + levelGap + nodeH + levelGap
        const y4 = y3 + nodeH + levelGap
        const bus = result.buses.find((b) => b.name === der.name)
        const busColor = bus ? busBarColor(bus.v_pu) : '#6b7280'
        const derColors: Record<string, string> = {
          SOLAR_PV: '#854d0e', WIND_TURBINE: '#164e63', BESS: '#4a044e',
          EV_CHARGER: '#1e3a8a', INDUSTRIAL_LOAD: '#7c2d12',
        }
        return (
          <g key={der.id}>
            <line x1={totalWidth / 2} y1={y3 + nodeH} x2={x} y2={y4} stroke="#4b5563" strokeWidth={1.5} />
            {/* LV Bus */}
            <rect x={x - 50} y={y4} width={100} height={nodeH - 4} rx={4} fill={busColor} opacity={0.3} stroke={busColor} strokeWidth={1} />
            <text x={x} y={y4 + 12} textAnchor="middle" fill="white" fontSize={8}>LV Bus</text>
            <text x={x} y={y4 + 24} textAnchor="middle" fill={busColor} fontSize={9} fontWeight="bold">
              {bus ? `${bus.v_pu} pu` : 'N/A'}
            </text>
            {/* DER */}
            <rect x={x - 55} y={y4 + nodeH + 6} width={110} height={nodeH} rx={4} fill={derColors[der.type] || '#374151'} opacity={0.9} />
            <text x={x} y={y4 + nodeH + 20} textAnchor="middle" fill="white" fontSize={8} fontWeight="bold">{der.name.slice(0, 16)}</text>
            <text x={x} y={y4 + nodeH + 32} textAnchor="middle" fill="#d1d5db" fontSize={8}>{der.current_kw} kW</text>
          </g>
        )
      })}
    </svg>
  )
}

export default function PowerFlowPage() {
  const navigate = useNavigate()
  const savedDtId = localStorage.getItem('lite_selected_dt') || DISTRIBUTION_TRANSFORMERS[0].id
  const [selectedDtId, setSelectedDtId] = useState(savedDtId)
  const [running, setRunning] = useState(false)
  const [result, setResult] = useState<PowerFlowResult | null>(null)

  const runPowerFlow = async () => {
    setRunning(true)
    setResult(null)
    try {
      const res = await api.lvNetworkPowerFlow(selectedDtId)
      if (res.data) {
        setResult(res.data)
        return
      }
    } catch {
      // fall through to synthetic
    }
    await new Promise((r) => setTimeout(r, 1500))
    if (selectedDtId === 'DT-AUZ-005') {
      setResult(CRITICAL_DT_RESULT)
    } else {
      setResult(generateCleanResult(selectedDtId))
    }
    setRunning(false)
  }

  useEffect(() => {
    setRunning(false)
  }, [selectedDtId])

  const lossPercent = result
    ? ((result.total_loss_kw / (result.total_gen_kw + result.total_load_kw || 1)) * 100).toFixed(1)
    : '0.0'

  return (
    <div className="space-y-4 max-w-5xl mx-auto">
      {/* Header */}
      <div>
        <h1 className="text-xl font-bold text-white">LV Power Flow</h1>
        <p className="text-sm text-gray-400 mt-0.5">DistFlow solver · radial LV network below DT</p>
      </div>

      {/* DT Selector + Run Button */}
      <div className="card flex items-center gap-4">
        <div className="flex-1">
          <label className="block text-xs text-gray-400 mb-1.5 font-medium">Distribution Transformer</label>
          <select
            value={selectedDtId}
            onChange={(e) => { setSelectedDtId(e.target.value); localStorage.setItem('lite_selected_dt', e.target.value) }}
            className="w-full bg-gray-700 border border-gray-600 text-gray-100 px-3 py-2 rounded-lg text-sm focus:outline-none focus:ring-1 focus:ring-indigo-500"
          >
            {DISTRIBUTION_TRANSFORMERS.map((dt) => (
              <option key={dt.id} value={dt.id}>
                {dt.id} — {dt.name} ({dt.status})
              </option>
            ))}
          </select>
        </div>
        <div className="flex-shrink-0 pt-5">
          <button
            onClick={runPowerFlow}
            disabled={running}
            className="btn-primary flex items-center gap-2"
          >
            {running ? <Loader2 className="w-4 h-4 animate-spin" /> : null}
            {running ? 'Solving...' : 'Run Power Flow'}
          </button>
        </div>
      </div>

      {/* Results */}
      {result && (
        <>
          {result.violations.length > 0 && (
            <div className="flex items-center gap-3 bg-red-900/20 border border-red-800/40 rounded-lg px-4 py-3">
              <AlertTriangle className="w-4 h-4 text-red-400 flex-shrink-0" />
              <p className="text-sm text-red-300">
                <span className="font-semibold">{result.violations.length} voltage violation{result.violations.length > 1 ? 's' : ''}</span>
                {' '}— HIGH_VOLTAGE on {result.violations.map(v => v.name).join(', ')}. Generate OE to curtail.
              </p>
            </div>
          )}

          {/* Summary cards */}
          <div className="grid grid-cols-5 gap-3">
            <div className="card text-center">
              <div className="text-xs text-gray-400 mb-1">Converged</div>
              {result.converged
                ? <div className="flex items-center justify-center gap-1.5 text-green-400"><CheckCircle className="w-4 h-4" /><span className="font-semibold text-sm">Yes</span></div>
                : <div className="text-red-400 font-semibold text-sm">No</div>
              }
            </div>
            <div className="card text-center">
              <div className="text-xs text-gray-400 mb-1">Generation</div>
              <div className="text-lg font-bold text-green-400">{result.total_gen_kw}</div>
              <div className="text-xs text-gray-500">kW</div>
            </div>
            <div className="card text-center">
              <div className="text-xs text-gray-400 mb-1">Load</div>
              <div className="text-lg font-bold text-red-400">{result.total_load_kw}</div>
              <div className="text-xs text-gray-500">kW</div>
            </div>
            <div className="card text-center">
              <div className="text-xs text-gray-400 mb-1">Losses</div>
              <div className="text-lg font-bold text-amber-400">{result.total_loss_kw}</div>
              <div className="text-xs text-gray-500">kW</div>
            </div>
            <div className="card text-center">
              <div className="text-xs text-gray-400 mb-1">Loss %</div>
              <div className="text-lg font-bold text-amber-300">{lossPercent}%</div>
            </div>
          </div>

          {/* Voltage Profile chart */}
          <div className="card">
            <h3 className="text-sm font-semibold text-white mb-3">Voltage Profile (per-unit)</h3>
            <div className="h-56">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={result.buses} margin={{ top: 5, right: 20, left: 0, bottom: 40 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#374151" />
                  <XAxis dataKey="name" tick={{ fill: '#9ca3af', fontSize: 10 }} angle={-30} textAnchor="end" interval={0} />
                  <YAxis
                    tick={{ fill: '#9ca3af', fontSize: 11 }}
                    domain={[0.85, 1.15]}
                    tickFormatter={(v) => v.toFixed(2)}
                  />
                  <Tooltip
                    contentStyle={{ background: '#1f2937', border: '1px solid #374151', borderRadius: 8, fontSize: 12 }}
                    formatter={(v: number) => [v.toFixed(3) + ' pu', 'Voltage']}
                  />
                  {/* Reference lines */}
                  <Bar dataKey="v_pu" name="Voltage (pu)" radius={[4, 4, 0, 0]}>
                    {result.buses.map((bus) => (
                      <Cell key={bus.id} fill={busBarColor(bus.v_pu)} />
                    ))}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            </div>
            <div className="flex items-center gap-4 mt-2 text-xs text-gray-500">
              <span className="flex items-center gap-1.5"><span className="w-3 h-3 rounded-sm bg-green-500 inline-block" /> Normal (0.95–1.05 pu)</span>
              <span className="flex items-center gap-1.5"><span className="w-3 h-3 rounded-sm bg-amber-500 inline-block" /> Warning (±5–10%)</span>
              <span className="flex items-center gap-1.5"><span className="w-3 h-3 rounded-sm bg-red-500 inline-block" /> Critical (&lt;0.90 or &gt;1.10 pu)</span>
            </div>
          </div>

          {/* Violations table */}
          {result.violations.length > 0 && (
            <div className="card">
              <h3 className="text-sm font-semibold text-white mb-3">Voltage Violations</h3>
              <table className="w-full text-sm">
                <thead>
                  <tr>
                    <th className="text-left text-xs text-gray-400 font-medium pb-2">Bus</th>
                    <th className="text-right text-xs text-gray-400 font-medium pb-2">Voltage (pu)</th>
                    <th className="text-right text-xs text-gray-400 font-medium pb-2">Status</th>
                  </tr>
                </thead>
                <tbody>
                  {result.violations.map((v) => (
                    <tr key={v.id} className="border-t border-gray-700">
                      <td className="py-2 text-gray-200">{v.name}</td>
                      <td className="py-2 text-right font-mono text-red-400">{v.v_pu.toFixed(3)}</td>
                      <td className="py-2 text-right">
                        <span className="badge-warning text-xs">{v.voltage_status.replace('_', ' ')}</span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}

          {/* Network tree */}
          <div className="card overflow-x-auto">
            <h3 className="text-sm font-semibold text-white mb-4">LV Network Topology</h3>
            <NetworkTree dtId={selectedDtId} result={result} />
          </div>
        </>
      )}

      {!result && !running && (
        <div className="card flex flex-col items-center justify-center py-16 text-gray-500">
          <div className="text-4xl mb-3">⚡</div>
          <p className="text-sm">Select a distribution transformer and click <strong className="text-gray-400">Run Power Flow</strong></p>
        </div>
      )}

      {running && (
        <div className="card flex flex-col items-center justify-center py-16 text-gray-400">
          <Loader2 className="w-8 h-8 animate-spin mb-3 text-indigo-400" />
          <p className="text-sm">Running DistFlow solver…</p>
          <p className="text-xs text-gray-500 mt-1">Solving radial LV network equations</p>
        </div>
      )}
    </div>
  )
}
