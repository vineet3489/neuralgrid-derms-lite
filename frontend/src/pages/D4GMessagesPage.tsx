import React, { useState, useRef } from 'react'
import {
  ArrowDownLeft, ArrowUpRight, CheckCircle2,
  ChevronDown, BarChart2, Play, RotateCcw, Loader2,
} from 'lucide-react'
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip,
  ResponsiveContainer, Legend, ReferenceLine,
} from 'recharts'
import clsx from 'clsx'

// ─── IEC 62746-4 D4G Message Thread ──────────────────────────────────────────
// Correct 5-step sequence per doc:
//  1. A38  — DSO → SPG   Operating Envelope
//  2. A26  — DSO → SPG   Reference Energy Curve (desired net load shape)
//  3. A26  — SPG → DSO   FlexOffer (available volume, price, window)
//  4. A32  — DSO → SPG   Activation (instructs SPG to deliver the flex)
//  5. A16  — SPG → DSO   MeasurementData (delivery confirmation)

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
    type: 'ReferenceEnergyCurveOperatingEnvelope_MarketDocument',
    typeLabel: 'A38 — Operating Envelope',
    timestamp: '17:48:02',
    status: 'sent',
    summary: 'OE dispatched to SPG-B · Phase B EV constraint · max export 105 kW · max import 245 kW · window 18:00–22:00',
    payload: {
      mRID: 'OE-DT-AUZ-001-BR-B-20260404T174802',
      type: 'A44',
      standard: 'IEC 62746-4',
      'process.processType': 'Z01',
      'sender_MarketParticipant.mRID': 'neuralgrid-derms',
      'sender_MarketParticipant.marketRole.type': 'A04',
      'receiver_MarketParticipant.mRID': 'spg-b-vendee-flex',
      'receiver_MarketParticipant.marketRole.type': 'A27',
      Series: [{
        mRID: 'SERIES-BR-B-001',
        businessType: 'A96',
        asset: { mRID: 'DT-AUZ-001-BR-B', name: 'Branch B (Phase B) — 34 households, 715m' },
        Period: {
          timeInterval: { start: '2026-04-04T18:00:00Z', end: '2026-04-04T22:00:00Z' },
          resolution: 'PT30M',
          Point: [
            { position: 1, quantity_Minimum: -245.0, quantity_Maximum: 105.0, qualityCode: 'A06' },
            { position: 2, quantity_Minimum: -245.0, quantity_Maximum: 105.0, qualityCode: 'A06' },
            // ... 6 more PT30M slots (08 total for 18:00–22:00)
          ],
        },
      }],
    },
  },
  {
    id: 'MSG-002',
    direction: 'outbound',
    type: 'ReferenceEnergyCurve_MarketDocument',
    typeLabel: 'REC/A26 — Reference Energy Curve',
    timestamp: '17:48:05',
    status: 'sent',
    summary: 'DSO sends desired net load shape for Branch B · baseline 129 kW · target ceiling 225 kW (DT limit)',
    payload: {
      mRID: 'REC-DT-AUZ-001-20260404T174805',
      type: 'A26',
      standard: 'IEC 62746-4',
      correlationID: 'OE-DT-AUZ-001-BR-B-20260404T174802',
      'sender_MarketParticipant.marketRole.type': 'A04',
      'receiver_MarketParticipant.marketRole.type': 'A27',
      note: 'DSO desired net load shape — EV charging to remain within DT thermal limit',
      Series: [{
        businessType: 'A96',
        Period: {
          timeInterval: { start: '2026-04-04T18:00:00Z', end: '2026-04-04T22:00:00Z' },
          resolution: 'PT30M',
          Point: [
            { position: 1, desiredNetLoad_kW: 129.0 },
            { position: 2, desiredNetLoad_kW: 129.0 },
            // DSO target: maintain 129 kW baseline, not 479 kW with uncontrolled EV
          ],
        },
      }],
    },
  },
  {
    id: 'MSG-003',
    direction: 'inbound',
    type: 'ReserveBidMarketDocument',
    typeLabel: 'A26 — FlexOffer',
    timestamp: '17:48:12',
    status: 'received',
    summary: 'SPG-B offers 245 kW EV curtailment · 12 prosumers · €85/MWh · window 18:00–22:00 · response in 5 min',
    payload: {
      mRID: 'FO-SPG-B-20260404T174812',
      type: 'A26',
      standard: 'IEC 62325-301',
      correlationID: 'OE-DT-AUZ-001-BR-B-20260404T174802',
      'sender_MarketParticipant.mRID': 'spg-b-vendee-flex',
      'sender_MarketParticipant.marketRole.type': 'A27',
      'receiver_MarketParticipant.marketRole.type': 'A04',
      businessType: 'B83',
      flexType: 'EV_CHARGING_CURTAILMENT',
      totalFlex_kW: 245,
      price_EUR_per_MWh: 85.0,
      responseTime_min: 5,
      activationWindow: '2026-04-04T18:00:00Z / 2026-04-04T22:00:00Z',
      assets: [
        { assetID: 'EVC-B01', name: 'Chemin des Acacias 1', currentLoad_kW: 120, curtailTo_kW: 0, availableFlex_kW: 120 },
        { assetID: 'EVC-B02', name: 'Rue de Bellevue 2',    currentLoad_kW: 110, curtailTo_kW: 5, availableFlex_kW: 105 },
        { assetID: 'EVC-B03', name: 'Hameau du Gué 8',      currentLoad_kW: 120, curtailTo_kW: 100, availableFlex_kW: 20 },
      ],
      Period: {
        resolution: 'PT30M',
        Points: [
          { position: 1, quantity_MAW: 0.245, price_EUR_per_MWh: 85.0 },
          // ... 7 more slots
        ],
      },
    },
  },
  {
    id: 'MSG-004',
    direction: 'outbound',
    type: 'ActivationMarketDocument',
    typeLabel: 'A32 — Activation',
    timestamp: '17:50:00',
    status: 'sent',
    summary: 'DERIM activates flex: curtail 245 kW EV load on Branch B · FlowDirection A02 · businessType B83 · effective 18:00',
    payload: {
      mRID: 'ACT-DERMS-20260404T175000',
      type: 'A32',
      subject: 'Activation',
      standard: 'IEC 62325-301',
      RefOfferMarketDocument: { mRID: 'FO-SPG-B-20260404T174812' },
      'sender_MarketParticipant.mRID': 'neuralgrid-derms',
      'sender_MarketParticipant.marketRole.type': 'A04',
      'receiver_MarketParticipant.mRID': 'spg-b-vendee-flex',
      'receiver_MarketParticipant.marketRole.type': 'A27',
      businessType: 'B83',
      FlowDirection: 'A02',
      activationStatus: 'ACCEPTED',
      Period: {
        timeInterval: { start: '2026-04-04T18:00:00Z', end: '2026-04-04T22:00:00Z' },
        resolution: 'PT30M',
        Point: [
          { position: 1, quantity_MAW: 0.245 },
          { position: 2, quantity_MAW: 0.245 },
          { position: 3, quantity_MAW: 0.245 },
          { position: 4, quantity_MAW: 0.245 },
          { position: 5, quantity_MAW: 0.231 },
          { position: 6, quantity_MAW: 0.238 },
          { position: 7, quantity_MAW: 0.245 },
          { position: 8, quantity_MAW: 0.240 },
        ],
      },
      instruction: 'Reduce EV charger load on Branch B to within OE limits. Solar/BESS prosumers unaffected.',
    },
  },
  {
    id: 'MSG-005',
    direction: 'inbound',
    type: 'MeasurementData_MarketDocument',
    typeLabel: 'A16 — MeasurementData',
    timestamp: '22:02:14',
    status: 'received',
    summary: 'Delivery confirmed: 231 kW avg curtailed (94.2%) · Branch B voltage recovered · 3 EV sessions managed',
    payload: {
      mRID: 'MD-SPG-B-20260404T220214',
      type: 'A16',
      standard: 'IEC 62746-4',
      correlationID: 'ACT-DERMS-20260404T175000',
      'sender_MarketParticipant.mRID': 'spg-b-vendee-flex',
      'sender_MarketParticipant.marketRole.type': 'A27',
      activationPeriod: '2026-04-04T18:00:00Z / 2026-04-04T22:00:00Z',
      deliveryPct: 94.2,
      metered_kWh: 924.0,
      committed_kWh: 980.0,
      assets: [
        { assetID: 'EVC-B01', curtailed_kWh: 480.0, committedFlex_kWh: 480.0, deliveryPct: 100.0, sessionEnd: '21:52' },
        { assetID: 'EVC-B02', curtailed_kWh: 396.0, committedFlex_kWh: 420.0, deliveryPct: 94.3, sessionEnd: '22:00' },
        { assetID: 'EVC-B03', curtailed_kWh: 48.0,  committedFlex_kWh: 80.0,  deliveryPct: 60.0, note: 'Driver override at 20:30' },
      ],
      networkOutcome: {
        branchB_peakLoadBefore_kW: 479,
        branchB_peakLoadAfter_kW: 234,
        dtLoading_pct_before: 213,
        dtLoading_pct_after: 104,
        voltageRecovery: 'Phase B end-of-feeder: 0.894 pu → 0.963 pu',
      },
    },
  },
]

// ─── Performance data (EV scenario 18:00–22:00) ───────────────────────────────

const PERFORMANCE_DATA = [
  { slot: '18:00', committed: 245, delivered: 243, loading_pct: 105 },
  { slot: '18:30', committed: 245, delivered: 248, loading_pct: 107 },
  { slot: '19:00', committed: 245, delivered: 241, loading_pct: 102 },
  { slot: '19:30', committed: 245, delivered: 239, loading_pct: 103 },
  { slot: '20:00', committed: 245, delivered: 240, loading_pct: 104 },
  { slot: '20:30', committed: 245, delivered: 196, loading_pct: 114 },  // driver override
  { slot: '21:00', committed: 245, delivered: 241, loading_pct: 102 },
  { slot: '21:30', committed: 245, delivered: 243, loading_pct: 103 },
]

const ASSET_PERFORMANCE = [
  { name: 'EV Charger 1 (Acacias)', committed: 480, delivered: 480, pct: 100.0 },
  { name: 'EV Charger 2 (Bellevue)', committed: 420, delivered: 396, pct: 94.3 },
  { name: 'EV Charger 3 (Hameau du Gué)', committed: 80, delivered: 48, pct: 60.0 },
]

// ─── Helpers ─────────────────────────────────────────────────────────────────

function msgTagClass(direction: MsgDirection, typeLabel: string): string {
  if (typeLabel.startsWith('A16')) return 'bg-gray-700/60 text-gray-300 border-gray-600/50'
  if (direction === 'outbound') return 'bg-indigo-900/50 text-indigo-300 border-indigo-700/40'
  return 'bg-teal-900/50 text-teal-300 border-teal-700/40'
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

const MSG_DELAYS: Record<string, number> = {
  'MSG-001': 500,   // A38 OE sent
  'MSG-002': 600,   // REC/A26 follows immediately
  'MSG-003': 1800,  // SPG-B processes and responds with FlexOffer (~10s)
  'MSG-004': 1200,  // DSO reviews and activates
  'MSG-005': 2500,  // MeasurementData arrives after event ends
}

// ─── Main page ────────────────────────────────────────────────────────────────

export default function D4GMessagesPage() {
  const [expandedId, setExpandedId] = useState<string | null>(null)
  const [activeView, setActiveView] = useState<'thread' | 'live' | 'performance'>('thread')

  const [liveMessages, setLiveMessages] = useState<D4GMessage[]>([])
  const [simRunning, setSimRunning] = useState(false)
  const [simDone, setSimDone] = useState(false)
  const [pendingLabel, setPendingLabel] = useState<string | null>(null)
  const simRef = useRef<boolean>(false)

  const startSimulation = async () => {
    setLiveMessages([])
    setSimDone(false)
    setSimRunning(true)
    simRef.current = true

    for (const msg of MESSAGE_THREAD) {
      if (!simRef.current) break
      const delay = MSG_DELAYS[msg.id] ?? 1000
      setPendingLabel(msg.direction === 'outbound' ? `Sending ${msg.typeLabel}…` : `Awaiting ${msg.typeLabel}…`)
      await new Promise((r) => setTimeout(r, delay))
      if (!simRef.current) break
      setLiveMessages((prev) => [...prev, {
        ...msg,
        timestamp: new Date().toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit', second: '2-digit' })
      }])
      setPendingLabel(null)
      await new Promise((r) => setTimeout(r, 200))
    }
    setPendingLabel(null)
    setSimRunning(false)
    setSimDone(true)
    simRef.current = false
  }

  const resetSimulation = () => {
    simRef.current = false
    setSimRunning(false)
    setSimDone(false)
    setLiveMessages([])
    setPendingLabel(null)
  }

  const totalDelivered = ASSET_PERFORMANCE.reduce((s, a) => s + a.delivered, 0)
  const totalCommitted = ASSET_PERFORMANCE.reduce((s, a) => s + a.committed, 0)
  const overallPct = ((totalDelivered / totalCommitted) * 100).toFixed(1)

  const LIFECYCLE_STEPS = [
    { label: 'A38 OE',      color: 'bg-indigo-500' },
    { label: 'REC/A26',     color: 'bg-blue-500' },
    { label: 'A26 Offer',   color: 'bg-teal-500' },
    { label: 'A32 Activate',color: 'bg-violet-500' },
    { label: 'A16 Measure', color: 'bg-gray-500' },
  ]

  const renderMessages = (msgs: D4GMessage[]) => msgs.map((msg) => {
    const isExpanded = expandedId === msg.id
    const tagCls = msgTagClass(msg.direction, msg.typeLabel)
    const isInbound = msg.direction === 'inbound'
    return (
      <div
        key={msg.id}
        className={clsx(
          'rounded-xl border transition-all',
          isInbound ? 'border-gray-700/60 bg-gray-800/40' : 'border-indigo-900/40 bg-indigo-950/30',
        )}
      >
        <div className="flex items-start gap-3 p-3.5 cursor-pointer"
          onClick={() => setExpandedId(isExpanded ? null : msg.id)}>
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
              <span className={clsx('inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-semibold border', tagCls)}>
                {msg.typeLabel}
              </span>
              <span className="text-xs text-gray-500 font-mono">{msg.timestamp}</span>
              <span className={clsx(
                'text-[10px] px-1.5 py-0.5 rounded font-medium',
                msg.status === 'acknowledged' ? 'bg-green-900/40 text-green-400'
                : msg.status === 'sent' ? 'bg-indigo-900/40 text-indigo-400'
                : 'bg-gray-800 text-gray-400'
              )}>
                {msg.status === 'sent' ? 'SENT' : msg.status === 'received' ? 'RECEIVED' : msg.status.toUpperCase()}
              </span>
              <span className="text-[10px] text-gray-600 font-mono ml-auto hidden sm:block">
                {isInbound ? 'SPG-B → DSO' : 'DSO → SPG-B'}
              </span>
            </div>
            <p className="text-xs text-gray-300 mt-1 leading-relaxed">{msg.summary}</p>
          </div>
          <ChevronDown className={clsx('w-4 h-4 text-gray-500 flex-shrink-0 transition-transform mt-1', isExpanded && 'rotate-180')} />
        </div>
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
  })

  return (
    <div className="space-y-5 max-w-5xl mx-auto">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-bold text-white">D4G Messages</h1>
          <p className="text-sm text-gray-400 mt-0.5">
            EVT-AUZ-001 · DT-AUZ-001 Branch B · IEC 62746-4 · A38→A26→A26→A32→A16
          </p>
        </div>
        <div className="flex gap-1 bg-gray-800 rounded-lg p-1">
          <button onClick={() => setActiveView('thread')}
            className={clsx('px-3 py-1.5 rounded text-xs font-medium transition-colors flex items-center gap-1.5',
              activeView === 'thread' ? 'bg-indigo-600 text-white' : 'text-gray-400 hover:text-gray-200')}>
            <ArrowDownLeft className="w-3.5 h-3.5" /> Thread
          </button>
          <button onClick={() => setActiveView('live')}
            className={clsx('px-3 py-1.5 rounded text-xs font-medium transition-colors flex items-center gap-1.5',
              activeView === 'live' ? 'bg-indigo-600 text-white' : 'text-gray-400 hover:text-gray-200')}>
            <Play className="w-3.5 h-3.5" /> Live Sim
          </button>
          <button onClick={() => setActiveView('performance')}
            className={clsx('px-3 py-1.5 rounded text-xs font-medium transition-colors flex items-center gap-1.5',
              activeView === 'performance' ? 'bg-indigo-600 text-white' : 'text-gray-400 hover:text-gray-200')}>
            <BarChart2 className="w-3.5 h-3.5" /> Performance
          </button>
        </div>
      </div>

      {/* ── Thread view ──────────────────────────────────────────────────────── */}
      {activeView === 'thread' && (
        <>
          {/* 5-step lifecycle legend */}
          <div className="card py-3">
            <div className="flex items-center gap-0 overflow-x-auto">
              {LIFECYCLE_STEPS.map((step, i, arr) => (
                <React.Fragment key={step.label}>
                  <div className="flex flex-col items-center flex-shrink-0">
                    <div className={clsx('w-3 h-3 rounded-full', step.color)} />
                    <span className="text-[10px] text-gray-400 mt-1 whitespace-nowrap">{step.label}</span>
                  </div>
                  {i < arr.length - 1 && <div className="flex-1 h-px bg-gray-700 mx-2 mb-4 min-w-[24px]" />}
                </React.Fragment>
              ))}
            </div>
          </div>
          <div className="space-y-2">{renderMessages(MESSAGE_THREAD)}</div>
        </>
      )}

      {/* ── Live Sim view ─────────────────────────────────────────────────────── */}
      {activeView === 'live' && (
        <>
          <div className="card flex items-center justify-between">
            <div>
              <p className="text-sm text-gray-200 font-medium">D4G Lifecycle Simulation</p>
              <p className="text-xs text-gray-400 mt-0.5">
                Replays the 5-message IEC 62746-4 sequence: A38 OE → REC/A26 → FlexOffer → A32 Activation → A16 Measurement.
                Timestamps reflect live playback time.
              </p>
            </div>
            <div className="flex items-center gap-2 flex-shrink-0 ml-4">
              {(simDone || liveMessages.length > 0) && (
                <button onClick={resetSimulation} className="btn-secondary flex items-center gap-2 text-xs py-1.5">
                  <RotateCcw className="w-3.5 h-3.5" /> Reset
                </button>
              )}
              <button onClick={startSimulation} disabled={simRunning}
                className="btn-primary flex items-center gap-2 text-sm">
                {simRunning
                  ? <><Loader2 className="w-4 h-4 animate-spin" /> Simulating…</>
                  : <><Play className="w-4 h-4" /> {liveMessages.length > 0 ? 'Replay' : 'Start Simulation'}</>
                }
              </button>
            </div>
          </div>

          {liveMessages.length === 0 && !simRunning && (
            <div className="card flex flex-col items-center justify-center py-16 text-gray-500">
              <Play className="w-8 h-8 mb-3 text-gray-600" />
              <p className="text-sm">Press Start Simulation to watch the D4G message exchange play out</p>
            </div>
          )}

          {(liveMessages.length > 0 || simRunning) && (
            <div className="space-y-2">
              {renderMessages(liveMessages)}
              {pendingLabel && (
                <div className="flex items-center gap-3 px-4 py-3 rounded-xl border border-gray-700/40 bg-gray-800/30">
                  <Loader2 className="w-4 h-4 text-indigo-400 animate-spin flex-shrink-0" />
                  <span className="text-xs text-gray-400">{pendingLabel}</span>
                </div>
              )}
              {simDone && (
                <div className="flex items-center gap-3 px-4 py-3 rounded-xl border border-green-800/40 bg-green-900/20">
                  <CheckCircle2 className="w-4 h-4 text-green-400 flex-shrink-0" />
                  <span className="text-sm text-green-300 font-medium">
                    Lifecycle complete — all 5 D4G messages exchanged (A38 → REC → A26 → A32 → A16)
                  </span>
                </div>
              )}
            </div>
          )}
        </>
      )}

      {/* ── Performance view ─────────────────────────────────────────────────── */}
      {activeView === 'performance' && (
        <>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            <div className="card text-center">
              <div className="text-xs text-gray-400 mb-1">Delivery %</div>
              <div className="text-2xl font-bold text-green-400">{overallPct}%</div>
              <div className="text-xs text-gray-500 mt-0.5">Target ≥ 80%</div>
            </div>
            <div className="card text-center">
              <div className="text-xs text-gray-400 mb-1">EV Load Curtailed</div>
              <div className="text-2xl font-bold text-indigo-400">{totalDelivered}</div>
              <div className="text-xs text-gray-500 mt-0.5">kWh delivered</div>
            </div>
            <div className="card text-center">
              <div className="text-xs text-gray-400 mb-1">Committed</div>
              <div className="text-2xl font-bold text-gray-300">{totalCommitted}</div>
              <div className="text-xs text-gray-500 mt-0.5">kWh target</div>
            </div>
            <div className="card text-center">
              <div className="text-xs text-gray-400 mb-1">Branch B Peak</div>
              <div className="text-2xl font-bold text-amber-400">479→234</div>
              <div className="text-xs text-gray-500 mt-0.5">kW (before→after)</div>
            </div>
          </div>

          <div className="card">
            <h3 className="text-sm font-semibold text-white mb-1">Half-hourly EV Curtailment vs Commitment</h3>
            <p className="text-xs text-gray-500 mb-4">Branch B · EV surge window 18:00–22:00 · 8 × PT30M slots</p>
            <div className="h-64">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={PERFORMANCE_DATA} margin={{ top: 5, right: 20, left: 0, bottom: 5 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#374151" />
                  <XAxis dataKey="slot" tick={{ fill: '#9ca3af', fontSize: 10 }} />
                  <YAxis tick={{ fill: '#9ca3af', fontSize: 10 }} unit=" kW" />
                  <Tooltip contentStyle={{ background: '#1f2937', border: '1px solid #374151', borderRadius: 8, fontSize: 12 }}
                    formatter={(v: number, name: string) => [`${v.toFixed(0)} kW`, name]} />
                  <Legend wrapperStyle={{ fontSize: 11, color: '#9ca3af' }} />
                  <ReferenceLine y={245} stroke="#6366f1" strokeDasharray="4 2"
                    label={{ value: 'Committed 245 kW', fill: '#6366f1', fontSize: 10 }} />
                  <Bar dataKey="committed" name="Committed kW" fill="#4f46e5" opacity={0.5} radius={[2,2,0,0]} />
                  <Bar dataKey="delivered" name="Delivered kW" fill="#10b981" opacity={0.85} radius={[2,2,0,0]} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          </div>

          <div className="card">
            <h3 className="text-sm font-semibold text-white mb-1">Branch B Thermal Loading During Event</h3>
            <p className="text-xs text-gray-500 mb-4">DT thermal limit = 225 kW (100%) · Target: stay below overload with EV curtailment</p>
            <div className="h-48">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={PERFORMANCE_DATA} margin={{ top: 5, right: 20, left: 0, bottom: 5 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#374151" />
                  <XAxis dataKey="slot" tick={{ fill: '#9ca3af', fontSize: 10 }} />
                  <YAxis tick={{ fill: '#9ca3af', fontSize: 10 }} unit="%" domain={[90, 120]} />
                  <Tooltip contentStyle={{ background: '#1f2937', border: '1px solid #374151', borderRadius: 8, fontSize: 12 }}
                    formatter={(v: number) => [v + '%', 'DT Loading']} />
                  <ReferenceLine y={100} stroke="#ef4444" strokeDasharray="4 2"
                    label={{ value: 'Thermal limit 100%', fill: '#ef4444', fontSize: 10 }} />
                  <Bar dataKey="loading_pct" name="DT Loading %" fill="#f59e0b" opacity={0.85} radius={[2,2,0,0]} />
                </BarChart>
              </ResponsiveContainer>
            </div>
            <div className="mt-2 flex items-center gap-2 text-xs text-amber-400">
              <CheckCircle2 className="w-3.5 h-3.5" />
              Residual overloading (104–114%) due to driver override at 20:30 — second OE cycle would resolve fully
            </div>
          </div>

          <div className="card">
            <h3 className="text-sm font-semibold text-white mb-3">Per EV Charger Performance</h3>
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
                    <td className="py-2.5 text-right font-mono"
                      style={{ color: a.pct >= 80 ? '#34d399' : '#f59e0b' }}>{a.pct}%</td>
                    <td className="py-2.5 text-right">
                      <span className={clsx(
                        'inline-flex items-center gap-1 text-xs px-2 py-0.5 rounded-full border',
                        a.pct >= 95 ? 'bg-green-900/40 text-green-400 border-green-800/40'
                        : a.pct >= 80 ? 'bg-amber-900/40 text-amber-400 border-amber-800/40'
                        : 'bg-red-900/40 text-red-400 border-red-800/40'
                      )}>
                        {a.pct >= 95 ? '✓ Full pay' : a.pct >= 80 ? '~ Pro-rata' : '✗ Penalty'}
                      </span>
                    </td>
                  </tr>
                ))}
                <tr className="border-t-2 border-gray-600">
                  <td className="py-2.5 text-white font-semibold">Total</td>
                  <td className="py-2.5 text-right font-mono font-semibold text-gray-200">{totalCommitted}</td>
                  <td className="py-2.5 text-right font-mono font-semibold text-green-400">{totalDelivered}</td>
                  <td className="py-2.5 text-right font-mono font-semibold text-green-400">{overallPct}%</td>
                  <td className="py-2.5 text-right text-xs text-gray-400">Ready for settlement</td>
                </tr>
              </tbody>
            </table>
          </div>
        </>
      )}
    </div>
  )
}
