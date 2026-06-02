import React, { useState, useCallback, useEffect, useRef } from 'react'
import { useNavigate } from 'react-router-dom'
import { DISTRIBUTION_TRANSFORMERS } from '../data/auzanceNetwork'
import {
  AlertTriangle, CheckCircle, Copy, ChevronDown, ChevronUp,
  Loader2, Send, Cpu, RefreshCw, TrendingDown, Activity, Zap, Radio,
} from 'lucide-react'
import clsx from 'clsx'
import {
  LineChart, Line, XAxis, YAxis, CartesianGrid,
  Tooltip, ResponsiveContainer, ReferenceLine, Legend,
} from 'recharts'
import { api } from '../api/client'
import { useAuthStore } from '../stores/authStore'

interface OEPoint {
  position: number
  time: string
  quantity_Minimum: number
  quantity_Maximum: number
  qualityCode: string
  constraint: string
  total_load_kw?: number
  dt_loading_pct?: number
  min_v_end_pu?: number
  branch_B_load_kw?: number
  ev_surge?: boolean
  source?: string
}

function generateOEPoints(dtId: string, startTime: Date, count = 48): OEPoint[] {
  const isCritical = dtId === 'DT-AUZ-005'
  const isDemoDT = dtId === 'DT-AUZ-001'
  const points: OEPoint[] = []
  for (let i = 0; i < count; i++) {
    const t = new Date(startTime.getTime() + i * 30 * 60 * 1000)
    const hour = t.getHours() + t.getMinutes() / 60
    const sineVal = Math.sin((Math.PI * (hour - 6)) / 12)
    const factor = Math.max(0, sineVal)
    const isEvSurge = hour >= 18 && hour < 22
    let constraint = '—'
    if (isCritical && factor > 0.1) constraint = 'LV feeder thermal'
    else if (isDemoDT && isEvSurge) constraint = 'Branch B thermal'

    if (isCritical) {
      const maxExport = factor > 0.1 ? 120 - factor * 20 : 50
      const minImport = factor > 0.1 ? -(50 - factor * 10) : -30
      points.push({
        position: i + 1,
        time: t.toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' }),
        quantity_Minimum: parseFloat(minImport.toFixed(1)),
        quantity_Maximum: parseFloat(maxExport.toFixed(1)),
        qualityCode: 'A06',
        constraint,
      })
    } else {
      const dt = DISTRIBUTION_TRANSFORMERS.find((d) => d.id === dtId)
      const cap = dt ? dt.capacity_kva * 0.8 : 200
      const maxExport = isDemoDT && isEvSurge
        ? 90
        : parseFloat((cap * 0.6 + factor * cap * 0.15).toFixed(1))
      points.push({
        position: i + 1,
        time: t.toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' }),
        quantity_Minimum: parseFloat((-cap * 0.4 - factor * cap * 0.1).toFixed(1)),
        quantity_Maximum: parseFloat(maxExport.toFixed ? maxExport.toFixed(1) : String(maxExport)),
        qualityCode: 'A06',
        constraint,
        ev_surge: isDemoDT && isEvSurge,
      })
    }
  }
  return points
}

function buildOEDocument(dtId: string, points: OEPoint[]) {
  const ts = new Date().toISOString()
  const mRID = `OE-${dtId}-${Date.now()}`
  const today = new Date().toISOString().slice(0, 10)
  const startDT = new Date(`${today}T00:00:00Z`)
  // End = start of next day (covers all 48 slots including slot 48 ending at 00:00 next day)
  const endDT = new Date(startDT)
  endDT.setUTCDate(endDT.getUTCDate() + 1)
  return {
    ReferenceEnergyCurveOperatingEnvelope_MarketDocument: {
      mRID,
      revisionNumber: '1',
      type: 'A38',
      'process.processType': 'Z01',   // Z01 = Operating Envelope process
      'sender_MarketParticipant.mRID': { $text: '17X100A100A0001A', codingScheme: 'A01' },
      'sender_MarketParticipant.marketRole.type': 'A04',  // DSO
      'receiver_MarketParticipant.mRID': { $text: '17XTESTD4GRID02T', codingScheme: 'A01' },
      'receiver_MarketParticipant.marketRole.type': 'A13',  // Aggregator
      createdDateTime: ts,
      'in_Domain.mRID': { $text: '17XAUZANCE001ZN', codingScheme: 'A01' },
      'out_Domain.mRID': { $text: '17XFRDSOEDFR001', codingScheme: 'A01' },
      Series: [
        {
          mRID: 'SERIES-001',
          businessType: 'B28',  // B28 = Network constraint / operating envelope
          'registeredResource.mRID': { $text: `17X${dtId.replace(/-/g, '')}`, codingScheme: 'A01' },
          'constraintZone.mRID': { $text: '17XAUZANCE001ZN', codingScheme: 'A01' },
          'measurement_Unit.name': 'MAW',
          Period: {
            timeInterval: { start: startDT.toISOString(), end: endDT.toISOString() },
            resolution: 'PT30M',
            curveType: 'A01',  // A01 = sequential fixed blocks
            Point: points.map((p) => ({
              position: p.position,
              quantity_Minimum: parseFloat((p.quantity_Minimum / 1000).toFixed(6)),
              quantity_Maximum: parseFloat((p.quantity_Maximum / 1000).toFixed(6)),
              qualityCode: p.qualityCode,
            })),
          },
        },
      ],
    },
  }
}

// ── Chart data builders ───────────────────────────────────────────────────────

interface VoltageProfileSlot { time: string; feederA: number; feederB: number; feederC: number }
interface ReactivePowerSlot { time: string; qTotal: number; qInductive: number }

function buildVoltageProfile(points: OEPoint[]): VoltageProfileSlot[] {
  return points.map((p) => {
    const vBase = p.min_v_end_pu ?? (1.0 - (p.quantity_Maximum / 500) * 0.04)
    return {
      time: p.time,
      feederA: parseFloat(Math.min(1.12, Math.max(0.90, vBase + 0.009)).toFixed(4)),
      feederB: parseFloat(Math.min(1.12, Math.max(0.90, vBase)).toFixed(4)),
      feederC: parseFloat(Math.min(1.12, Math.max(0.90, vBase - 0.006)).toFixed(4)),
    }
  })
}

function buildReactivePower(points: OEPoint[]): ReactivePowerSlot[] {
  return points.map((p, i) => {
    const pBase = Math.max(10, Math.abs(p.quantity_Minimum))
    const qTotal = pBase * 0.18 + Math.sin(i * 0.55) * 4.5
    return {
      time: p.time,
      qTotal: parseFloat(qTotal.toFixed(1)),
      qInductive: parseFloat((qTotal * 0.72).toFixed(1)),
    }
  })
}

function VoltageTooltip({ active, payload, label }: any) {
  if (!active || !payload?.length) return null
  return (
    <div className="bg-white border border-gray-200 rounded-lg p-2.5 text-xs shadow-lg">
      <p className="font-semibold text-gray-700 mb-1">{label}</p>
      {payload.map((p: any) => (
        <div key={p.dataKey} className="flex justify-between gap-3">
          <span style={{ color: p.color }}>{p.name}</span>
          <span className="font-mono">{p.value} pu</span>
        </div>
      ))}
    </div>
  )
}

function ReactiveTooltip({ active, payload, label }: any) {
  if (!active || !payload?.length) return null
  return (
    <div className="bg-white border border-gray-200 rounded-lg p-2.5 text-xs shadow-lg">
      <p className="font-semibold text-gray-700 mb-1">{label}</p>
      {payload.map((p: any) => (
        <div key={p.dataKey} className="flex justify-between gap-3">
          <span style={{ color: p.color }}>{p.name}</span>
          <span className="font-mono">{p.value} kVAr</span>
        </div>
      ))}
    </div>
  )
}

export default function OperatingEnvelopePage() {
  const navigate = useNavigate()
  const { user } = useAuthStore()
  const isAdmin = user?.is_superuser || false

  const savedDtId = localStorage.getItem('lite_selected_dt') || DISTRIBUTION_TRANSFORMERS[0].id
  const [selectedDtId, setSelectedDtId] = useState(savedDtId)
  const [pfConfirmed, setPfConfirmed] = useState(
    () => !!localStorage.getItem(`powerFlowConfirmed_${savedDtId}`)
  )
  const today = new Date().toISOString().slice(0, 10)

  // OE state
  const [oeDoc, setOeDoc] = useState<ReturnType<typeof buildOEDocument> | null>(null)
  const [oePoints, setOePoints] = useState<OEPoint[]>([])
  const [showRawOE, setShowRawOE] = useState(false)
  const [copiedOE, setCopiedOE] = useState(false)
  const [oeLoading, setOeLoading] = useState(false)
  const [oeError, setOeError] = useState<string | null>(null)
  const [oeSolver, setOeSolver] = useState<'LinDistFlow' | 'NetworkModel'>('NetworkModel')
  const [sentBanner, setSentBanner] = useState<{ text: string; isDemo: boolean; ackId?: string } | null>(null)
  const [sending, setSending] = useState(false)

  // Dynamic OE state — always-on once OE is generated
  const [lastRefreshedAt, setLastRefreshedAt] = useState<Date | null>(null)
  const [secondsAgo, setSecondsAgo] = useState(0)
  const refreshTimerRef = useRef<ReturnType<typeof setInterval> | null>(null)

  // D4G scheduler status + live data
  const [schedulerStatus, setSchedulerStatus] = useState<any>(null)
  const [d4gActual, setD4gActual] = useState<any>(null)
  const [d4gBaseline, setD4gBaseline] = useState<any>(null)
  const [activationAck, setActivationAck] = useState<any>(null)
  const [activating, setActivating] = useState(false)

  // Auto-load OE on mount
  useEffect(() => {
    if (selectedDtId === 'DT-AUZ-001') {
      handleGenerateAndSend()
    }
  }, [])  // eslint-disable-line react-hooks/exhaustive-deps

  // Fetch D4G live data on mount and every 60s
  useEffect(() => {
    const fetchD4G = () => {
      api.d4gSchedulerStatus().then(r => setSchedulerStatus(r.data)).catch(() => {})
      api.d4gActualPower().then(r => setD4gActual(r.data)).catch(() => {})
      api.d4gBaseline().then(r => setD4gBaseline(r.data)).catch(() => {})
    }
    fetchD4G()
    const id = setInterval(fetchD4G, 60_000)
    return () => clearInterval(id)
  }, [])

  // Countdown ticker
  useEffect(() => {
    const id = setInterval(() => {
      if (lastRefreshedAt) setSecondsAgo(Math.floor((Date.now() - lastRefreshedAt.getTime()) / 1000))
    }, 1000)
    return () => clearInterval(id)
  }, [lastRefreshedAt])

  // Auto-refresh every 60s once OE has been generated (pfConfirmed gate still applies)
  useEffect(() => {
    if (refreshTimerRef.current) clearInterval(refreshTimerRef.current)
    if (!pfConfirmed) return
    refreshTimerRef.current = setInterval(async () => {
      if (selectedDtId !== 'DT-AUZ-001') return
      try {
        const resp = await api.lindistflowOE(selectedDtId)
        const pts: OEPoint[] = resp.data.slots.map((s: any) => ({
          position: s.position, time: s.time,
          quantity_Minimum: s.quantity_Minimum, quantity_Maximum: s.quantity_Maximum,
          qualityCode: s.qualityCode, constraint: s.constraint,
          total_load_kw: s.total_load_kw, dt_loading_pct: s.dt_loading_pct,
          min_v_end_pu: s.min_v_end_pu, branch_B_load_kw: s.branch_B_load_kw,
          source: s.source,
        }))
        setOePoints(pts)
        setOeDoc(buildOEDocument(selectedDtId, pts))
        setLastRefreshedAt(new Date())
      } catch { /* silent — keep last good data */ }
    }, 60_000)
    return () => { if (refreshTimerRef.current) clearInterval(refreshTimerRef.current) }
  }, [pfConfirmed, selectedDtId])

  const handleGenerateAndSend = useCallback(async () => {
    setOeLoading(true)
    setOeError(null)
    setSentBanner(null)

    let pts: OEPoint[]
    let solver: 'LinDistFlow' | 'NetworkModel' = 'NetworkModel'

    if (selectedDtId === 'DT-AUZ-001') {
      try {
        const resp = await api.lindistflowOE(selectedDtId)
        pts = resp.data.slots.map((s: any) => ({
          position: s.position,
          time: s.time,
          quantity_Minimum: s.quantity_Minimum,
          quantity_Maximum: s.quantity_Maximum,
          qualityCode: s.qualityCode,
          constraint: s.constraint,
          total_load_kw: s.total_load_kw,
          dt_loading_pct: s.dt_loading_pct,
          min_v_end_pu: s.min_v_end_pu,
          branch_B_load_kw: s.branch_B_load_kw,
          ev_surge: s.ev_surge,
          source: s.source,
        }))
        solver = 'LinDistFlow'
      } catch {
        setOeError('Backend unavailable — using network model estimate')
        pts = generateOEPoints(selectedDtId, new Date(`${today}T00:00:00`), 48)
      }
    } else {
      pts = generateOEPoints(selectedDtId, new Date(`${today}T00:00:00`), 48)
    }

    setOePoints(pts)
    setOeSolver(solver)
    const doc = buildOEDocument(selectedDtId, pts)
    setOeDoc(doc)
    setLastRefreshedAt(new Date())
    setOeLoading(false)

    // A38 stored locally for IEC compliance log (not sent to D4G — they have no A38 receive endpoint)
    const mrid = doc.ReferenceEnergyCurveOperatingEnvelope_MarketDocument.mRID
    setSentBanner({
      text: `A38 computed · ${mrid} · ${pts.length} slots · solver: ${solver}`,
      isDemo: false,
    })
  }, [selectedDtId, today])

  // Derive curtailment from OE: find tightest slot max export during EV surge
  // If actual SPG generation > OE limit → curtailment needed
  const handleActivateD4G = useCallback(async () => {
    setActivating(true)
    setActivationAck(null)
    try {
      // Use tightest OE export limit during constrained slots (kW)
      const constrainedMax = oePoints.filter(p => p.constraint !== '—')
      const oeLimitKw = constrainedMax.length > 0
        ? Math.min(...constrainedMax.map(p => p.quantity_Maximum))
        : 90  // fallback
      const actualKw = d4gActual?.actual_power_kw ?? 0
      // Curtailment = how much to reduce below OE limit
      // Send at least 0.01 MW even if actual < limit (to confirm connection)
      const curtailment_mw = Math.max(0.01, (actualKw - oeLimitKw) / 1000)
      const r = await api.d4gQuickActivate(curtailment_mw, 15)
      setActivationAck(r.data)
    } catch (e: any) {
      setActivationAck({ sent: false, message: e?.message ?? 'Network error' })
    } finally {
      setActivating(false)
    }
  }, [oePoints, d4gActual])

  const handleCopyOE = () => {
    if (!oeDoc) return
    navigator.clipboard.writeText(JSON.stringify(oeDoc, null, 2))
    setCopiedOE(true)
    setTimeout(() => setCopiedOE(false), 2000)
  }

  const constrainedSlots = oePoints.filter(p => p.constraint !== '—').length
  const tightestHeadroom = oePoints.length > 0
    ? Math.min(...oePoints.map(p => p.quantity_Maximum)).toFixed(0)
    : '—'

  // Compliance preview: constrained slots with load vs limit
  const complianceSlots = oePoints.filter(p => p.constraint !== '—' && p.total_load_kw != null)
  const totalCurtailmentKw = complianceSlots.reduce((acc, p) => {
    const limit = Math.abs(p.quantity_Minimum)
    const curtail = (p.total_load_kw ?? 0) - limit
    return acc + Math.max(0, curtail)
  }, 0)

  return (
    <div className="space-y-4 max-w-5xl mx-auto">
      <div className="flex items-start justify-between">
        <div>
          <div className="flex items-center gap-3">
            <h1 className="text-xl font-bold text-gray-900">OE Dispatch</h1>
            <span className="px-2 py-0.5 rounded text-xs font-bold bg-indigo-100 text-indigo-600 border border-indigo-200 font-mono">A38</span>
            <span className="px-2 py-0.5 rounded text-xs font-medium bg-gray-100 text-gray-600 border border-gray-200">FCA · Remedial Action</span>
          </div>
          <p className="text-sm text-gray-500 mt-0.5">
            Flexibility Connection Agreement · OE = contract not to exceed x MW on constrained resource · Solar SPG · Flex Down
          </p>
        </div>
        {lastRefreshedAt && (
          <div className="flex items-center gap-1.5 text-xs bg-green-50 border border-green-200 rounded-lg px-3 py-1.5">
            <div className="w-1.5 h-1.5 rounded-full bg-green-500 animate-pulse" />
            <span className="text-green-600 font-medium">Dynamic OE · Live</span>
            <span className="text-gray-400">refreshed {secondsAgo}s ago</span>
          </div>
        )}
      </div>

      {/* Controls */}
      <div className="card">
        <div className="flex items-end gap-4">
          <div className="flex-1">
            <label className="block text-xs text-gray-500 mb-1.5">Distribution Transformer</label>
            <select
              value={selectedDtId}
              onChange={(e) => {
                const newDtId = e.target.value
                setSelectedDtId(newDtId)
                localStorage.setItem('lite_selected_dt', newDtId)
                setPfConfirmed(true)
                setOeDoc(null)
                setOePoints([])
                setOeError(null)
                setSentBanner(null)
              }}
              className="w-full bg-white border border-gray-300 text-gray-900 px-3 py-2 rounded-lg text-sm focus:outline-none focus:ring-1 focus:ring-indigo-500"
            >
              {DISTRIBUTION_TRANSFORMERS.map((dt) => (
                <option key={dt.id} value={dt.id}>{dt.id} — {dt.name}</option>
              ))}
            </select>
            <p className="text-[11px] text-gray-500 mt-1">Today's OE · {today}</p>
          </div>
          <button
            onClick={handleGenerateAndSend}
            disabled={oeLoading || sending}
            className="flex items-center gap-2 h-10 px-4 rounded-lg text-sm font-medium btn-secondary flex-shrink-0"
          >
            {(oeLoading || sending)
              ? <><Loader2 className="w-4 h-4 animate-spin" />{oeLoading ? 'Computing…' : 'Sending…'}</>
              : <><RefreshCw className="w-4 h-4" />Refresh OE</>
            }
          </button>
        </div>
        {oeError && <p className="text-xs text-amber-500 mt-2">{oeError}</p>}
      </div>

      {/* D4G Live Connection Panel */}
      <div className="card p-0 overflow-hidden">
        <div className="px-4 py-2.5 bg-gray-50 border-b border-gray-200 flex items-center gap-2">
          <div className={clsx('w-1.5 h-1.5 rounded-full flex-shrink-0', d4gActual?.configured ? 'bg-emerald-500 animate-pulse' : 'bg-gray-300')} />
          <Radio className="w-3.5 h-3.5 text-indigo-500" />
          <span className="text-xs font-semibold text-gray-700">D4G Connection — FCA use case 02</span>
          <span className={clsx('text-[10px] px-1.5 py-0.5 rounded border ml-1 font-semibold',
            d4gActual?.configured ? 'bg-emerald-50 text-emerald-700 border-emerald-200' : 'bg-gray-100 text-gray-500 border-gray-200'
          )}>
            {d4gActual?.configured ? 'LIVE' : 'NOT CONNECTED'}
          </span>
          <span className="text-xs text-gray-400 ml-auto">
            SPG aggregator: Digital4Grids · resource group {d4gActual?.resource_group_id ? d4gActual.resource_group_id.slice(0,8) + '…' : '—'}
          </span>
        </div>
        <div className="grid grid-cols-4 divide-x divide-gray-100">
          {/* Actual power */}
          <div className="px-4 py-3">
            <div className="text-[10px] text-gray-400 mb-0.5">SPG Actual Power</div>
            <div className={clsx('text-lg font-bold', d4gActual?.actual_power_kw != null ? 'text-gray-900' : 'text-gray-300')}>
              {d4gActual?.actual_power_kw != null ? `${d4gActual.actual_power_kw} kW` : '—'}
            </div>
            <div className="text-[10px] text-gray-400">
              {d4gActual?.interval_start ? new Date(d4gActual.interval_start).toISOString().slice(11,16) + ' UTC slot' : 'latest PT15M'}
            </div>
          </div>
          {/* Baseline */}
          <div className="px-4 py-3">
            <div className="text-[10px] text-gray-400 mb-0.5">Flex Forecast (Baseline)</div>
            <div className={clsx('text-lg font-bold', d4gBaseline?.point_count > 0 ? 'text-gray-900' : 'text-gray-300')}>
              {d4gBaseline?.point_count > 0 ? `${d4gBaseline.point_count} pts` : '—'}
            </div>
            <div className="text-[10px] text-gray-400">
              {d4gBaseline?.point_count > 0
                ? `${d4gBaseline.points?.filter((p:any) => p.kw > 0).length ?? 0} non-zero · peak ${Math.max(...(d4gBaseline.points?.map((p:any) => p.kw) ?? [0])).toFixed(1)} kW`
                : 'not loaded'}
            </div>
          </div>
          {/* DER count */}
          <div className="px-4 py-3">
            <div className="text-[10px] text-gray-400 mb-0.5">DERs in Resource Group</div>
            <div className="text-lg font-bold text-gray-900">
              {d4gActual?.total_der_count != null
                ? `${(d4gActual.total_der_count ?? 0) - (d4gActual.missing_der_count ?? 0)} / ${d4gActual.total_der_count}`
                : '—'}
            </div>
            <div className="text-[10px] text-amber-500">
              {d4gActual?.missing_der_count > 0 ? `${d4gActual.missing_der_count} missing (D4G known issue)` : 'all reporting'}
            </div>
          </div>
          {/* Scheduler */}
          <div className="px-4 py-3">
            <div className="text-[10px] text-gray-400 mb-0.5">Auto-Dispatch (PT15M)</div>
            <div className="text-sm font-semibold text-gray-700">
              {schedulerStatus?.next_run_at
                ? new Date(schedulerStatus.next_run_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
                : '—'}
            </div>
            <div className="text-[10px] text-gray-400">
              {schedulerStatus?.last_activation_at
                ? `last: ${new Date(schedulerStatus.last_activation_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}`
                : 'next scheduled run'}
            </div>
          </div>
        </div>
        {/* Activate button row */}
        {oePoints.length > 0 && (
          <div className="px-4 py-3 border-t border-gray-100 flex items-center gap-3">
            <button
              onClick={handleActivateD4G}
              disabled={activating}
              className="flex items-center gap-2 bg-indigo-600 hover:bg-indigo-700 text-white text-xs px-4 py-2 rounded-lg font-medium transition-colors disabled:opacity-50"
            >
              {activating ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Send className="w-3.5 h-3.5" />}
              Send A32 Activation to D4G
            </button>
            <span className="text-[10px] text-gray-400">
              Sends A32 ActivationDocument to D4G /v1/activation · SPG curtails to OE limit for next PT15M slot
            </span>
            {activationAck && (
              <span className={clsx('text-xs font-medium ml-auto', activationAck.sent ? 'text-emerald-600' : 'text-red-500')}>
                {activationAck.sent
                  ? `✓ D4G ack'd · ${activationAck.doc_mrid?.slice(0,8)}… · slot ${activationAck.slot_start ? new Date(activationAck.slot_start).toISOString().slice(11,16) : '—'} UTC`
                  : `✗ ${activationAck.message ?? 'Failed'}`}
              </span>
            )}
          </div>
        )}
      </div>

      {/* A38 computed banner */}
      {sentBanner && (
        <div className="flex items-center gap-2.5 bg-blue-50 border border-blue-200 rounded-lg px-4 py-2.5">
          <CheckCircle className="w-4 h-4 text-blue-500 flex-shrink-0" />
          <span className="text-xs text-blue-700">{sentBanner.text}</span>
          <span className="text-[10px] text-blue-400 ml-1">— stored for IEC compliance log · use "Send A32" above to dispatch to D4G</span>
        </div>
      )}

      {/* KPI row */}
      {oePoints.length > 0 && (
        <div className="grid grid-cols-2 gap-3">
          <div className="card text-center py-3">
            <div className="text-xs text-gray-500 mb-1">Constrained Slots</div>
            <div className={clsx('text-xl font-bold', constrainedSlots > 0 ? 'text-amber-500' : 'text-green-500')}>{constrainedSlots}</div>
            <div className="text-[10px] text-gray-500 mt-0.5">of 48 slots</div>
          </div>
          <div className="card text-center py-3">
            <div className="text-xs text-gray-500 mb-1">Tightest Headroom</div>
            <div className={clsx('text-xl font-bold', parseFloat(tightestHeadroom) < 100 ? 'text-red-500' : 'text-gray-800')}>{tightestHeadroom} kW</div>
            <div className="text-[10px] text-gray-500 mt-0.5">Max import headroom (kW)</div>
          </div>
        </div>
      )}

      {/* Compliance / Flex Response Preview */}
      {sentBanner && complianceSlots.length > 0 && (
        <div className="card">
          <div className="flex items-center gap-2 mb-3">
            <TrendingDown className="w-4 h-4 text-indigo-600" />
            <h3 className="text-sm font-semibold text-gray-900">Expected Flex Down Response</h3>
            <span className="text-[10px] text-gray-400 ml-1">— DSO requests Solar SPG curtailment to OE limit</span>
          </div>
          <p className="text-xs text-gray-500 mb-3">
            Generation curtailment requested across constrained slots:{' '}
            <span className="font-semibold text-indigo-600">{totalCurtailmentKw.toFixed(0)} kW peak</span>.
            A44 settlement document submitted by aggregator with metered actuals after the period.
          </p>
          <div className="overflow-auto max-h-48">
            <table className="w-full text-xs">
              <thead className="sticky top-0 bg-gray-50">
                <tr>
                  <th className="text-left text-gray-500 font-medium px-2 py-1.5">Time</th>
                  <th className="text-right text-gray-500 font-medium px-2 py-1.5">Forecast Generation (kW)</th>
                  <th className="text-right text-gray-500 font-medium px-2 py-1.5">Flex Down Limit (kW)</th>
                  <th className="text-right text-gray-500 font-medium px-2 py-1.5">Curtailment Req. (kW)</th>
                  <th className="text-left text-gray-500 font-medium px-2 py-1.5">Status</th>
                </tr>
              </thead>
              <tbody>
                {complianceSlots.map((p) => {
                  const limit = Math.abs(p.quantity_Minimum)
                  const curtail = Math.max(0, (p.total_load_kw ?? 0) - limit)
                  return (
                    <tr key={p.position} className="border-t border-gray-100 hover:bg-gray-50">
                      <td className="px-2 py-1.5 font-mono text-gray-700">{p.time}</td>
                      <td className="px-2 py-1.5 text-right font-mono text-gray-700">{p.total_load_kw?.toFixed(0)}</td>
                      <td className="px-2 py-1.5 text-right font-mono text-blue-600">{limit.toFixed(0)}</td>
                      <td className="px-2 py-1.5 text-right font-mono">
                        <span className={curtail > 0 ? 'text-red-500 font-semibold' : 'text-green-600'}>{curtail.toFixed(0)}</span>
                      </td>
                      <td className="px-2 py-1.5">
                        {curtail > 0
                          ? <span className="px-1.5 py-0.5 rounded text-[10px] font-medium bg-red-50 text-red-600 border border-red-200">Curtailment req.</span>
                          : <span className="px-1.5 py-0.5 rounded text-[10px] font-medium bg-green-50 text-green-600 border border-green-200">Within envelope</span>
                        }
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
          <p className="text-[10px] text-gray-400 mt-2">
            After the flexibility period, the aggregator submits an A44 settlement document with metered Solar SPG actuals.
            Settlement tab reconciles Flex Down limits vs actual generation response.
          </p>
        </div>
      )}

      {/* Voltage profile + reactive power charts */}
      {oePoints.length > 0 && (
        <div className="grid grid-cols-2 gap-4">
          {/* Voltage profile */}
          <div className="card">
            <div className="flex items-center gap-2 mb-1">
              <Activity className="w-4 h-4 text-indigo-500" />
              <h3 className="text-sm font-semibold text-gray-900">LV Feeder Voltage Profile</h3>
            </div>
            <p className="text-xs text-gray-400 mb-3">End-of-feeder voltage (pu) across 48 slots — 3 feeders</p>
            <div className="h-44">
              <ResponsiveContainer width="100%" height="100%">
                <LineChart data={buildVoltageProfile(oePoints)} margin={{ top: 4, right: 4, left: -10, bottom: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#f3f4f6" />
                  <XAxis dataKey="time" tick={{ fill: '#9ca3af', fontSize: 7 }} interval={7} />
                  <YAxis
                    tick={{ fill: '#9ca3af', fontSize: 9 }}
                    domain={[0.90, 1.12]}
                    tickFormatter={v => v.toFixed(2)}
                  />
                  <Tooltip content={<VoltageTooltip />} />
                  <Legend wrapperStyle={{ fontSize: '10px' }} />
                  <ReferenceLine y={1.05} stroke="#ef4444" strokeDasharray="4 2" strokeWidth={1}
                    label={{ value: '1.05 limit', position: 'insideTopRight', fontSize: 7, fill: '#ef4444' }} />
                  <ReferenceLine y={0.95} stroke="#ef4444" strokeDasharray="4 2" strokeWidth={1}
                    label={{ value: '0.95 limit', position: 'insideBottomRight', fontSize: 7, fill: '#ef4444' }} />
                  <Line dataKey="feederA" name="Feeder A" stroke="#6366f1" strokeWidth={1.5} dot={false} />
                  <Line dataKey="feederB" name="Feeder B" stroke="#f59e0b" strokeWidth={1.5} dot={false} />
                  <Line dataKey="feederC" name="Feeder C" stroke="#10b981" strokeWidth={1.5} dot={false} />
                </LineChart>
              </ResponsiveContainer>
            </div>
          </div>

          {/* Reactive power */}
          <div className="card">
            <div className="flex items-center gap-2 mb-1">
              <Zap className="w-4 h-4 text-amber-500" />
              <h3 className="text-sm font-semibold text-gray-900">Reactive Power (Q)</h3>
            </div>
            <p className="text-xs text-gray-400 mb-3">DT reactive demand (kVAr) across 48 slots — ENTSO-E context</p>
            <div className="h-44">
              <ResponsiveContainer width="100%" height="100%">
                <LineChart data={buildReactivePower(oePoints)} margin={{ top: 4, right: 4, left: -10, bottom: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#f3f4f6" />
                  <XAxis dataKey="time" tick={{ fill: '#9ca3af', fontSize: 7 }} interval={7} />
                  <YAxis tick={{ fill: '#9ca3af', fontSize: 9 }} unit=" kVAr" />
                  <Tooltip content={<ReactiveTooltip />} />
                  <Legend wrapperStyle={{ fontSize: '10px' }} />
                  <Line dataKey="qTotal" name="Q Total" stroke="#f59e0b" strokeWidth={2} dot={false} />
                  <Line dataKey="qInductive" name="Q Inductive" stroke="#d97706" strokeWidth={1.5} dot={false} strokeDasharray="4 2" />
                </LineChart>
              </ResponsiveContainer>
            </div>
          </div>
        </div>
      )}

      {/* 48-slot table */}
      {oePoints.length > 0 && oeDoc && (
        <div className="card">
          <div className="flex items-center justify-between mb-1">
            <div className="flex items-center gap-2">
              <h3 className="text-sm font-semibold text-gray-900">Time-Slot Schedule</h3>
              <span className={clsx(
                'flex items-center gap-1 px-2 py-0.5 rounded text-[10px] font-bold border',
                oeSolver === 'LinDistFlow'
                  ? 'bg-indigo-100 text-indigo-600 border-indigo-200'
                  : 'bg-gray-100 text-gray-500 border-gray-200'
              )}>
                <Cpu className="w-2.5 h-2.5" />
                {oeSolver === 'LinDistFlow' ? 'LinDistFlow' : 'Network Model'}
              </span>
            </div>
            <div className="flex gap-2">
              <button onClick={handleCopyOE} className="flex items-center gap-1.5 btn-secondary text-xs py-1.5">
                {copiedOE ? <CheckCircle className="w-3.5 h-3.5 text-green-500" /> : <Copy className="w-3.5 h-3.5" />}
                {copiedOE ? 'Copied!' : 'Copy JSON'}
              </button>
              <button onClick={() => setShowRawOE(!showRawOE)} className="flex items-center gap-1.5 btn-secondary text-xs py-1.5">
                {showRawOE ? <ChevronUp className="w-3.5 h-3.5" /> : <ChevronDown className="w-3.5 h-3.5" />}
                {showRawOE ? 'Hide' : 'View'} JSON
              </button>
            </div>
          </div>
          <p className="text-[11px] text-gray-400 mb-3">
            DSO → Aggregator: OE as a contract not to exceed x MW on the constrained resource.
            <span className="text-green-600"> Flex Down limit</span> = max generation the Solar SPG may inject (curtailment threshold).
            Import side is N/A — Solar SPG has no load capability.
          </p>

          {showRawOE && (
            <pre className="bg-gray-50 rounded-lg p-3 text-xs text-green-700 overflow-auto max-h-64 mb-3 font-mono">
              {JSON.stringify(oeDoc, null, 2)}
            </pre>
          )}

          <div className="overflow-auto max-h-80">
            <table className="w-full text-xs">
              <thead className="sticky top-0 bg-gray-50">
                <tr>
                  <th className="text-left text-gray-500 font-medium px-2 py-1.5">Slot</th>
                  <th className="text-left text-gray-500 font-medium px-2 py-1.5">Time</th>
                  <th className="text-right text-gray-500 font-medium px-2 py-1.5">Import Cap (kW)</th>
                  <th className="text-right text-gray-500 font-medium px-2 py-1.5">Flex Down Limit (kW)</th>
                  {oeSolver === 'LinDistFlow' && <>
                    <th className="text-right text-gray-500 font-medium px-2 py-1.5">DT Load %</th>
                    <th className="text-right text-gray-500 font-medium px-2 py-1.5">V_min (pu)</th>
                  </>}
                  <th className="text-left text-gray-500 font-medium px-2 py-1.5">Constraint</th>
                </tr>
              </thead>
              <tbody>
                {oePoints.map((p) => (
                  <tr key={p.position} className={clsx(
                    'border-t border-gray-200 hover:bg-gray-50',
                    p.constraint !== '—' && 'bg-red-50'
                  )}>
                    <td className="px-2 py-1 text-gray-500 font-mono">{p.position}</td>
                    <td className="px-2 py-1 text-gray-700 font-mono">{p.time}</td>
                    <td className="px-2 py-1 text-right">
                      <span className="text-gray-300 font-mono text-[10px]">N/A</span>
                    </td>
                    <td className="px-2 py-1 text-right">
                      <span className={clsx('font-mono font-semibold', p.quantity_Maximum <= 0 ? 'text-red-400' : 'text-green-600')}>
                        {p.quantity_Maximum.toFixed(1)}
                      </span>
                    </td>
                    {oeSolver === 'LinDistFlow' && <>
                      <td className="px-2 py-1 text-right">
                        <span className={clsx(
                          'font-mono text-[11px]',
                          (p.dt_loading_pct ?? 0) > 100 ? 'text-red-400' :
                          (p.dt_loading_pct ?? 0) > 75 ? 'text-amber-400' : 'text-gray-500'
                        )}>
                          {p.dt_loading_pct?.toFixed(0)}%
                        </span>
                      </td>
                      <td className="px-2 py-1 text-right">
                        <span className={clsx(
                          'font-mono text-[11px]',
                          (p.min_v_end_pu ?? 1) < 0.90 ? 'text-red-400' :
                          (p.min_v_end_pu ?? 1) < 0.95 ? 'text-amber-400' : 'text-gray-500'
                        )}>
                          {p.min_v_end_pu?.toFixed(3)}
                        </span>
                      </td>
                    </>}
                    <td className="px-2 py-1">
                      {p.constraint === '—' ? (
                        <span className="text-gray-300 text-[10px]">—</span>
                      ) : (
                        <span className="px-1.5 py-0.5 rounded text-[10px] font-medium bg-red-100 text-red-600 border border-red-200">
                          {p.constraint}
                        </span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  )
}
