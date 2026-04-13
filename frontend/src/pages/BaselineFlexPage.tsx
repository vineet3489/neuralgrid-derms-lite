import React from 'react'
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip,
  ResponsiveContainer, ReferenceLine, Legend,
} from 'recharts'
import clsx from 'clsx'

// ─── Static settlement data (DERIM v4 Section 7.3) ───────────────────────────

const SLOTS = [
  {
    slot: '19:00–19:30',
    baseline: 59.5,
    actual: 22.0,
    delivered: 37.5,
    committed: 35.0,
    perf: 107,
    payment: 4.50,
    status: 'over',
  },
  {
    slot: '19:30–20:00',
    baseline: 61.2,
    actual: 24.1,
    delivered: 37.1,
    committed: 35.0,
    perf: 106,
    payment: 4.45,
    status: 'over',
  },
  {
    slot: '20:00–20:30',
    baseline: 58.8,
    actual: 30.5,
    delivered: 28.3,
    committed: 35.0,
    perf: 81,
    payment: 3.40,
    status: 'partial',
  },
  {
    slot: '20:30–21:00',
    baseline: 55.0,
    actual: 42.0,
    delivered: 13.0,
    committed: 35.0,
    perf: 37,
    payment: 0.00,
    status: 'under',
  },
]

const TOTALS = {
  baseline: 234.5,
  actual: 118.6,
  delivered: 115.9,
  committed: 140.0,
  perf: 82.8,
  payment: 13.91,
}

// Chart data
const CHART_DATA = SLOTS.map((s) => ({
  slot: s.slot.slice(0, 5), // just start time
  baseline: s.baseline,
  actual: s.actual,
  committed: s.committed,
}))

function KpiCard({ label, value, sub, color }: { label: string; value: string; sub?: string; color: string }) {
  return (
    <div className="card py-4 text-center">
      <div className="text-xs text-gray-500 mb-1">{label}</div>
      <div className={clsx('text-2xl font-bold', color)}>{value}</div>
      {sub && <div className="text-[10px] text-gray-500 mt-0.5">{sub}</div>}
    </div>
  )
}

function statusBadge(status: string) {
  if (status === 'over') return (
    <span className="inline-flex items-center gap-1 text-[10px] px-2 py-0.5 rounded border bg-green-50 text-green-700 border-green-200">
      ✓ Over-delivered
    </span>
  )
  if (status === 'partial') return (
    <span className="inline-flex items-center gap-1 text-[10px] px-2 py-0.5 rounded border bg-amber-50 text-amber-700 border-amber-200">
      ⚡ Partial
    </span>
  )
  return (
    <span className="inline-flex items-center gap-1 text-[10px] px-2 py-0.5 rounded border bg-red-50 text-red-600 border-red-200">
      ✗ Under-delivered
    </span>
  )
}

function SettlementTooltip({ active, payload, label }: any) {
  if (!active || !payload?.length) return null
  return (
    <div className="bg-white border border-gray-200 rounded-lg p-3 text-xs shadow-xl">
      <p className="font-semibold text-gray-900 mb-2">{label}</p>
      {payload.map((p: any) => (
        <div key={p.dataKey} className="flex justify-between gap-4">
          <span className="flex items-center gap-1.5">
            <span className="w-2 h-2 rounded-sm inline-block" style={{ background: p.color }} />
            <span className="text-gray-700">{p.name}</span>
          </span>
          <span className="font-mono" style={{ color: p.color }}>{p.value} kWh</span>
        </div>
      ))}
    </div>
  )
}

export default function BaselineFlexPage() {
  return (
    <div className="space-y-5 max-w-5xl mx-auto">
      {/* Header */}
      <div>
        <h1 className="text-xl font-bold text-gray-900">Settlement</h1>
        <p className="text-sm text-gray-500 mt-0.5">
          EVT-AUZ-001 · Branch B Thermal Activation · 19:00–21:00
        </p>
      </div>

      {/* KPI cards */}
      <div className="grid grid-cols-4 gap-4">
        <KpiCard
          label="Committed"
          value={`${TOTALS.committed.toFixed(1)} kWh`}
          sub="140 kW × 1h = 140 kWh"
          color="text-indigo-500"
        />
        <KpiCard
          label="Delivered"
          value={`${TOTALS.delivered.toFixed(1)} kWh`}
          sub="Across 4 × PT30M slots"
          color="text-green-500"
        />
        <KpiCard
          label="Performance"
          value={`${TOTALS.perf.toFixed(1)}%`}
          sub="Target ≥ 80%"
          color={TOTALS.perf >= 80 ? 'text-amber-500' : 'text-red-500'}
        />
        <KpiCard
          label="Net Payment"
          value={`€${TOTALS.payment.toFixed(2)}`}
          sub="€85/MWh × 0.1635 MWh"
          color="text-green-500"
        />
      </div>

      {/* Chart */}
      <div className="card">
        <h3 className="text-sm font-semibold text-gray-900 mb-1">Baseline vs Actual per Slot</h3>
        <p className="text-xs text-gray-500 mb-4">D4G Baseline (blue) vs Actual Metered (green) · Committed 35 kWh/slot reference</p>
        <div className="h-56">
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={CHART_DATA} margin={{ top: 5, right: 20, left: 0, bottom: 5 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" />
              <XAxis dataKey="slot" tick={{ fill: '#6b7280', fontSize: 10 }} />
              <YAxis tick={{ fill: '#6b7280', fontSize: 10 }} unit=" kWh" />
              <Tooltip content={<SettlementTooltip />} />
              <Legend wrapperStyle={{ fontSize: 11, color: '#6b7280' }} />
              <ReferenceLine
                y={35}
                stroke="#a78bfa"
                strokeDasharray="4 2"
                strokeWidth={1.5}
                label={{ value: 'Committed 35 kWh', position: 'insideTopRight', fontSize: 9, fill: '#a78bfa' }}
              />
              <Bar dataKey="baseline" name="D4G Baseline" fill="#3b82f6" opacity={0.8} radius={[2, 2, 0, 0]} />
              <Bar dataKey="actual" name="Actual Metered" fill="#22c55e" opacity={0.85} radius={[2, 2, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </div>
      </div>

      {/* Slot performance table */}
      <div className="card">
        <h3 className="text-sm font-semibold text-gray-900 mb-3">Slot Performance</h3>
        <div className="overflow-x-auto">
          <table className="w-full text-xs">
            <thead className="border-b border-gray-200">
              <tr>
                <th className="text-left text-gray-500 font-medium pb-2 pr-4">Slot</th>
                <th className="text-right text-gray-500 font-medium pb-2 pr-4">Baseline kWh</th>
                <th className="text-right text-gray-500 font-medium pb-2 pr-4">Actual kWh</th>
                <th className="text-right text-gray-500 font-medium pb-2 pr-4">Delivered kWh</th>
                <th className="text-right text-gray-500 font-medium pb-2 pr-4">Committed kWh</th>
                <th className="text-right text-gray-500 font-medium pb-2 pr-4">Perf %</th>
                <th className="text-right text-gray-500 font-medium pb-2 pr-4">Payment</th>
                <th className="text-left text-gray-500 font-medium pb-2">Status</th>
              </tr>
            </thead>
            <tbody>
              {SLOTS.map((s, i) => (
                <tr
                  key={i}
                  className={clsx(
                    'border-t border-gray-200',
                    s.status === 'over' ? 'bg-green-50' :
                    s.status === 'partial' ? 'bg-amber-50' :
                    'bg-red-50'
                  )}
                >
                  <td className="py-2.5 pr-4 font-mono text-gray-700">{s.slot}</td>
                  <td className="py-2.5 pr-4 text-right font-mono text-gray-500">{s.baseline.toFixed(1)}</td>
                  <td className="py-2.5 pr-4 text-right font-mono text-gray-500">{s.actual.toFixed(1)}</td>
                  <td className="py-2.5 pr-4 text-right font-mono text-green-600 font-medium">{s.delivered.toFixed(1)}</td>
                  <td className="py-2.5 pr-4 text-right font-mono text-gray-500">{s.committed.toFixed(1)}</td>
                  <td className="py-2.5 pr-4 text-right font-mono">
                    <span className={clsx(
                      s.perf >= 100 ? 'text-green-500' :
                      s.perf >= 80 ? 'text-amber-500' : 'text-red-500'
                    )}>
                      {s.perf}%
                    </span>
                  </td>
                  <td className="py-2.5 pr-4 text-right font-mono text-green-600">€{s.payment.toFixed(2)}</td>
                  <td className="py-2.5">{statusBadge(s.status)}</td>
                </tr>
              ))}
              {/* Total row */}
              <tr className="border-t-2 border-gray-300 bg-gray-100">
                <td className="py-2.5 pr-4 text-gray-900 font-semibold">TOTAL</td>
                <td className="py-2.5 pr-4 text-right font-mono font-semibold text-gray-800">{TOTALS.baseline.toFixed(1)}</td>
                <td className="py-2.5 pr-4 text-right font-mono font-semibold text-gray-800">{TOTALS.actual.toFixed(1)}</td>
                <td className="py-2.5 pr-4 text-right font-mono font-semibold text-green-600">{TOTALS.delivered.toFixed(1)}</td>
                <td className="py-2.5 pr-4 text-right font-mono font-semibold text-gray-800">{TOTALS.committed.toFixed(1)}</td>
                <td className="py-2.5 pr-4 text-right font-mono font-semibold text-amber-500">{TOTALS.perf.toFixed(1)}%</td>
                <td className="py-2.5 pr-4 text-right font-mono font-semibold text-green-600">€{TOTALS.payment.toFixed(2)}</td>
                <td className="py-2.5" />
              </tr>
            </tbody>
          </table>
        </div>

        <p className="text-xs text-gray-500 mt-3 pt-3 border-t border-gray-200">
          Slot 4 under-delivery: EV session ended early — vehicle disconnected before window end.
        </p>
      </div>
    </div>
  )
}
