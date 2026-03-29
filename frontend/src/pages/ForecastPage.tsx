import React, { useState, useCallback } from 'react'
import {
  AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip,
  Legend, ResponsiveContainer, ComposedChart, Bar, Line,
} from 'recharts'
import { RefreshCw, TrendingDown } from 'lucide-react'
import clsx from 'clsx'

interface ForecastPoint {
  slot: number
  time: string
  originalSolar: number
  adjustedSolar: number
  originalLoad: number
  adjustedLoad: number
  originalFlex: number
  adjustedFlex: number
}

function generateForecastData(): ForecastPoint[] {
  const points: ForecastPoint[] = []
  for (let i = 0; i < 48; i++) {
    const hour = i * 0.5
    const timeH = Math.floor(hour)
    const timeM = hour % 1 === 0 ? '00' : '30'
    const label = `${String(timeH).padStart(2, '0')}:${timeM}`

    // Solar bell curve peaking at slot 26 (13:00)
    const solarPeak = 420
    const solarSigma = 6.5
    const solarCenter = 26
    const solarBase = solarPeak * Math.exp(-Math.pow(i - solarCenter, 2) / (2 * solarSigma * solarSigma))
    const originalSolar = parseFloat(Math.max(0, solarBase + (Math.random() - 0.5) * 15).toFixed(1))

    // Adjusted solar: capped at 250 kW for slots 22-34 (11:00-17:00)
    const oeActive = i >= 22 && i <= 34
    const adjustedSolar = parseFloat(
      (oeActive ? Math.min(originalSolar, 250 + (Math.random() - 0.5) * 10) : originalSolar).toFixed(1)
    )

    // Load: two peaks — morning slot 16 (08:00) and evening slot 37 (18:30)
    const morningLoad = 180 * Math.exp(-Math.pow(i - 16, 2) / (2 * 4 * 4))
    const eveningLoad = 220 * Math.exp(-Math.pow(i - 37, 2) / (2 * 4 * 4))
    const baselineLoad = 60
    const originalLoad = parseFloat(
      (baselineLoad + morningLoad + eveningLoad + (Math.random() - 0.5) * 10).toFixed(1)
    )
    // During OE window: BESS charging profile shifts — draws ~18kW more from grid
    // as solar curtailment means battery can't charge from local generation
    const bessShift = oeActive ? 18 + (Math.random() - 0.5) * 6 : 0
    const adjustedLoad = parseFloat(Math.max(0, originalLoad + bessShift).toFixed(1))

    // Flex: inverse of solar — more flex when solar is high
    const originalFlex = parseFloat(
      Math.max(0, originalSolar * 0.76 + 20 + (Math.random() - 0.5) * 15).toFixed(1)
    )
    const adjustedFlex = parseFloat(
      (oeActive ? Math.min(originalFlex, 150 + (Math.random() - 0.5) * 20) : originalFlex).toFixed(1)
    )

    points.push({
      slot: i + 1,
      time: label,
      originalSolar,
      adjustedSolar,
      originalLoad,
      adjustedLoad,
      originalFlex,
      adjustedFlex,
    })
  }
  return points
}

function generateHistoricalData() {
  const days = ['Mar 15','Mar 16','Mar 17','Mar 18','Mar 19','Mar 20','Mar 21',
                 'Mar 22','Mar 23','Mar 24','Mar 25','Mar 26','Mar 27','Mar 28']
  const isWeekend = [false,false,false,false,false,true,true,false,false,false,false,false,false,false]
  return days.map((date, i) => ({
    date,
    solarActual: Math.round(320 + Math.random() * 100 + (i > 10 ? 30 : 0)),
    loadActual: Math.round(isWeekend[i] ? 140 + Math.random() * 40 : 170 + Math.random() * 60),
    flexActual: Math.round(60 + Math.random() * 140),
  }))
}

type DERStatus = 'AVAILABLE' | 'OPT_OUT' | 'CURTAILED' | 'OFFLINE'

interface DERDayStatus {
  der: string
  derShort: string
  statuses: DERStatus[]  // 14 values, one per day
}

const STATUS_COLOR: Record<DERStatus, string> = {
  AVAILABLE: '#22c55e',
  OPT_OUT: '#ef4444',
  CURTAILED: '#f59e0b',
  OFFLINE: '#6b7280',
}

const OPT_OUT_HISTORY: DERDayStatus[] = [
  { der: 'Community Solar A', derShort: 'Solar A', statuses: ['AVAILABLE','AVAILABLE','AVAILABLE','CURTAILED','AVAILABLE','AVAILABLE','AVAILABLE','CURTAILED','CURTAILED','AVAILABLE','AVAILABLE','CURTAILED','CURTAILED','CURTAILED'] },
  { der: 'Community Solar B', derShort: 'Solar B', statuses: ['AVAILABLE','AVAILABLE','OPT_OUT','OPT_OUT','AVAILABLE','AVAILABLE','AVAILABLE','AVAILABLE','CURTAILED','CURTAILED','AVAILABLE','CURTAILED','CURTAILED','CURTAILED'] },
  { der: 'Fougères BESS', derShort: 'BESS F', statuses: ['AVAILABLE','AVAILABLE','AVAILABLE','AVAILABLE','AVAILABLE','CURTAILED','AVAILABLE','AVAILABLE','AVAILABLE','CURTAILED','AVAILABLE','AVAILABLE','CURTAILED','AVAILABLE'] },
  { der: 'Croix Blanche Wind', derShort: 'Wind CB', statuses: ['AVAILABLE','OFFLINE','OFFLINE','AVAILABLE','AVAILABLE','AVAILABLE','AVAILABLE','AVAILABLE','OPT_OUT','AVAILABLE','AVAILABLE','AVAILABLE','AVAILABLE','AVAILABLE'] },
  { der: 'EV Hub CB', derShort: 'EV Hub', statuses: ['OPT_OUT','OPT_OUT','AVAILABLE','AVAILABLE','AVAILABLE','AVAILABLE','AVAILABLE','OPT_OUT','AVAILABLE','AVAILABLE','OPT_OUT','AVAILABLE','AVAILABLE','AVAILABLE'] },
  { der: 'Moulin Farm Solar', derShort: 'Solar M', statuses: ['AVAILABLE','AVAILABLE','AVAILABLE','AVAILABLE','CURTAILED','AVAILABLE','AVAILABLE','AVAILABLE','CURTAILED','AVAILABLE','AVAILABLE','CURTAILED','CURTAILED','CURTAILED'] },
  { der: 'Moulin Agri DSR', derShort: 'Agri DSR', statuses: ['AVAILABLE','AVAILABLE','AVAILABLE','OPT_OUT','AVAILABLE','AVAILABLE','AVAILABLE','AVAILABLE','AVAILABLE','OPT_OUT','AVAILABLE','AVAILABLE','CURTAILED','AVAILABLE'] },
  { der: 'ZI Est Industrial', derShort: 'ZI Ind', statuses: ['AVAILABLE','AVAILABLE','AVAILABLE','AVAILABLE','AVAILABLE','AVAILABLE','OPT_OUT','AVAILABLE','AVAILABLE','AVAILABLE','AVAILABLE','AVAILABLE','CURTAILED','CURTAILED'] },
  { der: 'Bois-Rond Solar', derShort: 'Solar BR', statuses: ['AVAILABLE','AVAILABLE','CURTAILED','AVAILABLE','CURTAILED','AVAILABLE','AVAILABLE','CURTAILED','CURTAILED','CURTAILED','CURTAILED','CURTAILED','CURTAILED','CURTAILED'] },
  { der: 'Bois-Rond BESS', derShort: 'BESS BR', statuses: ['AVAILABLE','AVAILABLE','CURTAILED','CURTAILED','AVAILABLE','CURTAILED','AVAILABLE','CURTAILED','CURTAILED','CURTAILED','CURTAILED','CURTAILED','CURTAILED','CURTAILED'] },
]

const DAY_LABELS = ['M15','M16','M17','M18','M19','M20','M21','M22','M23','M24','M25','M26','M27','M28']

const X_TICKS = [0, 4, 8, 12, 16, 20, 24, 28, 32, 36, 40, 44]
const X_TICK_LABELS: Record<number, string> = {
  0: '00:00', 4: '02:00', 8: '04:00', 12: '06:00',
  16: '08:00', 20: '10:00', 24: '12:00', 28: '14:00',
  32: '16:00', 36: '18:00', 40: '20:00', 44: '22:00',
}

function CustomTooltip({ active, payload, label }: any) {
  if (!active || !payload || !payload.length) return null
  return (
    <div className="bg-gray-800 border border-gray-600 rounded-lg p-3 text-xs shadow-xl">
      <p className="font-semibold text-gray-200 mb-2">{label}</p>
      {payload.map((entry: any) => (
        <div key={entry.dataKey} className="flex items-center justify-between gap-4">
          <span className="flex items-center gap-1.5">
            <span className="w-2.5 h-2.5 rounded-sm inline-block" style={{ background: entry.color }} />
            <span className="text-gray-300">{entry.name}</span>
          </span>
          <span className="font-mono font-medium" style={{ color: entry.color }}>
            {entry.value} kW
          </span>
        </div>
      ))}
    </div>
  )
}

interface ChartPanelProps {
  title: string
  subtitle?: string
  data: ForecastPoint[]
  origKey: keyof ForecastPoint
  adjKey: keyof ForecastPoint
  origLabel: string
  adjLabel: string
  origColor: string
  adjColor: string
  peakOrig: number
  peakAdj: number
  unit?: string
}

function ChartPanel({
  title, subtitle, data, origKey, adjKey, origLabel, adjLabel,
  origColor, adjColor, peakOrig, peakAdj, unit = 'kW',
}: ChartPanelProps) {
  const delta = peakAdj - peakOrig
  return (
    <div className="card">
      <div className="flex items-center justify-between mb-3">
        <div>
          <h3 className="text-sm font-semibold text-white">{title}</h3>
          {subtitle && <p className="text-xs text-gray-400 mt-0.5">{subtitle}</p>}
        </div>
        <div className="flex items-center gap-4">
          <div className="text-xs text-gray-400">
            Original peak: <span className="text-gray-200 font-semibold">{peakOrig} {unit}</span>
          </div>
          <div className="text-xs text-gray-400">
            Adjusted peak: <span className="text-green-300 font-semibold">{peakAdj} {unit}</span>
          </div>
          {delta !== 0 && (
            <div className={clsx('text-xs font-semibold', delta < 0 ? 'text-amber-300' : 'text-green-300')}>
              {delta > 0 ? '+' : ''}{delta} {unit}
            </div>
          )}
        </div>
      </div>
      <div className="h-56">
        <ResponsiveContainer width="100%" height="100%">
          <AreaChart data={data} margin={{ top: 5, right: 20, left: 0, bottom: 5 }}>
            <defs>
              <linearGradient id={`grad-orig-${origKey as string}`} x1="0" y1="0" x2="0" y2="1">
                <stop offset="5%" stopColor={origColor} stopOpacity={0.3} />
                <stop offset="95%" stopColor={origColor} stopOpacity={0.05} />
              </linearGradient>
              <linearGradient id={`grad-adj-${adjKey as string}`} x1="0" y1="0" x2="0" y2="1">
                <stop offset="5%" stopColor={adjColor} stopOpacity={0.4} />
                <stop offset="95%" stopColor={adjColor} stopOpacity={0.05} />
              </linearGradient>
            </defs>
            <CartesianGrid strokeDasharray="3 3" stroke="#374151" />
            <XAxis
              dataKey="slot"
              tick={{ fill: '#9ca3af', fontSize: 10 }}
              ticks={X_TICKS}
              tickFormatter={(v) => X_TICK_LABELS[v] || ''}
            />
            <YAxis tick={{ fill: '#9ca3af', fontSize: 11 }} />
            <Tooltip content={<CustomTooltip />} />
            <Legend
              wrapperStyle={{ fontSize: 11, paddingTop: 8 }}
              formatter={(value) => <span style={{ color: '#d1d5db' }}>{value}</span>}
            />
            <Area
              type="monotone"
              dataKey={origKey as string}
              name={origLabel}
              stroke={origColor}
              strokeWidth={1.5}
              strokeDasharray="4 2"
              fill={`url(#grad-orig-${origKey as string})`}
            />
            <Area
              type="monotone"
              dataKey={adjKey as string}
              name={adjLabel}
              stroke={adjColor}
              strokeWidth={2}
              fill={`url(#grad-adj-${adjKey as string})`}
            />
          </AreaChart>
        </ResponsiveContainer>
      </div>
    </div>
  )
}

export default function ForecastPage() {
  const [data, setData] = useState<ForecastPoint[]>(() => generateForecastData())
  const [historicalData] = useState(() => generateHistoricalData())
  const [refreshing, setRefreshing] = useState(false)

  const handleRefresh = useCallback(async () => {
    setRefreshing(true)
    await new Promise((r) => setTimeout(r, 800))
    setData(generateForecastData())
    setRefreshing(false)
  }, [])

  const handleRecalculate = useCallback(async () => {
    setRefreshing(true)
    await new Promise((r) => setTimeout(r, 1200))
    setData(generateForecastData())
    setRefreshing(false)
  }, [])

  const peakOrigSolar = Math.max(...data.map((d) => d.originalSolar))
  const peakAdjSolar = Math.max(...data.map((d) => d.adjustedSolar))
  const peakOrigLoad = Math.max(...data.map((d) => d.originalLoad))
  const peakAdjLoad = Math.max(...data.map((d) => d.adjustedLoad))
  const peakOrigFlex = Math.max(...data.map((d) => d.originalFlex))
  const peakAdjFlex = Math.max(...data.map((d) => d.adjustedFlex))

  const curtailmentKw = parseFloat((peakOrigSolar - peakAdjSolar).toFixed(1))
  const curtailmentPct = parseFloat(((curtailmentKw / peakOrigSolar) * 100).toFixed(1))

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-bold text-white">Forecasting</h1>
          <p className="text-sm text-gray-400 mt-0.5">Baseline vs OE-adjusted 24-hour forecast · Auzance EST circuit</p>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={handleRefresh}
            disabled={refreshing}
            className="btn-secondary flex items-center gap-2 text-sm"
          >
            <RefreshCw className={clsx('w-4 h-4', refreshing && 'animate-spin')} />
            Refresh
          </button>
          <button
            onClick={handleRecalculate}
            disabled={refreshing}
            className="btn-primary flex items-center gap-2 text-sm"
          >
            <TrendingDown className="w-4 h-4" />
            Recalculate Adjusted Forecast
          </button>
        </div>
      </div>

      {/* Summary stats */}
      <div className="grid grid-cols-6 gap-3">
        <div className="card text-center">
          <div className="text-xs text-gray-400 mb-1">Original Peak Solar</div>
          <div className="text-lg font-bold text-blue-300">{peakOrigSolar.toFixed(0)} kW</div>
        </div>
        <div className="card text-center">
          <div className="text-xs text-gray-400 mb-1">Adjusted Peak Solar</div>
          <div className="text-lg font-bold text-green-300">{peakAdjSolar.toFixed(0)} kW</div>
        </div>
        <div className="card text-center">
          <div className="text-xs text-gray-400 mb-1">Curtailment Applied</div>
          <div className="text-lg font-bold text-amber-300">{curtailmentKw} kW</div>
          <div className="text-xs text-amber-400">({curtailmentPct}%)</div>
        </div>
        <div className="card text-center">
          <div className="text-xs text-gray-400 mb-1">Voltage Improvement</div>
          <div className="text-sm font-bold text-green-300">1.091 → 1.044 pu</div>
          <div className="text-xs text-gray-500">estimated</div>
        </div>
        <div className="card text-center">
          <div className="text-xs text-gray-400 mb-1">OE Active Window</div>
          <div className="text-sm font-bold text-indigo-300">11:00–17:00</div>
          <div className="text-xs text-gray-500">6 hours</div>
        </div>
        <div className="bg-gray-800/60 rounded-lg p-3">
          <div className="text-xs text-gray-400">Load Increase (BESS shift)</div>
          <div className="text-lg font-bold text-amber-400">+18 kW</div>
          <div className="text-xs text-gray-500 mt-0.5">Grid draw during OE window</div>
        </div>
      </div>

      {/* 14-Day Historical Actuals */}
      <div className="card">
        <h3 className="text-sm font-semibold text-white mb-1">14-Day Historical Actuals</h3>
        <p className="text-xs text-gray-500 mb-4">Daily peak values — solar generation, load demand, flex dispatched</p>
        <div className="h-52">
          <ResponsiveContainer width="100%" height="100%">
            <ComposedChart data={historicalData} margin={{ top: 5, right: 20, left: 0, bottom: 5 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="#374151" />
              <XAxis dataKey="date" tick={{ fill: '#9ca3af', fontSize: 10 }} />
              <YAxis tick={{ fill: '#9ca3af', fontSize: 10 }} unit=" kW" />
              <Tooltip contentStyle={{ background: '#1f2937', border: '1px solid #374151', borderRadius: 8, fontSize: 11 }} />
              <Legend wrapperStyle={{ fontSize: 11, color: '#9ca3af' }} />
              <Bar dataKey="solarActual" name="Solar Peak kW" fill="#eab308" opacity={0.8} radius={[2,2,0,0]} />
              <Bar dataKey="loadActual" name="Load Peak kW" fill="#6366f1" opacity={0.8} radius={[2,2,0,0]} />
              <Line type="monotone" dataKey="flexActual" name="Flex Dispatched kW" stroke="#10b981" strokeWidth={2} dot={{ r: 3 }} />
            </ComposedChart>
          </ResponsiveContainer>
        </div>
      </div>

      {/* Charts */}
      <ChartPanel
        title="Solar Generation Forecast"
        data={data}
        origKey="originalSolar"
        adjKey="adjustedSolar"
        origLabel="Original Forecast"
        adjLabel="Adjusted (OE Constrained)"
        origColor="#6366f1"
        adjColor="#eab308"
        peakOrig={parseFloat(peakOrigSolar.toFixed(1))}
        peakAdj={parseFloat(peakAdjSolar.toFixed(1))}
      />

      <ChartPanel
        title="Load Demand Forecast"
        subtitle="Adjusted load increases ~18 kW during OE window as BESS charging shifts from local solar to grid import"
        data={data}
        origKey="originalLoad"
        adjKey="adjustedLoad"
        origLabel="Original Load"
        adjLabel="Adjusted Load"
        origColor="#6b7280"
        adjColor="#22d3ee"
        peakOrig={parseFloat(peakOrigLoad.toFixed(1))}
        peakAdj={parseFloat(peakAdjLoad.toFixed(1))}
      />

      <ChartPanel
        title="Flex Availability Forecast"
        data={data}
        origKey="originalFlex"
        adjKey="adjustedFlex"
        origLabel="Original Flex Available"
        adjLabel="Adjusted Flex (Post-OE)"
        origColor="#a855f7"
        adjColor="#22c55e"
        peakOrig={parseFloat(peakOrigFlex.toFixed(1))}
        peakAdj={parseFloat(peakAdjFlex.toFixed(1))}
      />

      {/* DER Availability & Opt-out History */}
      <div className="card">
        <h3 className="text-sm font-semibold text-white mb-1">DER Availability &amp; Opt-out History</h3>
        <p className="text-xs text-gray-500 mb-4">14-day availability per DER — Mar 15 to Mar 28</p>

        {/* Header row — day labels */}
        <div className="flex items-center gap-1 mb-1 ml-20">
          {DAY_LABELS.map(d => (
            <div key={d} className="flex-1 text-center text-[9px] text-gray-500 font-mono">{d}</div>
          ))}
        </div>

        {/* DER rows */}
        <div className="space-y-1">
          {OPT_OUT_HISTORY.map(row => (
            <div key={row.der} className="flex items-center gap-1">
              <div className="w-20 flex-shrink-0 text-[10px] text-gray-400 text-right pr-2 truncate">{row.derShort}</div>
              {row.statuses.map((status, i) => (
                <div
                  key={i}
                  className="flex-1 h-5 rounded-sm cursor-default"
                  style={{ background: STATUS_COLOR[status], opacity: 0.85 }}
                  title={`${row.der} · ${DAY_LABELS[i]} · ${status}`}
                />
              ))}
            </div>
          ))}
        </div>

        {/* Legend */}
        <div className="flex items-center gap-4 mt-3">
          {(Object.entries(STATUS_COLOR) as [DERStatus, string][]).map(([status, color]) => (
            <div key={status} className="flex items-center gap-1.5">
              <div className="w-3 h-3 rounded-sm" style={{ background: color }} />
              <span className="text-xs text-gray-400">{status.replace('_', ' ')}</span>
            </div>
          ))}
        </div>

        {/* Summary stats */}
        <div className="mt-3 pt-3 border-t border-gray-700 grid grid-cols-4 gap-3">
          {(['AVAILABLE','OPT_OUT','CURTAILED','OFFLINE'] as DERStatus[]).map(status => {
            const count = OPT_OUT_HISTORY.flatMap(r => r.statuses).filter(s => s === status).length
            const pct = ((count / (OPT_OUT_HISTORY.length * 14)) * 100).toFixed(0)
            return (
              <div key={status} className="text-center">
                <div className="text-sm font-bold" style={{ color: STATUS_COLOR[status] }}>{pct}%</div>
                <div className="text-xs text-gray-500">{status.replace('_',' ')}</div>
              </div>
            )
          })}
        </div>
      </div>
    </div>
  )
}
