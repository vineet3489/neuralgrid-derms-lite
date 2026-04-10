import React, { useState, useCallback } from 'react'
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip,
  ResponsiveContainer, ReferenceLine, Cell,
} from 'recharts'
import { RefreshCw, AlertTriangle } from 'lucide-react'
import clsx from 'clsx'

const DT_LIMIT = 225

interface ForecastSlot {
  slot: number
  time: string
  totalLoad: number
  dtPct: number
  evSurge: boolean
  constraint: string | null
}

function generateForecastData(): ForecastSlot[] {
  const slots: ForecastSlot[] = []
  for (let i = 0; i < 48; i++) {
    const h = i * 0.5
    const timeH = Math.floor(h)
    const timeM = h % 1 === 0 ? '00' : '30'
    const label = `${String(timeH).padStart(2, '0')}:${timeM}`

    // Base load: two peaks, morning + evening
    const morning = 130 * Math.exp(-Math.pow(i - 16, 2) / (2 * 5 * 5))
    const evening = 160 * Math.exp(-Math.pow(i - 37, 2) / (2 * 4 * 4))
    const baseline = 60 + morning + evening + (Math.random() - 0.5) * 8

    // EV surge window: slots 36-44 (18:00-22:00)
    const isEvSurge = i >= 36 && i <= 44
    const evLoad = isEvSurge
      ? 350 * Math.exp(-Math.pow(i - 40, 2) / (2 * 3 * 3)) * (0.9 + Math.random() * 0.2)
      : 0

    const totalLoad = parseFloat((baseline + evLoad).toFixed(1))
    const dtPct = parseFloat(((totalLoad / DT_LIMIT) * 100).toFixed(1))
    const constraint = totalLoad > DT_LIMIT ? 'Branch B thermal' : null

    slots.push({ slot: i, time: label, totalLoad, dtPct, evSurge: isEvSurge, constraint })
  }
  return slots
}

const X_TICKS = [0, 4, 8, 12, 16, 20, 24, 28, 32, 36, 40, 44, 47]
const TICK_LABELS: Record<number, string> = {
  0: '00:00', 4: '02:00', 8: '04:00', 12: '06:00', 16: '08:00',
  20: '10:00', 24: '12:00', 28: '14:00', 32: '16:00', 36: '18:00',
  40: '20:00', 44: '22:00', 47: '23:30',
}

function ForecastTooltip({ active, payload, label }: any) {
  if (!active || !payload?.length) return null
  const d = payload[0]?.payload as ForecastSlot
  return (
    <div className="bg-gray-800 border border-gray-600 rounded-lg p-3 text-xs shadow-xl">
      <p className="font-semibold text-gray-200 mb-1.5">{d?.time}</p>
      <div className="flex justify-between gap-4">
        <span className="text-gray-400">DT Load</span>
        <span className="font-mono text-white">{d?.totalLoad} kW</span>
      </div>
      <div className="flex justify-between gap-4">
        <span className="text-gray-400">DT %</span>
        <span className={clsx('font-mono', (d?.dtPct ?? 0) > 100 ? 'text-red-400' : (d?.dtPct ?? 0) > 75 ? 'text-amber-400' : 'text-gray-300')}>
          {d?.dtPct}%
        </span>
      </div>
      {d?.evSurge && <div className="text-blue-400 mt-1">EV surge window</div>}
      {d?.constraint && <div className="text-red-400 mt-1">{d.constraint}</div>}
    </div>
  )
}

export default function ForecastPage() {
  const [data, setData] = useState<ForecastSlot[]>(() => generateForecastData())
  const [refreshing, setRefreshing] = useState(false)

  const handleRefresh = useCallback(async () => {
    setRefreshing(true)
    await new Promise((r) => setTimeout(r, 800))
    setData(generateForecastData())
    setRefreshing(false)
  }, [])

  const violations = data.filter(d => d.constraint !== null)
  const peakSlot = data.reduce((max, d) => d.totalLoad > max.totalLoad ? d : max, data[0])
  const constrainedWindow = data.filter(d => d.slot >= 36 && d.slot <= 44)

  return (
    <div className="space-y-4 max-w-5xl mx-auto">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-bold text-white">Look-Ahead Forecast</h1>
          <p className="text-sm text-gray-400 mt-0.5">
            DT-AUZ-001 · 48 slots · PT30M · {DT_LIMIT} kW limit
          </p>
        </div>
        <button
          onClick={handleRefresh}
          disabled={refreshing}
          className="btn-primary flex items-center gap-2 text-sm"
        >
          <RefreshCw className={clsx('w-4 h-4', refreshing && 'animate-spin')} />
          Run Look-Ahead
        </button>
      </div>

      {/* Violation banner */}
      {violations.length > 0 && (
        <div className="flex items-start gap-3 bg-red-950/20 border border-red-800/40 rounded-lg px-4 py-3">
          <AlertTriangle className="w-4 h-4 text-red-400 flex-shrink-0 mt-0.5" />
          <div>
            <p className="text-sm text-red-300 font-semibold">
              Forecast violation at {violations[0].time} — Branch B thermal overload
            </p>
            <p className="text-xs text-gray-400 mt-0.5">
              Peak {peakSlot.totalLoad.toFixed(0)} kW · {peakSlot.dtPct.toFixed(0)}% of {DT_LIMIT} kW limit ·
              {' '}{violations.length} slot{violations.length > 1 ? 's' : ''} in violation
            </p>
          </div>
        </div>
      )}

      {/* Bar chart */}
      <div className="card">
        <h3 className="text-sm font-semibold text-white mb-1">DT Total Load Forecast — 48 × PT30M Slots</h3>
        <p className="text-xs text-gray-500 mb-4">Reference line at {DT_LIMIT} kW thermal limit · EV surge window 18:00–22:00 highlighted</p>
        <div className="h-64">
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={data} margin={{ top: 5, right: 10, left: 0, bottom: 5 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="#374151" />
              <XAxis
                dataKey="slot"
                tick={{ fill: '#9ca3af', fontSize: 9 }}
                ticks={X_TICKS}
                tickFormatter={(v) => TICK_LABELS[v] || ''}
              />
              <YAxis
                tick={{ fill: '#9ca3af', fontSize: 10 }}
                unit=" kW"
                domain={[0, Math.ceil(Math.max(...data.map(d => d.totalLoad)) / 50) * 50 + 50]}
              />
              <Tooltip content={<ForecastTooltip />} />
              <ReferenceLine
                y={DT_LIMIT}
                stroke="#ef4444"
                strokeDasharray="6 3"
                strokeWidth={1.5}
                label={{ value: `${DT_LIMIT} kW limit`, position: 'insideTopRight', fontSize: 9, fill: '#ef4444' }}
              />
              <Bar dataKey="totalLoad" radius={[2, 2, 0, 0]}>
                {data.map((d) => (
                  <Cell
                    key={d.slot}
                    fill={
                      d.totalLoad > DT_LIMIT ? '#ef4444'
                      : d.evSurge ? '#f59e0b'
                      : '#6366f1'
                    }
                    opacity={d.evSurge ? 0.9 : 0.75}
                  />
                ))}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        </div>
        <div className="flex items-center gap-5 mt-2 text-[10px] text-gray-500">
          <span className="flex items-center gap-1.5"><span className="w-3 h-3 bg-indigo-500/75 rounded-sm inline-block" />Normal</span>
          <span className="flex items-center gap-1.5"><span className="w-3 h-3 bg-amber-500/90 rounded-sm inline-block" />EV surge window</span>
          <span className="flex items-center gap-1.5"><span className="w-3 h-3 bg-red-500 rounded-sm inline-block" />Thermal violation</span>
        </div>
      </div>

      {/* Constrained slots table */}
      <div className="card">
        <h3 className="text-sm font-semibold text-white mb-3">Constrained Window — 18:00–22:00</h3>
        <div className="overflow-x-auto">
          <table className="w-full text-xs">
            <thead className="border-b border-gray-700">
              <tr>
                <th className="text-left text-gray-400 font-medium pb-2 pr-6">Time</th>
                <th className="text-right text-gray-400 font-medium pb-2 pr-6">Total Load kW</th>
                <th className="text-right text-gray-400 font-medium pb-2 pr-6">DT %</th>
                <th className="text-left text-gray-400 font-medium pb-2">Constraint</th>
              </tr>
            </thead>
            <tbody>
              {constrainedWindow.map((d) => (
                <tr
                  key={d.slot}
                  className={clsx(
                    'border-t border-gray-700/50',
                    d.constraint ? 'bg-red-950/10' : ''
                  )}
                >
                  <td className="py-2 pr-6 font-mono text-gray-300">{d.time}</td>
                  <td className="py-2 pr-6 text-right font-mono">
                    <span className={clsx(
                      d.totalLoad > DT_LIMIT ? 'text-red-400 font-bold' :
                      d.evSurge ? 'text-amber-400' : 'text-gray-200'
                    )}>
                      {d.totalLoad.toFixed(0)}
                    </span>
                  </td>
                  <td className="py-2 pr-6 text-right font-mono">
                    <span className={clsx(
                      d.dtPct > 100 ? 'text-red-400 font-bold' :
                      d.dtPct > 75 ? 'text-amber-400' : 'text-gray-300'
                    )}>
                      {d.dtPct.toFixed(0)}%
                    </span>
                  </td>
                  <td className="py-2">
                    {d.constraint ? (
                      <span className="px-2 py-0.5 rounded text-[10px] bg-red-900/40 text-red-300 border border-red-800/40">
                        {d.constraint}
                      </span>
                    ) : (
                      <span className="text-gray-600">—</span>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  )
}
