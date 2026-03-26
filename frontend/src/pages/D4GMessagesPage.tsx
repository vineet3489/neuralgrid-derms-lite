import React, { useState } from 'react'
import {
  ArrowDownLeft, ArrowUpRight, CheckCircle2, Clock, AlertTriangle,
  ChevronDown, BarChart2, Zap,
} from 'lucide-react'
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip,
  ResponsiveContainer, Legend, ReferenceLine,
} from 'recharts'
import clsx from 'clsx'

// ─── Message thread data ──────────────────────────────────────────────────────

type MsgDirection = 'outbound' | 'inbound'
type MsgStatus = 'sent' | 'received' | 'acknowledged' | 'pending'

interface D4GMessage {
  id: string
  direction: MsgDirection
  type: string
  typeLabel: string
  timestamp: string
  status: MsgStatus
  summary: string
  payload: object
}

const MESSAGE_THREAD: D4GMessage[] = [
  {
    id: 'MSG-001',
    direction: 'outbound',
    type: 'OperatingEnvelope_MarketDocument',
    typeLabel: 'Operating Envelope',
    timestamp: '14:32:01',
    status: 'sent',
    summary: 'OE sent for DT-AUZ-005 · Export cap 120 kW · 48 slots · 11:00–17:00',
    payload: {
      mRID: 'OE-DT-AUZ-005-20260326T143201',
      type: 'A44',
      standard: 'IEC 62746-4',
      receiver: 'd4g-aggregator-auzance',
      slots: 48,
      resolution: 'PT30M',
      export_cap_kw: 120,
      import_cap_kw: 50,
      window: '11:00–17:00',
    },
  },
  {
    id: 'MSG-002',
    direction: 'inbound',
    type: 'BaselineNotification_MarketDocument',
    typeLabel: 'Baseline Report',
    timestamp: '14:32:04',
    status: 'received',
    summary: 'D4G reports current baseline: Bois-Rond Solar 285.6 kW · BESS 142.8 kW (charging)',
    payload: {
      mRID: 'BL-D4G-AUZ-20260326T143204',
      correlationID: 'OE-DT-AUZ-005-20260326T143201',
      type: 'BaselineNotification',
      standard: 'IEC 62746-4',
      reportedAt: '14:32:04',
      assets: [
        { assetID: 'AST-AUZ-009', name: 'Bois-Rond Solar Farm', baseline_kw: 285.6, method: 'HIGH_5_OF_10' },
        { assetID: 'AST-AUZ-010', name: 'Bois-Rond BESS', baseline_kw: -142.8, method: 'SMART_BASELINE', soc_pct: 89 },
      ],
    },
  },
  {
    id: 'MSG-003',
    direction: 'inbound',
    type: 'FlexOffer_MarketDocument',
    typeLabel: 'Flex Availability',
    timestamp: '14:32:06',
    status: 'received',
    summary: 'D4G offers 240 kW flex · Solar curtail 165 kW · BESS reduce 75 kW',
    payload: {
      mRID: 'FO-D4G-AUZ-20260326T143206',
      correlationID: 'OE-DT-AUZ-005-20260326T143201',
      type: 'ReserveBidMarketDocument',
      standard: 'IEC 62325-301 A26',
      totalFlex_kw: 240,
      assets: [
        { assetID: 'AST-AUZ-009', name: 'Bois-Rond Solar Farm', availableFlex_kw: 165, currentGen_kw: 285.6, canCurtailTo_kw: 120, responseTime_min: 2 },
        { assetID: 'AST-AUZ-010', name: 'Bois-Rond BESS', availableFlex_kw: 75, currentGen_kw: 142.8, canCurtailTo_kw: 67.8, responseTime_min: 1 },
      ],
    },
  },
  {
    id: 'MSG-004',
    direction: 'inbound',
    type: 'DERGroupStatus_MarketDocument',
    typeLabel: 'Acknowledgement',
    timestamp: '14:32:09',
    status: 'acknowledged',
    summary: 'D4G acknowledges OE · All assets notified · Curtailment will begin at 11:00',
    payload: {
      mRID: 'ACK-D4G-AUZ-20260326T143209',
      correlationID: 'OE-DT-AUZ-005-20260326T143201',
      status: 'ACKNOWLEDGED',
      committedCurtailment_kw: 240,
      scheduledStart: '11:00',
      assets: [
        { assetID: 'AST-AUZ-009', status: 'NOTIFIED', committedLimit_kw: 120 },
        { assetID: 'AST-AUZ-010', status: 'NOTIFIED', committedLimit_kw: 67.8 },
      ],
    },
  },
  {
    id: 'MSG-005',
    direction: 'inbound',
    type: 'Telemetry_15min',
    typeLabel: 'Telemetry (11:00)',
    timestamp: '11:00:32',
    status: 'received',
    summary: 'Event started · Solar 118.4 kW ✓ · BESS 65.2 kW ✓ · Voltage recovering 1.091→1.052 pu',
    payload: {
      timestamp: '11:00:32',
      eventRef: 'EVT-AUZ-001',
      assets: [
        { assetID: 'AST-AUZ-009', current_kw: 118.4, target_kw: 120, voltage_pu: 1.052, withinDOE: true },
        { assetID: 'AST-AUZ-010', current_kw: 65.2, target_kw: 67.8, voltage_pu: 1.049, withinDOE: true },
      ],
      dtVoltage_pu: 1.048,
      dtLoading_pct: 62,
    },
  },
  {
    id: 'MSG-006',
    direction: 'inbound',
    type: 'Telemetry_15min',
    typeLabel: 'Telemetry (11:15)',
    timestamp: '11:15:31',
    status: 'received',
    summary: 'Mid-event telemetry · Solar 121.8 kW (slightly over) · BESS 66.9 kW ✓',
    payload: {
      timestamp: '11:15:31',
      assets: [
        { assetID: 'AST-AUZ-009', current_kw: 121.8, target_kw: 120, voltage_pu: 1.054, withinDOE: false, note: 'Marginally over by 1.8 kW' },
        { assetID: 'AST-AUZ-010', current_kw: 66.9, target_kw: 67.8, voltage_pu: 1.051, withinDOE: true },
      ],
      dtVoltage_pu: 1.051,
      dtLoading_pct: 64,
    },
  },
  {
    id: 'MSG-007',
    direction: 'inbound',
    type: 'PerformanceReport_MarketDocument',
    typeLabel: 'Performance Report',
    timestamp: '17:02:14',
    status: 'received',
    summary: 'Event complete · 360 min · Avg delivery 96.4% · 144 kWh curtailed · Penalty: 0',
    payload: {
      mRID: 'PR-D4G-AUZ-20260326T170214',
      eventRef: 'EVT-AUZ-001',
      eventWindow: '11:00–17:00',
      durationMin: 360,
      totalCurtailed_kWh: 144.2,
      committed_kWh: 149.6,
      deliveryPct: 96.4,
      penalty: 'NONE',
      assets: [
        { assetID: 'AST-AUZ-009', committed_kWh: 99.0, delivered_kWh: 95.8, deliveryPct: 96.8 },
        { assetID: 'AST-AUZ-010', committed_kWh: 50.6, delivered_kWh: 48.4, deliveryPct: 95.7 },
      ],
    },
  },
  {
    id: 'MSG-008',
    direction: 'outbound',
    type: 'SettlementAck_MarketDocument',
    typeLabel: 'Settlement Acknowledgement',
    timestamp: '17:05:00',
    status: 'sent',
    summary: 'DSO acknowledges performance · Payment will be processed · 96.4% delivery confirmed',
    payload: {
      mRID: 'SA-DERMS-AUZ-20260326T170500',
      correlationID: 'PR-D4G-AUZ-20260326T170214',
      deliveryConfirmed_pct: 96.4,
      curtailment_kWh: 144.2,
      availabilityPayment: 'Pending settlement calculation',
      utilisationPayment: 'Pending settlement calculation',
      penalty: 0,
    },
  },
]

// ─── Performance data ─────────────────────────────────────────────────────────

const PERFORMANCE_DATA = [
  { slot: '11:00', committed: 187.8, delivered: 183.6, voltage: 1.048 },
  { slot: '11:30', committed: 187.8, delivered: 188.7, voltage: 1.051 },
  { slot: '12:00', committed: 187.8, delivered: 185.2, voltage: 1.049 },
  { slot: '12:30', committed: 187.8, delivered: 190.1, voltage: 1.052 },
  { slot: '13:00', committed: 187.8, delivered: 184.9, voltage: 1.050 },
  { slot: '13:30', committed: 187.8, delivered: 179.3, voltage: 1.047 },
  { slot: '14:00', committed: 187.8, delivered: 186.2, voltage: 1.049 },
  { slot: '14:30', committed: 187.8, delivered: 191.4, voltage: 1.053 },
  { slot: '15:00', committed: 187.8, delivered: 185.8, voltage: 1.048 },
  { slot: '15:30', committed: 187.8, delivered: 182.1, voltage: 1.046 },
  { slot: '16:00', committed: 187.8, delivered: 188.3, voltage: 1.050 },
  { slot: '16:30', committed: 187.8, delivered: 183.9, voltage: 1.047 },
]

const ASSET_PERFORMANCE = [
  { name: 'Bois-Rond Solar', committed: 99.0, delivered: 95.8, pct: 96.8 },
  { name: 'Bois-Rond BESS', committed: 50.6, delivered: 48.4, pct: 95.7 },
]

// ─── Helpers ─────────────────────────────────────────────────────────────────

const MSG_TYPE_COLOR: Record<string, string> = {
  'Operating Envelope':          'bg-indigo-900/50 text-indigo-300 border-indigo-700/40',
  'Baseline Report':             'bg-blue-900/50 text-blue-300 border-blue-700/40',
  'Flex Availability':           'bg-teal-900/50 text-teal-300 border-teal-700/40',
  'Acknowledgement':             'bg-green-900/50 text-green-300 border-green-700/40',
  'Telemetry (11:00)':           'bg-gray-800 text-gray-300 border-gray-700',
  'Telemetry (11:15)':           'bg-gray-800 text-gray-300 border-gray-700',
  'Performance Report':          'bg-amber-900/50 text-amber-300 border-amber-700/40',
  'Settlement Acknowledgement':  'bg-purple-900/50 text-purple-300 border-purple-700/40',
}

function JsonHighlight({ json }: { json: unknown }) {
  const text = JSON.stringify(json, null, 2)
  const highlighted = text.replace(
    /("(\\u[a-zA-Z0-9]{4}|\\[^u]|[^\\"])*"(\s*:)?|\b(true|false|null)\b|-?\d+(?:\.\d*)?(?:[eE][+\-]?\d+)?)/g,
    (match) => {
      if (/^"/.test(match)) {
        if (/:$/.test(match)) return `<span class="text-blue-400">${match}</span>`
        return `<span class="text-green-400">${match}</span>`
      }
      if (/true|false/.test(match)) return `<span class="text-purple-400">${match}</span>`
      if (/null/.test(match)) return `<span class="text-red-400">${match}</span>`
      return `<span class="text-amber-400">${match}</span>`
    },
  )
  return (
    <pre
      className="text-xs font-mono leading-relaxed whitespace-pre-wrap break-all text-gray-300"
      dangerouslySetInnerHTML={{ __html: highlighted }}
    />
  )
}

// ─── Main page ────────────────────────────────────────────────────────────────

export default function D4GMessagesPage() {
  const [expandedId, setExpandedId] = useState<string | null>(null)
  const [activeView, setActiveView] = useState<'thread' | 'performance'>('thread')

  const totalDelivered = ASSET_PERFORMANCE.reduce((s, a) => s + a.delivered, 0)
  const totalCommitted = ASSET_PERFORMANCE.reduce((s, a) => s + a.committed, 0)
  const overallPct = ((totalDelivered / totalCommitted) * 100).toFixed(1)

  return (
    <div className="space-y-5 max-w-5xl mx-auto">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-bold text-white">D4G Message Exchange</h1>
          <p className="text-sm text-gray-400 mt-0.5">
            Protocol message thread between DSO and DER Aggregator · Event EVT-AUZ-001 · DT-AUZ-005
          </p>
        </div>
        <div className="flex gap-1 bg-gray-800 rounded-lg p-1">
          <button
            onClick={() => setActiveView('thread')}
            className={clsx('px-3 py-1.5 rounded text-xs font-medium transition-colors flex items-center gap-1.5',
              activeView === 'thread' ? 'bg-indigo-600 text-white' : 'text-gray-400 hover:text-gray-200')}
          >
            <ArrowDownLeft className="w-3.5 h-3.5" />
            Message Thread
          </button>
          <button
            onClick={() => setActiveView('performance')}
            className={clsx('px-3 py-1.5 rounded text-xs font-medium transition-colors flex items-center gap-1.5',
              activeView === 'performance' ? 'bg-indigo-600 text-white' : 'text-gray-400 hover:text-gray-200')}
          >
            <BarChart2 className="w-3.5 h-3.5" />
            Performance
          </button>
        </div>
      </div>

      {/* ── Message Thread view ──────────────────────────────────────────────── */}
      {activeView === 'thread' && (
        <>
          {/* Lifecycle legend */}
          <div className="card py-3">
            <div className="flex items-center gap-0 overflow-x-auto">
              {[
                { label: 'OE Sent', color: 'bg-indigo-500', active: true },
                { label: 'Baseline', color: 'bg-blue-500', active: true },
                { label: 'Flex Offer', color: 'bg-teal-500', active: true },
                { label: 'Acknowledged', color: 'bg-green-500', active: true },
                { label: 'Telemetry', color: 'bg-gray-500', active: true },
                { label: 'Performance', color: 'bg-amber-500', active: true },
                { label: 'Settlement', color: 'bg-purple-500', active: true },
              ].map((step, i, arr) => (
                <React.Fragment key={step.label}>
                  <div className="flex flex-col items-center flex-shrink-0">
                    <div className={clsx('w-3 h-3 rounded-full', step.color)} />
                    <span className="text-[10px] text-gray-400 mt-1 whitespace-nowrap">{step.label}</span>
                  </div>
                  {i < arr.length - 1 && (
                    <div className="flex-1 h-px bg-gray-700 mx-2 mb-4 min-w-[20px]" />
                  )}
                </React.Fragment>
              ))}
            </div>
          </div>

          {/* Message list */}
          <div className="space-y-2">
            {MESSAGE_THREAD.map((msg) => {
              const isExpanded = expandedId === msg.id
              const tagCls = MSG_TYPE_COLOR[msg.typeLabel] || 'bg-gray-800 text-gray-300 border-gray-700'
              const isInbound = msg.direction === 'inbound'

              return (
                <div
                  key={msg.id}
                  className={clsx(
                    'rounded-xl border transition-all',
                    isInbound ? 'border-gray-700/60 bg-gray-800/40' : 'border-indigo-900/40 bg-indigo-950/30',
                  )}
                >
                  {/* Header row */}
                  <div
                    className="flex items-start gap-3 p-3.5 cursor-pointer"
                    onClick={() => setExpandedId(isExpanded ? null : msg.id)}
                  >
                    {/* Direction indicator */}
                    <div className={clsx(
                      'w-7 h-7 rounded-full flex items-center justify-center flex-shrink-0 mt-0.5',
                      isInbound ? 'bg-teal-900/60' : 'bg-indigo-900/60'
                    )}>
                      {isInbound
                        ? <ArrowDownLeft className="w-3.5 h-3.5 text-teal-400" />
                        : <ArrowUpRight className="w-3.5 h-3.5 text-indigo-400" />
                      }
                    </div>

                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className={clsx(
                          'inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-semibold border',
                          tagCls
                        )}>
                          {msg.typeLabel}
                        </span>
                        <span className="text-xs text-gray-500 font-mono">{msg.timestamp}</span>
                        <span className={clsx(
                          'text-[10px] px-1.5 py-0.5 rounded font-medium',
                          msg.status === 'acknowledged' ? 'bg-green-900/40 text-green-400'
                          : msg.status === 'sent' ? 'bg-indigo-900/40 text-indigo-400'
                          : 'bg-gray-800 text-gray-400'
                        )}>
                          {msg.status.toUpperCase()}
                        </span>
                        <span className="text-[10px] text-gray-600 font-mono ml-auto truncate hidden sm:block">
                          {isInbound ? 'D4G → DSO' : 'DSO → D4G'} · {msg.type}
                        </span>
                      </div>
                      <p className="text-xs text-gray-300 mt-1 leading-relaxed">{msg.summary}</p>
                    </div>

                    <ChevronDown className={clsx(
                      'w-4 h-4 text-gray-500 flex-shrink-0 transition-transform mt-1',
                      isExpanded && 'rotate-180'
                    )} />
                  </div>

                  {/* Expanded payload */}
                  {isExpanded && (
                    <div className="border-t border-gray-700/50 mx-3.5 mb-3.5 pt-3">
                      <div className="text-[10px] text-gray-500 mb-1.5 font-medium uppercase tracking-wide">
                        Message Payload — {msg.type}
                      </div>
                      <div className="bg-gray-900/80 rounded-lg p-3 max-h-64 overflow-y-auto">
                        <JsonHighlight json={msg.payload} />
                      </div>
                    </div>
                  )}
                </div>
              )
            })}
          </div>

          {/* Summary timeline */}
          <div className="card">
            <h3 className="text-xs font-semibold text-gray-400 uppercase tracking-wide mb-3">Event Timeline</h3>
            <div className="space-y-2">
              {[
                { time: '14:32:01', label: 'OE sent to D4G aggregator', icon: ArrowUpRight, color: 'text-indigo-400' },
                { time: '14:32:04', label: 'Baseline report received', icon: ArrowDownLeft, color: 'text-blue-400' },
                { time: '14:32:06', label: 'Flex availability offer received (240 kW)', icon: ArrowDownLeft, color: 'text-teal-400' },
                { time: '14:32:09', label: 'Acknowledgement received — assets notified', icon: CheckCircle2, color: 'text-green-400' },
                { time: '11:00:32', label: 'Curtailment began — voltage recovering', icon: Zap, color: 'text-amber-400' },
                { time: '11:15:31', label: 'Telemetry: Solar marginally over (+1.8 kW)', icon: AlertTriangle, color: 'text-amber-400' },
                { time: '17:02:14', label: 'Performance report received — 96.4% delivery', icon: CheckCircle2, color: 'text-green-400' },
                { time: '17:05:00', label: 'Settlement acknowledgement sent', icon: ArrowUpRight, color: 'text-purple-400' },
              ].map((ev) => {
                const Icon = ev.icon
                return (
                  <div key={ev.time} className="flex items-center gap-3">
                    <span className="text-xs font-mono text-gray-500 w-16 flex-shrink-0">{ev.time}</span>
                    <Icon className={clsx('w-3.5 h-3.5 flex-shrink-0', ev.color)} />
                    <span className="text-xs text-gray-300">{ev.label}</span>
                  </div>
                )
              })}
            </div>
          </div>
        </>
      )}

      {/* ── Performance view ─────────────────────────────────────────────────── */}
      {activeView === 'performance' && (
        <>
          {/* KPI cards */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            <div className="card text-center">
              <div className="text-xs text-gray-400 mb-1">Delivery %</div>
              <div className="text-2xl font-bold text-green-400">{overallPct}%</div>
              <div className="text-xs text-gray-500 mt-0.5">Target ≥ 80%</div>
            </div>
            <div className="card text-center">
              <div className="text-xs text-gray-400 mb-1">Curtailed</div>
              <div className="text-2xl font-bold text-indigo-400">144.2</div>
              <div className="text-xs text-gray-500 mt-0.5">kWh delivered</div>
            </div>
            <div className="card text-center">
              <div className="text-xs text-gray-400 mb-1">Committed</div>
              <div className="text-2xl font-bold text-gray-300">149.6</div>
              <div className="text-xs text-gray-500 mt-0.5">kWh target</div>
            </div>
            <div className="card text-center">
              <div className="text-xs text-gray-400 mb-1">Penalty</div>
              <div className="text-2xl font-bold text-green-400">None</div>
              <div className="text-xs text-gray-500 mt-0.5">{'>'} 80% delivered</div>
            </div>
          </div>

          {/* Per-slot chart: committed vs delivered */}
          <div className="card">
            <h3 className="text-sm font-semibold text-white mb-1">Half-hourly Delivery vs Commitment</h3>
            <p className="text-xs text-gray-500 mb-4">Each bar pair = one 30-min slot during the 11:00–17:00 OE window</p>
            <div className="h-64">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={PERFORMANCE_DATA} margin={{ top: 5, right: 20, left: 0, bottom: 5 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#374151" />
                  <XAxis dataKey="slot" tick={{ fill: '#9ca3af', fontSize: 10 }} />
                  <YAxis tick={{ fill: '#9ca3af', fontSize: 10 }} unit=" kW" />
                  <Tooltip
                    contentStyle={{ background: '#1f2937', border: '1px solid #374151', borderRadius: 8, fontSize: 12 }}
                    formatter={(v: number, name: string) => [`${v.toFixed(1)} kW`, name]}
                  />
                  <Legend wrapperStyle={{ fontSize: 11, color: '#9ca3af' }} />
                  <ReferenceLine y={187.8} stroke="#6366f1" strokeDasharray="4 2" label={{ value: 'Committed', fill: '#6366f1', fontSize: 10 }} />
                  <Bar dataKey="committed" name="Committed kW" fill="#4f46e5" opacity={0.5} radius={[2, 2, 0, 0]} />
                  <Bar dataKey="delivered" name="Delivered kW" fill="#10b981" opacity={0.85} radius={[2, 2, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          </div>

          {/* Voltage recovery chart */}
          <div className="card">
            <h3 className="text-sm font-semibold text-white mb-1">Voltage Recovery During Event</h3>
            <p className="text-xs text-gray-500 mb-4">DT-AUZ-005 secondary voltage (pu) — target: 0.95–1.05 pu</p>
            <div className="h-48">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={PERFORMANCE_DATA} margin={{ top: 5, right: 20, left: 0, bottom: 5 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#374151" />
                  <XAxis dataKey="slot" tick={{ fill: '#9ca3af', fontSize: 10 }} />
                  <YAxis
                    tick={{ fill: '#9ca3af', fontSize: 10 }}
                    domain={[1.03, 1.07]}
                    tickFormatter={(v) => v.toFixed(3)}
                  />
                  <Tooltip
                    contentStyle={{ background: '#1f2937', border: '1px solid #374151', borderRadius: 8, fontSize: 12 }}
                    formatter={(v: number) => [v.toFixed(3) + ' pu', 'Voltage']}
                  />
                  <ReferenceLine y={1.05} stroke="#ef4444" strokeDasharray="4 2" label={{ value: '1.05 limit', fill: '#ef4444', fontSize: 10 }} />
                  <Bar dataKey="voltage" name="Voltage (pu)" fill="#f59e0b" opacity={0.85} radius={[2, 2, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </div>
            <div className="mt-2 flex items-center gap-2 text-xs text-green-400">
              <CheckCircle2 className="w-3.5 h-3.5" />
              Voltage stayed below 1.05 pu throughout the event window — constraint satisfied
            </div>
          </div>

          {/* Per-asset performance */}
          <div className="card">
            <h3 className="text-sm font-semibold text-white mb-3">Per-Asset Performance</h3>
            <table className="w-full text-sm">
              <thead>
                <tr>
                  <th className="text-left text-xs text-gray-400 font-medium pb-2">Asset</th>
                  <th className="text-right text-xs text-gray-400 font-medium pb-2">Committed kWh</th>
                  <th className="text-right text-xs text-gray-400 font-medium pb-2">Delivered kWh</th>
                  <th className="text-right text-xs text-gray-400 font-medium pb-2">Delivery %</th>
                  <th className="text-right text-xs text-gray-400 font-medium pb-2">Status</th>
                </tr>
              </thead>
              <tbody>
                {ASSET_PERFORMANCE.map((a) => (
                  <tr key={a.name} className="border-t border-gray-700/60">
                    <td className="py-2.5 text-gray-200 font-medium">{a.name}</td>
                    <td className="py-2.5 text-right font-mono text-gray-300">{a.committed}</td>
                    <td className="py-2.5 text-right font-mono text-green-400">{a.delivered}</td>
                    <td className="py-2.5 text-right font-mono text-green-400">{a.pct}%</td>
                    <td className="py-2.5 text-right">
                      <span className="inline-flex items-center gap-1 text-xs bg-green-900/40 text-green-400 px-2 py-0.5 rounded-full border border-green-800/40">
                        <CheckCircle2 className="w-3 h-3" /> No penalty
                      </span>
                    </td>
                  </tr>
                ))}
                <tr className="border-t-2 border-gray-600">
                  <td className="py-2.5 text-white font-semibold">Total</td>
                  <td className="py-2.5 text-right font-mono font-semibold text-gray-200">{totalCommitted.toFixed(1)}</td>
                  <td className="py-2.5 text-right font-mono font-semibold text-green-400">{totalDelivered.toFixed(1)}</td>
                  <td className="py-2.5 text-right font-mono font-semibold text-green-400">{overallPct}%</td>
                  <td className="py-2.5 text-right">
                    <span className="text-xs text-gray-400">Ready for settlement</span>
                  </td>
                </tr>
              </tbody>
            </table>
          </div>

          {/* Settlement readiness */}
          <div className="flex items-start gap-3 bg-green-900/20 border border-green-800/30 rounded-xl p-4">
            <CheckCircle2 className="w-5 h-5 text-green-400 flex-shrink-0 mt-0.5" />
            <div>
              <p className="text-sm font-semibold text-green-300">Ready for Settlement</p>
              <p className="text-sm text-green-200/80 mt-1">
                96.4% delivery exceeds the 80% penalty threshold. Availability payment + utilisation payment
                will be calculated in the next settlement cycle. No penalties apply.
              </p>
            </div>
          </div>
        </>
      )}
    </div>
  )
}
