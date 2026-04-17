import React, { useState, useEffect } from 'react'
import {
  BarChart, Bar, LineChart, Line, XAxis, YAxis, CartesianGrid,
  Tooltip, ResponsiveContainer, ReferenceLine, Legend,
} from 'recharts'
import { CheckCircle, AlertTriangle } from 'lucide-react'
import clsx from 'clsx'

// ── Demo data ────────────────────────────────────────────────────────────────

const DEMO_PROGRAMS = [
  { id: 'prog-demo-001', name: 'EDF Réseau Peak Flex', dt_id: 'DT-AUZ-001' },
  { id: 'prog-demo-002', name: 'Bois-Rond Solar Constraint Relief', dt_id: 'DT-AUZ-005' },
]

// Per-program per-aggregator demo performance data
const DEMO_DATA: Record<string, Record<string, PerformanceData>> = {
  'prog-demo-001': {
    'agg-001': {
      aggregator: 'Digital4Grids (D4G)',
      program: 'EDF Réseau Peak Flex',
      period: '2026-04-16',
      dispatch_window: '18:00–22:00',
      delivery_pct: 96.4,
      curtailed_kwh: 144.2,
      committed_kwh: 149.6,
      penalty: 'None',
      price_per_mwh: 85,
      slots: buildSlots('prog-001-agg-001'),
      assets: [
        { name: 'Community Solar A', type: 'Solar PV',   committed_kwh: 60.0, delivered_kwh: 57.8, delivery_pct: 96.3 },
        { name: 'Community Solar B', type: 'Solar PV',   committed_kwh: 45.0, delivered_kwh: 43.5, delivery_pct: 96.7 },
        { name: 'Fougères BESS',     type: 'Battery',    committed_kwh: 44.6, delivered_kwh: 42.9, delivery_pct: 96.2 },
      ],
      voltage_slots: buildVoltageSlots('auz-001'),
    },
  },
  'prog-demo-002': {
    'agg-002': {
      aggregator: 'Digital4Grids (D4G) — Bois-Rond Portfolio',
      program: 'Bois-Rond Solar Constraint Relief',
      period: '2026-04-16',
      dispatch_window: '11:00–17:00',
      delivery_pct: 96.4,
      curtailed_kwh: 144.2,
      committed_kwh: 149.6,
      penalty: 'None',
      price_per_mwh: 72,
      slots: buildSlots('prog-002-agg-002'),
      assets: [
        { name: 'Bois-Rond Solar Farm', type: 'Solar PV', committed_kwh: 99.5, delivered_kwh: 96.2, delivery_pct: 96.7 },
        { name: 'Bois-Rond BESS',       type: 'Battery',  committed_kwh: 50.1, delivered_kwh: 48.0, delivery_pct: 95.8 },
      ],
      voltage_slots: buildVoltageSlots('bois-rond'),
    },
    'agg-demo': {
      aggregator: 'Demo Aggregator Co.',
      program: 'Bois-Rond Solar Constraint Relief',
      period: '2026-04-15',
      dispatch_window: '11:00–17:00',
      delivery_pct: 89.1,
      curtailed_kwh: 133.4,
      committed_kwh: 149.6,
      penalty: 'Pro-rata',
      price_per_mwh: 72,
      slots: buildSlots('prog-002-agg-demo'),
      assets: [
        { name: 'Bois-Rond Solar Farm', type: 'Solar PV', committed_kwh: 99.5, delivered_kwh: 87.0, delivery_pct: 87.4 },
        { name: 'Bois-Rond BESS',       type: 'Battery',  committed_kwh: 50.1, delivered_kwh: 46.4, delivery_pct: 92.6 },
      ],
      voltage_slots: buildVoltageSlots('bois-rond-demo'),
    },
  },
}

// ── Builders ──────────────────────────────────────────────────────────────────

interface SlotData { time: string; committed: number; delivered: number }
interface VoltageSlot { time: string; before: number; after: number }

function buildSlots(seed: string): SlotData[] {
  // 13 half-hour slots — for prog-001 18:00–22:00, for prog-002 11:00–17:00
  const isEvening = seed.includes('001')
  const startHour = isEvening ? 18 : 11
  const variance = seed.includes('demo') ? 0.88 : 0.965
  return Array.from({ length: 13 }, (_, i) => {
    const h = startHour + Math.floor(i / 2)
    const m = i % 2 === 0 ? '00' : '30'
    const committed = 11.5
    const noise = (Math.sin(i * 1.3 + seed.length) * 0.03)
    return {
      time: `${String(h).padStart(2, '0')}:${m}`,
      committed,
      delivered: parseFloat((committed * (variance + noise)).toFixed(2)),
    }
  })
}

function buildVoltageSlots(seed: string): VoltageSlot[] {
  const isBoisRond = seed.includes('bois')
  const beforeBase = isBoisRond ? 1.088 : 1.042
  const afterBase = isBoisRond ? 1.048 : 1.012
  const startHour = isBoisRond ? 11 : 18
  return Array.from({ length: 13 }, (_, i) => {
    const h = startHour + Math.floor(i / 2)
    const m = i % 2 === 0 ? '00' : '30'
    const noise = Math.sin(i * 0.9) * 0.004
    return {
      time: `${String(h).padStart(2, '0')}:${m}`,
      before: parseFloat((beforeBase + noise).toFixed(4)),
      after:  parseFloat((afterBase  + noise * 0.5).toFixed(4)),
    }
  })
}

// ── Types ────────────────────────────────────────────────────────────────────

interface PerformanceData {
  aggregator: string
  program: string
  period: string
  dispatch_window: string
  delivery_pct: number
  curtailed_kwh: number
  committed_kwh: number
  penalty: string
  price_per_mwh: number
  slots: SlotData[]
  assets: { name: string; type: string; committed_kwh: number; delivered_kwh: number; delivery_pct: number }[]
  voltage_slots: VoltageSlot[]
}

// ── Enrollment helpers ────────────────────────────────────────────────────────

interface Enrollment {
  id: string; program_id: string; program_name: string; company: string; status: string
}

function loadEnrollments(): Enrollment[] {
  try { return JSON.parse(localStorage.getItem('ng_enrollments') || '[]') } catch { return [] }
}

// ── Custom tooltips ──────────────────────────────────────────────────────────

function DeliveryTooltip({ active, payload, label }: any) {
  if (!active || !payload?.length) return null
  return (
    <div className="bg-white border border-gray-200 rounded-lg p-3 text-xs shadow-lg">
      <p className="font-semibold text-gray-700 mb-1.5">{label}</p>
      {payload.map((p: any) => (
        <div key={p.dataKey} className="flex justify-between gap-4">
          <span style={{ color: p.color }}>{p.name}</span>
          <span className="font-mono">{p.value} kWh</span>
        </div>
      ))}
    </div>
  )
}

function VoltageTooltip({ active, payload, label }: any) {
  if (!active || !payload?.length) return null
  return (
    <div className="bg-white border border-gray-200 rounded-lg p-3 text-xs shadow-lg">
      <p className="font-semibold text-gray-700 mb-1.5">{label}</p>
      {payload.map((p: any) => (
        <div key={p.dataKey} className="flex justify-between gap-4">
          <span style={{ color: p.color }}>{p.name}</span>
          <span className="font-mono">{p.value} pu</span>
        </div>
      ))}
    </div>
  )
}

// ── Main page ─────────────────────────────────────────────────────────────────

export default function PerformancePage() {
  const [enrollments] = useState<Enrollment[]>(loadEnrollments)

  // Build aggregator options by merging demo + enrolled
  const [selectedProgId, setSelectedProgId] = useState(DEMO_PROGRAMS[1].id)
  const [selectedAggId, setSelectedAggId] = useState('agg-002')

  // Aggregator options for selected program
  const demoAggs = Object.entries(DEMO_DATA[selectedProgId] ?? {}).map(([id, d]) => ({ id, label: d.aggregator }))
  const enrolledAggs = enrollments
    .filter(e => e.program_id === selectedProgId && e.status !== 'suspended')
    .map(e => ({ id: e.id, label: e.company }))

  // Combine, de-duping by id
  const allAggOptions = [
    ...demoAggs,
    ...enrolledAggs.filter(ea => !demoAggs.find(d => d.label === ea.label)),
  ]

  // When program changes, reset aggregator to first available
  useEffect(() => {
    const opts = Object.keys(DEMO_DATA[selectedProgId] ?? {})
    setSelectedAggId(opts[0] ?? '')
  }, [selectedProgId])

  const data: PerformanceData | null =
    DEMO_DATA[selectedProgId]?.[selectedAggId] ?? null

  // If it's an enrolled aggregator with no demo data, build placeholder
  const enrolledAgg = enrollments.find(e => e.id === selectedAggId)
  const displayData: PerformanceData | null = data ?? (enrolledAgg ? {
    aggregator: enrolledAgg.company,
    program: enrolledAgg.program_name,
    period: new Date().toISOString().slice(0, 10),
    dispatch_window: '—',
    delivery_pct: 0,
    curtailed_kwh: 0,
    committed_kwh: 0,
    penalty: '—',
    price_per_mwh: 85,
    slots: [],
    assets: [],
    voltage_slots: [],
  } : null)

  const noData = !displayData || (displayData.committed_kwh === 0)

  // Payment calculation
  const estimatedPayment = displayData
    ? ((displayData.curtailed_kwh / 1000) * displayData.price_per_mwh * (displayData.delivery_pct / 100)).toFixed(2)
    : '0.00'

  const deliveryColor = (pct: number) =>
    pct >= 95 ? 'text-green-600' : pct >= 75 ? 'text-amber-500' : 'text-red-500'

  const deliveryBg = (pct: number) =>
    pct >= 95 ? 'bg-green-100 border-green-200 text-green-700' :
    pct >= 75 ? 'bg-amber-100 border-amber-200 text-amber-700' :
    'bg-red-100 border-red-200 text-red-600'

  return (
    <div className="space-y-5 max-w-5xl mx-auto">
      {/* Header */}
      <div>
        <h1 className="text-xl font-bold text-gray-900">Settlement</h1>
        <p className="text-sm text-gray-500 mt-0.5">Actual performance vs committed flex — per program, per aggregator</p>
      </div>

      {/* Selectors */}
      <div className="card flex items-end gap-4">
        <div className="flex-1">
          <label className="block text-xs text-gray-500 mb-1.5">Program</label>
          <select
            value={selectedProgId}
            onChange={e => setSelectedProgId(e.target.value)}
            className="w-full bg-white border border-gray-300 text-gray-900 px-3 py-2 rounded-lg text-sm focus:outline-none focus:ring-1 focus:ring-indigo-500"
          >
            {DEMO_PROGRAMS.map(p => (
              <option key={p.id} value={p.id}>{p.name}</option>
            ))}
          </select>
        </div>
        <div className="flex-1">
          <label className="block text-xs text-gray-500 mb-1.5">Aggregator</label>
          <select
            value={selectedAggId}
            onChange={e => setSelectedAggId(e.target.value)}
            className="w-full bg-white border border-gray-300 text-gray-900 px-3 py-2 rounded-lg text-sm focus:outline-none focus:ring-1 focus:ring-indigo-500"
          >
            {allAggOptions.map(a => (
              <option key={a.id} value={a.id}>{a.label}</option>
            ))}
            {allAggOptions.length === 0 && <option value="">No aggregators enrolled</option>}
          </select>
        </div>
        {displayData && (
          <div className="text-xs text-gray-400 flex-shrink-0 pb-2">
            Period: <span className="font-medium text-gray-600">{displayData.period}</span>
            {' · '}Window: <span className="font-medium text-gray-600">{displayData.dispatch_window}</span>
          </div>
        )}
      </div>

      {noData ? (
        <div className="card flex flex-col items-center justify-center py-16 text-gray-400">
          <AlertTriangle className="w-8 h-8 mb-3 text-gray-300" />
          <p className="text-sm font-medium">No performance data yet</p>
          <p className="text-xs mt-1">Data will appear after the first dispatch event for this aggregator</p>
        </div>
      ) : (
        <>
          {/* KPI cards */}
          <div className="grid grid-cols-4 gap-3">
            <div className="card text-center py-3">
              <div className="text-xs text-gray-500 mb-1">Delivery Rate</div>
              <div className={clsx('text-2xl font-bold', deliveryColor(displayData!.delivery_pct))}>
                {displayData!.delivery_pct.toFixed(1)}%
              </div>
              <span className={clsx('text-[10px] px-2 py-0.5 rounded border font-semibold mt-1 inline-block', deliveryBg(displayData!.delivery_pct))}>
                {displayData!.delivery_pct >= 95 ? 'Full payment' : displayData!.delivery_pct >= 75 ? 'Pro-rata' : 'Penalty'}
              </span>
            </div>
            <div className="card text-center py-3">
              <div className="text-xs text-gray-500 mb-1">Curtailed</div>
              <div className="text-2xl font-bold text-gray-800">{displayData!.curtailed_kwh}</div>
              <div className="text-[10px] text-gray-400 mt-0.5">kWh delivered</div>
            </div>
            <div className="card text-center py-3">
              <div className="text-xs text-gray-500 mb-1">Committed</div>
              <div className="text-2xl font-bold text-gray-800">{displayData!.committed_kwh}</div>
              <div className="text-[10px] text-gray-400 mt-0.5">kWh requested</div>
            </div>
            <div className="card text-center py-3">
              <div className="text-xs text-gray-500 mb-1">Penalty</div>
              <div className={clsx('text-2xl font-bold', displayData!.penalty === 'None' ? 'text-green-500' : 'text-amber-500')}>
                {displayData!.penalty}
              </div>
              <div className="text-[10px] text-gray-400 mt-0.5">@€{displayData!.price_per_mwh}/MWh</div>
            </div>
          </div>

          {/* Charts row */}
          <div className="grid grid-cols-2 gap-4">
            {/* Delivery chart */}
            <div className="card">
              <h3 className="text-sm font-semibold text-gray-900 mb-1">Half-Hourly Delivery</h3>
              <p className="text-xs text-gray-400 mb-3">Committed vs delivered per slot (kWh)</p>
              <div className="h-48">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={displayData!.slots} margin={{ top: 4, right: 4, left: -10, bottom: 0 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#f3f4f6" />
                    <XAxis dataKey="time" tick={{ fill: '#9ca3af', fontSize: 8 }} interval={2} />
                    <YAxis tick={{ fill: '#9ca3af', fontSize: 9 }} unit=" kWh" />
                    <Tooltip content={<DeliveryTooltip />} />
                    <Legend wrapperStyle={{ fontSize: '10px' }} />
                    <Bar dataKey="committed" name="Committed" fill="#c7d2fe" radius={[2, 2, 0, 0]} />
                    <Bar dataKey="delivered" name="Delivered" fill="#6366f1" radius={[2, 2, 0, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              </div>
            </div>

            {/* Voltage recovery chart */}
            <div className="card">
              <h3 className="text-sm font-semibold text-gray-900 mb-1">Voltage Recovery</h3>
              <p className="text-xs text-gray-400 mb-3">DT secondary voltage (pu) before vs after dispatch</p>
              <div className="h-48">
                <ResponsiveContainer width="100%" height="100%">
                  <LineChart data={displayData!.voltage_slots} margin={{ top: 4, right: 4, left: -10, bottom: 0 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#f3f4f6" />
                    <XAxis dataKey="time" tick={{ fill: '#9ca3af', fontSize: 8 }} interval={2} />
                    <YAxis
                      tick={{ fill: '#9ca3af', fontSize: 9 }}
                      domain={[0.94, 1.12]}
                      tickFormatter={v => v.toFixed(2)}
                    />
                    <Tooltip content={<VoltageTooltip />} />
                    <Legend wrapperStyle={{ fontSize: '10px' }} />
                    <ReferenceLine y={1.05} stroke="#ef4444" strokeDasharray="4 2" strokeWidth={1}
                      label={{ value: '1.05 pu limit', position: 'insideTopRight', fontSize: 8, fill: '#ef4444' }} />
                    <ReferenceLine y={0.95} stroke="#ef4444" strokeDasharray="4 2" strokeWidth={1} />
                    <Line dataKey="before" name="Before dispatch" stroke="#f87171" strokeWidth={2} dot={false} />
                    <Line dataKey="after"  name="After dispatch"  stroke="#22c55e" strokeWidth={2} dot={false} />
                  </LineChart>
                </ResponsiveContainer>
              </div>
            </div>
          </div>

          {/* Asset-level table */}
          <div className="card p-0 overflow-hidden">
            <div className="px-4 py-3 border-b border-gray-100">
              <h3 className="text-sm font-semibold text-gray-900">Asset-Level Performance</h3>
            </div>
            <table className="w-full text-sm">
              <thead className="bg-gray-50 border-b border-gray-200">
                <tr>
                  <th className="text-left text-xs text-gray-500 font-medium px-4 py-2.5">Asset</th>
                  <th className="text-left text-xs text-gray-500 font-medium px-4 py-2.5">Type</th>
                  <th className="text-right text-xs text-gray-500 font-medium px-4 py-2.5">Committed (kWh)</th>
                  <th className="text-right text-xs text-gray-500 font-medium px-4 py-2.5">Delivered (kWh)</th>
                  <th className="text-right text-xs text-gray-500 font-medium px-4 py-2.5">Delivery %</th>
                  <th className="text-center text-xs text-gray-500 font-medium px-4 py-2.5">Payment</th>
                </tr>
              </thead>
              <tbody>
                {displayData!.assets.map((a, i) => (
                  <tr key={i} className="border-t border-gray-100 hover:bg-gray-50">
                    <td className="px-4 py-2.5 text-gray-800 font-medium text-xs">{a.name}</td>
                    <td className="px-4 py-2.5 text-xs text-gray-500">{a.type}</td>
                    <td className="px-4 py-2.5 text-right font-mono text-gray-600 text-xs">{a.committed_kwh.toFixed(1)}</td>
                    <td className="px-4 py-2.5 text-right font-mono text-gray-700 text-xs font-semibold">{a.delivered_kwh.toFixed(1)}</td>
                    <td className="px-4 py-2.5 text-right">
                      <span className={clsx('font-mono text-xs font-semibold', deliveryColor(a.delivery_pct))}>
                        {a.delivery_pct.toFixed(1)}%
                      </span>
                    </td>
                    <td className="px-4 py-2.5 text-center">
                      <span className={clsx('text-[10px] font-semibold px-2 py-0.5 rounded border',
                        a.delivery_pct >= 95 ? 'bg-green-100 text-green-700 border-green-200' :
                        a.delivery_pct >= 75 ? 'bg-amber-100 text-amber-700 border-amber-200' :
                        'bg-red-100 text-red-600 border-red-200'
                      )}>
                        {a.delivery_pct >= 95 ? 'Full payment' : a.delivery_pct >= 75 ? 'Pro-rata' : 'Penalty'}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {/* Payment summary */}
          <div className={clsx(
            'rounded-xl border px-5 py-4 flex items-center gap-6',
            displayData!.delivery_pct >= 95 ? 'bg-green-50 border-green-200' :
            displayData!.delivery_pct >= 75 ? 'bg-amber-50 border-amber-200' :
            'bg-red-50 border-red-200'
          )}>
            {displayData!.delivery_pct >= 95
              ? <CheckCircle className="w-5 h-5 text-green-500 flex-shrink-0" />
              : <AlertTriangle className="w-5 h-5 text-amber-400 flex-shrink-0" />
            }
            <div className="flex-1 grid grid-cols-4 gap-4 text-xs">
              <div>
                <div className="text-gray-500">Committed</div>
                <div className="font-semibold text-gray-800 mt-0.5">{displayData!.committed_kwh} kWh</div>
              </div>
              <div>
                <div className="text-gray-500">Delivered</div>
                <div className="font-semibold text-gray-800 mt-0.5">{displayData!.curtailed_kwh} kWh</div>
              </div>
              <div>
                <div className="text-gray-500">Performance ratio</div>
                <div className={clsx('font-semibold mt-0.5', deliveryColor(displayData!.delivery_pct))}>
                  {displayData!.delivery_pct.toFixed(1)}%
                  {' · '}{displayData!.delivery_pct >= 95 ? 'Full payment' : displayData!.delivery_pct >= 75 ? 'Pro-rata payment' : 'Penalty clause'}
                </div>
              </div>
              <div>
                <div className="text-gray-500">Estimated payment</div>
                <div className="font-bold text-gray-900 mt-0.5 text-sm">€{estimatedPayment}</div>
                <div className="text-gray-400 text-[10px]">@€{displayData!.price_per_mwh}/MWh</div>
              </div>
            </div>
          </div>
        </>
      )}
    </div>
  )
}
