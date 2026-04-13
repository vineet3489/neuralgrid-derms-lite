import React, { useState } from 'react'
import axios from 'axios'
import {
  ArrowDownLeft, ArrowUpRight, ChevronDown, ChevronUp, Loader2, Send, CheckCircle2,
} from 'lucide-react'
import clsx from 'clsx'

function uuidv4(): string {
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
    const r = (Math.random() * 16) | 0
    const v = c === 'x' ? r : (r & 0x3) | 0x8
    return v.toString(16)
  })
}

// ─── Types ────────────────────────────────────────────────────────────────────

interface StepStatus {
  a38: 'pending' | 'sent'
  a26: 'pending' | 'received'
  a32: 'idle' | 'sending' | 'sent' | 'error'
  ods: 'wip'
  a16: 'pending'
}

interface MessageLogEntry {
  type: string
  direction: 'outbound' | 'inbound'
  timestamp: string
  status: string
  http?: number | null
  payload: object
  expanded?: boolean
}

function JsonHighlight({ json }: { json: unknown }) {
  const text = JSON.stringify(json, null, 2)
  const highlighted = text.replace(
    /("(\\u[a-zA-Z0-9]{4}|\\[^u]|[^\\"])*"(\s*:)?|\b(true|false|null)\b|-?\d+(?:\.\d*)?(?:[eE][+\-]?\d+)?)/g,
    (match) => {
      if (/^"/.test(match)) {
        if (/:$/.test(match)) return `<span class="text-blue-500">${match}</span>`
        return `<span class="text-green-600">${match}</span>`
      }
      if (/true|false/.test(match)) return `<span class="text-purple-500">${match}</span>`
      if (/null/.test(match)) return `<span class="text-red-500">${match}</span>`
      return `<span class="text-amber-500">${match}</span>`
    },
  )
  return (
    <pre
      className="text-xs font-mono leading-relaxed whitespace-pre-wrap break-all text-gray-700"
      dangerouslySetInnerHTML={{ __html: highlighted }}
    />
  )
}

// ─── Static step payloads ─────────────────────────────────────────────────────

const A38_PAYLOAD = {
  mRID: 'OE-DT-AUZ-001-BR-B-20260410T174802',
  type: 'A44',
  standard: 'IEC 62746-4',
  'sender_MarketParticipant.mRID': '17X100A100A0001A',
  'receiver_MarketParticipant.mRID': '17XTESTD4GRID02T',
  Series: [{
    mRID: 'SERIES-BR-B-001',
    businessType: 'A96',
    Period: {
      timeInterval: { start: '2026-04-10T18:00:00Z', end: '2026-04-10T22:00:00Z' },
      resolution: 'PT30M',
      Point: [
        { position: 1, quantity_Minimum: -245.0, quantity_Maximum: 105.0, qualityCode: 'A06' },
        { position: 2, quantity_Minimum: -245.0, quantity_Maximum: 105.0, qualityCode: 'A06' },
        { position: 3, quantity_Minimum: -245.0, quantity_Maximum: 105.0, qualityCode: 'A06' },
        { position: 4, quantity_Minimum: -245.0, quantity_Maximum: 105.0, qualityCode: 'A06' },
        { position: 5, quantity_Minimum: -245.0, quantity_Maximum: 105.0, qualityCode: 'A06' },
        { position: 6, quantity_Minimum: -245.0, quantity_Maximum: 105.0, qualityCode: 'A06' },
        { position: 7, quantity_Minimum: -245.0, quantity_Maximum: 105.0, qualityCode: 'A06' },
        { position: 8, quantity_Minimum: -245.0, quantity_Maximum: 105.0, qualityCode: 'A06' },
      ],
    },
  }],
}

const A26_PAYLOAD = {
  mRID: 'FO-D4G-20260410T174812',
  type: 'A26',
  standard: 'IEC 62325-301',
  correlationID: 'OE-DT-AUZ-001-BR-B-20260410T174802',
  'sender_MarketParticipant.mRID': '17XTESTD4GRID02T',
  'sender_MarketParticipant.marketRole.type': 'A27',
  businessType: 'B83',
  flexType: 'EV_CHARGING_CURTAILMENT',
  totalFlex_kW: 245,
  price_EUR_per_MWh: 85.0,
  responseTime_min: 5,
  activationWindow: '2026-04-10T18:00:00Z / 2026-04-10T22:00:00Z',
  assets: [
    { assetID: 'EVC-B01', name: 'Chemin des Acacias 1', currentLoad_kW: 120, availableFlex_kW: 120 },
    { assetID: 'EVC-B02', name: 'Rue de Bellevue 2',    currentLoad_kW: 110, availableFlex_kW: 105 },
    { assetID: 'EVC-B03', name: 'Hameau du Gué 8',      currentLoad_kW: 120, availableFlex_kW: 20 },
  ],
}

function buildA32Payload() {
  const now = new Date()
  const todayStr = now.toISOString().slice(0, 10)
  const windowStart = new Date(`${todayStr}T19:00:00Z`).toISOString()
  const windowEnd   = new Date(`${todayStr}T21:00:00Z`).toISOString()
  return {
    mRID: `lnt-derim-${uuidv4()}`,
    type: 'A32',
    subject: 'Activation',
    revisionNumber: '1',
    createdDateTime: now.toISOString(),
    SenderMarketParticipant: {
      mRID: '17X100A100A0001A',
      name: 'EDF Réseau',
      MarketRole: { roleType: 'A04' },
    },
    ReceiverMarketParticipant: {
      mRID: '17XTESTD4GRID02T',
      name: 'DIGITAL 4 GRIDS',
      MarketRole: { roleType: 'A27' },
    },
    RefOfferMarketDocument: {
      mRID: 'lnt_test_d4g_c18fb0a2_ref',
      revisionNumber: '1',
    },
    TimeSeries: {
      businessType: 'B83',
      FlowDirection: { direction: 'A02' },
      MeasurementUnit: { name: 'MAW' },
      TimeInterval: {
        start: windowStart,
        end: windowEnd,
      },
      Period: {
        resolution: 'PT30M',
        Point: [
          { position: 1, quantity: '0.245' },
          { position: 2, quantity: '0.245' },
          { position: 3, quantity: '0.245' },
          { position: 4, quantity: '0.245' },
        ],
      },
    },
    AttributeInstanceComponent: [
      { attribute: 'DRO', value: '15' },
    ],
  }
}

// ─── Timeline step config ─────────────────────────────────────────────────────

const STEPS = [
  {
    num: 1,
    type: 'A38',
    direction: 'outbound' as const,
    dirLabel: 'DERIM → D4G',
    category: 'Operating Envelope',
  },
  {
    num: 2,
    type: 'A26',
    direction: 'inbound' as const,
    dirLabel: 'D4G → DERIM',
    category: 'FlexOffer: 245 kW €85/MWh',
  },
  {
    num: 3,
    type: 'A32',
    direction: 'outbound' as const,
    dirLabel: 'DERIM → D4G',
    category: 'Activation',
  },
  {
    num: 4,
    type: 'ODS',
    direction: 'inbound' as const,
    dirLabel: 'D4G → DERIM',
    category: 'OE Acknowledgement',
  },
  {
    num: 5,
    type: 'A16',
    direction: 'inbound' as const,
    dirLabel: 'D4G → DERIM',
    category: 'Measurement Data',
  },
]

export default function D4GMessagesPage() {
  const [steps, setSteps] = useState<StepStatus>({
    a38: 'sent',
    a26: 'received',
    a32: 'idle',
    ods: 'wip',
    a16: 'pending',
  })
  const [a32Result, setA32Result] = useState<{ mrid?: string; error?: string; http?: number } | null>(null)
  const [a32Payload, setA32Payload] = useState<object | null>(null)
  const [messageLog, setMessageLog] = useState<MessageLogEntry[]>([
    {
      type: 'A38',
      direction: 'outbound',
      timestamp: '17:48:02',
      status: 'Sent',
      http: null,
      payload: A38_PAYLOAD,
    },
    {
      type: 'A26',
      direction: 'inbound',
      timestamp: '17:48:12',
      status: 'Received',
      http: null,
      payload: A26_PAYLOAD,
    },
  ])
  const [expandedLog, setExpandedLog] = useState<number | null>(null)

  const handleSendA32 = async () => {
    setSteps((s) => ({ ...s, a32: 'sending' }))
    const payload = buildA32Payload()
    setA32Payload(payload)

    try {
      const resp = await axios.post('https://lnt.digital4grids.com/v1/activation', payload, {
        headers: {
          'Content-Type': 'application/json',
          'X-API-Key': 'demo-key',
        },
        timeout: 15000,
      })
      const mrid = resp.data?.mRID || resp.data?.id || payload.mRID
      setA32Result({ mrid, http: resp.status })
      setSteps((s) => ({ ...s, a32: 'sent' }))
      const ts = new Date().toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit', second: '2-digit' })
      setMessageLog((prev) => [...prev, {
        type: 'A32',
        direction: 'outbound',
        timestamp: ts,
        status: 'Sent',
        http: resp.status,
        payload,
      }])
    } catch (err: any) {
      const http = err.response?.status ?? null
      const errorMsg = err.response?.data?.message || err.message || 'Connection failed'
      setA32Result({ error: errorMsg, http })
      setSteps((s) => ({ ...s, a32: 'error' }))
      const ts = new Date().toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit', second: '2-digit' })
      setMessageLog((prev) => [...prev, {
        type: 'A32',
        direction: 'outbound',
        timestamp: ts,
        status: 'Error',
        http,
        payload,
      }])
    }
  }

  function stepStatusBadge(stepNum: number) {
    if (stepNum === 1) {
      return steps.a38 === 'sent'
        ? <span className="text-xs px-2 py-0.5 rounded bg-green-100 text-green-700 border border-green-200">Sent</span>
        : <span className="text-xs px-2 py-0.5 rounded bg-gray-100 text-gray-500 border border-gray-200">Pending</span>
    }
    if (stepNum === 2) {
      return steps.a26 === 'received'
        ? <span className="text-xs px-2 py-0.5 rounded bg-teal-100 text-teal-700 border border-teal-200">Received</span>
        : <span className="text-xs px-2 py-0.5 rounded bg-gray-100 text-gray-500 border border-gray-200">Awaiting</span>
    }
    if (stepNum === 3) {
      if (steps.a32 === 'sending') return (
        <span className="flex items-center gap-1 text-xs px-2 py-0.5 rounded bg-indigo-100 text-indigo-600 border border-indigo-200">
          <Loader2 className="w-3 h-3 animate-spin" /> Sending…
        </span>
      )
      if (steps.a32 === 'sent') return (
        <span className="flex items-center gap-1 text-xs px-2 py-0.5 rounded bg-green-100 text-green-700 border border-green-200">
          <CheckCircle2 className="w-3 h-3" /> Sent
        </span>
      )
      if (steps.a32 === 'error') return (
        <span className="text-xs px-2 py-0.5 rounded bg-red-100 text-red-600 border border-red-200">Error</span>
      )
      return (
        <button
          onClick={handleSendA32}
          className="text-xs px-3 py-1 rounded bg-indigo-600 hover:bg-indigo-500 text-white font-medium flex items-center gap-1.5 transition-colors"
        >
          <Send className="w-3 h-3" /> Send A32
        </button>
      )
    }
    if (stepNum === 4) {
      return <span className="text-xs px-2 py-0.5 rounded bg-gray-100 text-gray-500 border border-gray-200">WIP at D4G</span>
    }
    if (stepNum === 5) {
      return <span className="text-xs px-2 py-0.5 rounded bg-gray-100 text-gray-500 border border-gray-200">Awaiting</span>
    }
    return null
  }

  const stepPayloads: Record<number, object | null> = {
    1: A38_PAYLOAD,
    2: A26_PAYLOAD,
    3: a32Payload,
    4: null,
    5: null,
  }

  const [expandedStep, setExpandedStep] = useState<number | null>(null)

  return (
    <div className="space-y-5 max-w-4xl mx-auto">
      {/* Header */}
      <div>
        <h1 className="text-xl font-bold text-gray-900">IEC Messages</h1>
        <p className="text-sm text-gray-500 mt-0.5">
          EVT-AUZ-001 · DT-AUZ-001 Branch B · IEC 62746-4 · A38→A26→A32→ODS→A16
        </p>
      </div>

      {/* Vertical timeline */}
      <div className="card space-y-0 p-0 overflow-hidden">
        {STEPS.map((step, idx) => {
          const isLast = idx === STEPS.length - 1
          const isExpanded = expandedStep === step.num
          const payload = stepPayloads[step.num]
          return (
            <div key={step.num} className={clsx('border-b border-gray-200 last:border-0')}>
              <div className="flex items-center gap-4 px-5 py-3.5">
                {/* Step number + connector */}
                <div className="flex flex-col items-center flex-shrink-0">
                  <div className={clsx(
                    'w-7 h-7 rounded-full flex items-center justify-center text-xs font-bold border',
                    step.num === 3
                      ? steps.a32 === 'sent' ? 'bg-green-100 text-green-700 border-green-200'
                        : steps.a32 === 'error' ? 'bg-red-100 text-red-600 border-red-200'
                        : steps.a32 === 'sending' ? 'bg-indigo-100 text-indigo-600 border-indigo-200'
                        : 'bg-indigo-100 text-indigo-600 border-indigo-200'
                      : step.num <= 2 ? 'bg-green-100 text-green-700 border-green-200'
                      : 'bg-gray-100 text-gray-500 border-gray-200'
                  )}>
                    {step.num}
                  </div>
                  {!isLast && <div className="w-px h-3 bg-gray-200 mt-1" />}
                </div>

                {/* Direction icon */}
                <div className={clsx(
                  'w-6 h-6 rounded-full flex items-center justify-center flex-shrink-0',
                  step.direction === 'outbound' ? 'bg-indigo-100' : 'bg-teal-100'
                )}>
                  {step.direction === 'outbound'
                    ? <ArrowUpRight className="w-3.5 h-3.5 text-indigo-500" />
                    : <ArrowDownLeft className="w-3.5 h-3.5 text-teal-500" />
                  }
                </div>

                {/* Type badge */}
                <span className={clsx(
                  'text-[10px] font-bold px-2 py-0.5 rounded border font-mono flex-shrink-0',
                  step.direction === 'outbound'
                    ? 'bg-indigo-100 text-indigo-600 border-indigo-200'
                    : 'bg-teal-100 text-teal-600 border-teal-200'
                )}>
                  {step.type}
                </span>

                {/* Direction label */}
                <span className="text-xs text-gray-500 flex-shrink-0">{step.dirLabel}</span>

                {/* Category */}
                <span className="text-xs text-gray-700 flex-1">{step.category}</span>

                {/* Status / action */}
                <div className="flex items-center gap-2 flex-shrink-0">
                  {stepStatusBadge(step.num)}

                  {/* Expand toggle (if has payload) */}
                  {payload && (
                    <button
                      onClick={() => setExpandedStep(isExpanded ? null : step.num)}
                      className="text-gray-400 hover:text-gray-700 transition-colors"
                    >
                      {isExpanded ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
                    </button>
                  )}
                </div>
              </div>

              {/* A32 response */}
              {step.num === 3 && a32Result && (
                <div className={clsx(
                  'mx-5 mb-3 px-3 py-2 rounded-lg text-xs',
                  a32Result.error
                    ? 'bg-red-50 border border-red-200 text-red-600'
                    : 'bg-green-50 border border-green-200 text-green-700'
                )}>
                  {a32Result.error ? (
                    <>HTTP {a32Result.http ?? 'ERR'} — {a32Result.error}</>
                  ) : (
                    <>HTTP {a32Result.http} · mRID: <span className="font-mono">{a32Result.mrid}</span></>
                  )}
                </div>
              )}

              {/* Expanded payload */}
              {isExpanded && payload && (
                <div className="mx-5 mb-3 bg-gray-50 rounded-lg p-3 max-h-64 overflow-y-auto">
                  <JsonHighlight json={payload} />
                </div>
              )}
            </div>
          )
        })}
      </div>

      {/* Message log table */}
      <div className="card">
        <h3 className="text-sm font-semibold text-gray-900 mb-3">Message Log</h3>
        <div className="overflow-x-auto">
          <table className="w-full text-xs">
            <thead className="border-b border-gray-200">
              <tr>
                <th className="text-left text-gray-500 font-medium pb-2 pr-4">Type</th>
                <th className="text-left text-gray-500 font-medium pb-2 pr-4">Direction</th>
                <th className="text-left text-gray-500 font-medium pb-2 pr-4">Timestamp</th>
                <th className="text-left text-gray-500 font-medium pb-2 pr-4">Status</th>
                <th className="text-left text-gray-500 font-medium pb-2 pr-4">HTTP</th>
                <th className="text-left text-gray-500 font-medium pb-2" />
              </tr>
            </thead>
            <tbody>
              {messageLog.map((entry, i) => (
                <React.Fragment key={i}>
                  <tr className="border-t border-gray-200 hover:bg-gray-50 cursor-pointer"
                    onClick={() => setExpandedLog(expandedLog === i ? null : i)}>
                    <td className="py-2 pr-4">
                      <span className={clsx(
                        'font-mono font-bold px-1.5 py-0.5 rounded text-[10px] border',
                        entry.direction === 'outbound'
                          ? 'bg-indigo-100 text-indigo-600 border-indigo-200'
                          : 'bg-teal-100 text-teal-600 border-teal-200'
                      )}>
                        {entry.type}
                      </span>
                    </td>
                    <td className="py-2 pr-4">
                      <span className="flex items-center gap-1 text-gray-500">
                        {entry.direction === 'outbound'
                          ? <ArrowUpRight className="w-3 h-3 text-indigo-500" />
                          : <ArrowDownLeft className="w-3 h-3 text-teal-500" />
                        }
                        {entry.direction}
                      </span>
                    </td>
                    <td className="py-2 pr-4 font-mono text-gray-500">{entry.timestamp}</td>
                    <td className="py-2 pr-4">
                      <span className={clsx(
                        'px-1.5 py-0.5 rounded text-[10px]',
                        entry.status === 'Sent' ? 'text-green-700 bg-green-100'
                        : entry.status === 'Received' ? 'text-teal-700 bg-teal-100'
                        : 'text-red-600 bg-red-100'
                      )}>
                        {entry.status}
                      </span>
                    </td>
                    <td className="py-2 pr-4 font-mono text-gray-500">
                      {entry.http != null ? entry.http : '—'}
                    </td>
                    <td className="py-2 text-gray-400">
                      {expandedLog === i ? <ChevronUp className="w-3.5 h-3.5" /> : <ChevronDown className="w-3.5 h-3.5" />}
                    </td>
                  </tr>
                  {expandedLog === i && (
                    <tr>
                      <td colSpan={6} className="pb-3">
                        <div className="bg-gray-50 rounded-lg p-3 max-h-48 overflow-y-auto">
                          <JsonHighlight json={entry.payload} />
                        </div>
                      </td>
                    </tr>
                  )}
                </React.Fragment>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  )
}
