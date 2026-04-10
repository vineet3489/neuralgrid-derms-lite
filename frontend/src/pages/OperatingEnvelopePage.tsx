import React, { useState, useCallback } from 'react'
import { DISTRIBUTION_TRANSFORMERS } from '../data/auzanceNetwork'
import { CheckCircle, Copy, ChevronDown, ChevronUp, Loader2, Send, Cpu } from 'lucide-react'
import clsx from 'clsx'
import { api } from '../api/client'

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
      })
    }
  }
  return points
}

function buildOEDocument(dtId: string, startDate: string, points: OEPoint[]) {
  const ts = new Date().toISOString()
  const mRID = `OE-${dtId}-${Date.now()}`
  const startDT = new Date(`${startDate}T00:00:00`)
  const endDT = new Date(`${startDate}T23:30:00`)
  return {
    ReferenceEnergyCurveOperatingEnvelope_MarketDocument: {
      mRID,
      type: 'A44',
      'process.processType': 'Z01',
      'sender_MarketParticipant.mRID': '17X100A100A0001A',
      'receiver_MarketParticipant.mRID': '17XTESTD4GRID02T',
      createdDateTime: ts,
      Series: [
        {
          mRID: 'SERIES-001',
          businessType: 'A96',
          Period: {
            timeInterval: {
              start: startDT.toISOString(),
              end: endDT.toISOString(),
            },
            resolution: 'PT30M',
            Point: points.map((p) => ({
              position: p.position,
              quantity_Minimum: p.quantity_Minimum,
              quantity_Maximum: p.quantity_Maximum,
              qualityCode: p.qualityCode,
            })),
          },
        },
      ],
    },
  }
}

export default function OperatingEnvelopePage() {
  const savedDtId = localStorage.getItem('lite_selected_dt') || DISTRIBUTION_TRANSFORMERS[0].id
  const [selectedDtId, setSelectedDtId] = useState(savedDtId)

  const today = new Date().toISOString().slice(0, 10)
  const [oeDate, setOeDate] = useState(today)

  const [oeDoc, setOeDoc] = useState<ReturnType<typeof buildOEDocument> | null>(null)
  const [oePoints, setOePoints] = useState<OEPoint[]>([])
  const [showRawOE, setShowRawOE] = useState(false)
  const [copiedOE, setCopiedOE] = useState(false)
  const [oeLoading, setOeLoading] = useState(false)
  const [oeError, setOeError] = useState<string | null>(null)
  const [oeSolver, setOeSolver] = useState<'LinDistFlow' | 'Heuristic'>('Heuristic')
  const [sentBanner, setSentBanner] = useState<string | null>(null)
  const [sending, setSending] = useState(false)

  const handleGenerateAndSend = useCallback(async () => {
    setOeLoading(true)
    setOeError(null)
    setSentBanner(null)

    let pts: OEPoint[]
    let solver: 'LinDistFlow' | 'Heuristic' = 'Heuristic'

    // Try LinDistFlow backend for DT-AUZ-001
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
        setOeError('Backend unavailable — using heuristic fallback')
        const startDT = new Date(`${oeDate}T00:00:00`)
        pts = generateOEPoints(selectedDtId, startDT, 48)
      }
    } else {
      const startDT = new Date(`${oeDate}T00:00:00`)
      pts = generateOEPoints(selectedDtId, startDT, 48)
    }

    setOePoints(pts)
    setOeSolver(solver)
    const doc = buildOEDocument(selectedDtId, oeDate, pts)
    setOeDoc(doc)
    setOeLoading(false)

    // Simulate send to D4G
    setSending(true)
    await new Promise(r => setTimeout(r, 800))
    setSending(false)
    const mrid = doc.ReferenceEnergyCurveOperatingEnvelope_MarketDocument.mRID
    setSentBanner(`A38 sent to Digital4Grids · ${mrid}`)
  }, [selectedDtId, oeDate])

  const handleCopyOE = () => {
    if (!oeDoc) return
    navigator.clipboard.writeText(JSON.stringify(oeDoc, null, 2))
    setCopiedOE(true)
    setTimeout(() => setCopiedOE(false), 2000)
  }

  // KPI derivations
  const constrainedSlots = oePoints.filter(p => p.constraint !== '—').length
  const tightestHeadroom = oePoints.length > 0
    ? Math.min(...oePoints.map(p => p.quantity_Maximum)).toFixed(0)
    : '—'
  const evSurgeSlots = oePoints.filter(p => p.ev_surge).length

  return (
    <div className="space-y-4 max-w-5xl mx-auto">
      <div>
        <div className="flex items-center gap-3">
          <h1 className="text-xl font-bold text-white">OE Dispatch</h1>
          <span className="px-2 py-0.5 rounded text-xs font-bold bg-indigo-900/60 text-indigo-300 border border-indigo-700/40 font-mono">A38</span>
        </div>
        <p className="text-sm text-gray-400 mt-0.5">IEC 62746-4 · A38 ReferenceEnergyCurveOperatingEnvelope · 48-slot · PT30M</p>
      </div>

      {/* Controls */}
      <div className="card">
        <div className="grid grid-cols-3 gap-4 items-end">
          <div className="col-span-1">
            <label className="block text-xs text-gray-400 mb-1.5">Distribution Transformer</label>
            <select
              value={selectedDtId}
              onChange={(e) => {
                setSelectedDtId(e.target.value)
                localStorage.setItem('lite_selected_dt', e.target.value)
                setOeDoc(null)
                setOePoints([])
                setOeError(null)
                setSentBanner(null)
              }}
              className="w-full bg-gray-700 border border-gray-600 text-gray-100 px-3 py-2 rounded-lg text-sm focus:outline-none focus:ring-1 focus:ring-indigo-500"
            >
              {DISTRIBUTION_TRANSFORMERS.map((dt) => (
                <option key={dt.id} value={dt.id}>
                  {dt.id} — {dt.name}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className="block text-xs text-gray-400 mb-1.5">Date</label>
            <input
              type="date"
              value={oeDate}
              onChange={(e) => setOeDate(e.target.value)}
              className="w-full bg-gray-700 border border-gray-600 text-gray-100 px-3 py-2 rounded-lg text-sm focus:outline-none focus:ring-1 focus:ring-indigo-500"
            />
          </div>
          <button
            onClick={handleGenerateAndSend}
            disabled={oeLoading || sending}
            className="btn-primary flex items-center justify-center gap-2 h-10"
          >
            {(oeLoading || sending)
              ? <><Loader2 className="w-4 h-4 animate-spin" />{oeLoading ? 'Computing…' : 'Sending…'}</>
              : <><Send className="w-4 h-4" />Generate &amp; Send A38</>
            }
          </button>
        </div>
        {oeError && <p className="text-xs text-amber-400 mt-2">{oeError}</p>}
      </div>

      {/* Success banner */}
      {sentBanner && (
        <div className="flex items-center gap-2.5 bg-green-900/20 border border-green-700/40 rounded-lg px-4 py-3 text-sm text-green-300">
          <CheckCircle className="w-4 h-4 flex-shrink-0" />
          {sentBanner}
        </div>
      )}

      {/* KPI row */}
      {oePoints.length > 0 && (
        <div className="grid grid-cols-3 gap-3">
          <div className="card text-center py-3">
            <div className="text-xs text-gray-400 mb-1">Constrained Slots</div>
            <div className={clsx('text-xl font-bold', constrainedSlots > 0 ? 'text-amber-400' : 'text-green-400')}>{constrainedSlots}</div>
            <div className="text-[10px] text-gray-500 mt-0.5">of 48 slots</div>
          </div>
          <div className="card text-center py-3">
            <div className="text-xs text-gray-400 mb-1">Tightest Headroom</div>
            <div className={clsx('text-xl font-bold', parseFloat(tightestHeadroom) < 100 ? 'text-red-400' : 'text-gray-200')}>{tightestHeadroom} kW</div>
            <div className="text-[10px] text-gray-500 mt-0.5">Export max</div>
          </div>
          <div className="card text-center py-3">
            <div className="text-xs text-gray-400 mb-1">EV Surge Slots</div>
            <div className={clsx('text-xl font-bold', evSurgeSlots > 0 ? 'text-blue-400' : 'text-gray-400')}>{evSurgeSlots}</div>
            <div className="text-[10px] text-gray-500 mt-0.5">slots flagged EV</div>
          </div>
        </div>
      )}

      {/* 48-slot table */}
      {oePoints.length > 0 && oeDoc && (
        <div className="card">
          <div className="flex items-center justify-between mb-3">
            <div className="flex items-center gap-2">
              <h3 className="text-sm font-semibold text-white">Time-Slot Schedule</h3>
              <span className={clsx(
                'flex items-center gap-1 px-2 py-0.5 rounded text-[10px] font-bold border',
                oeSolver === 'LinDistFlow'
                  ? 'bg-indigo-900/60 text-indigo-300 border-indigo-700/40'
                  : 'bg-gray-800 text-gray-400 border-gray-700/40'
              )}>
                <Cpu className="w-2.5 h-2.5" />
                {oeSolver}
              </span>
            </div>
            <div className="flex gap-2">
              <button onClick={handleCopyOE} className="flex items-center gap-1.5 btn-secondary text-xs py-1.5">
                {copiedOE ? <CheckCircle className="w-3.5 h-3.5 text-green-400" /> : <Copy className="w-3.5 h-3.5" />}
                {copiedOE ? 'Copied!' : 'Copy JSON'}
              </button>
              <button
                onClick={() => setShowRawOE(!showRawOE)}
                className="flex items-center gap-1.5 btn-secondary text-xs py-1.5"
              >
                {showRawOE ? <ChevronUp className="w-3.5 h-3.5" /> : <ChevronDown className="w-3.5 h-3.5" />}
                {showRawOE ? 'Hide' : 'View'} JSON
              </button>
            </div>
          </div>

          {showRawOE && (
            <pre className="bg-gray-950 rounded-lg p-3 text-xs text-green-300 overflow-auto max-h-64 mb-3 font-mono">
              {JSON.stringify(oeDoc, null, 2)}
            </pre>
          )}

          <div className="overflow-auto max-h-80">
            <table className="w-full text-xs">
              <thead className="sticky top-0 bg-gray-800">
                <tr>
                  <th className="text-left text-gray-400 font-medium px-2 py-1.5">Slot</th>
                  <th className="text-left text-gray-400 font-medium px-2 py-1.5">Time</th>
                  <th className="text-right text-gray-400 font-medium px-2 py-1.5">Import Max (kW)</th>
                  <th className="text-right text-gray-400 font-medium px-2 py-1.5">Export Max (kW)</th>
                  {oeSolver === 'LinDistFlow' && <>
                    <th className="text-right text-gray-400 font-medium px-2 py-1.5">DT Load %</th>
                    <th className="text-right text-gray-400 font-medium px-2 py-1.5">V_min (pu)</th>
                  </>}
                  <th className="text-left text-gray-400 font-medium px-2 py-1.5">Constraint</th>
                </tr>
              </thead>
              <tbody>
                {oePoints.map((p) => (
                  <tr key={p.position} className={clsx(
                    'border-t border-gray-700/50 hover:bg-gray-800/40',
                    p.constraint !== '—' && 'bg-red-950/20'
                  )}>
                    <td className="px-2 py-1 text-gray-400 font-mono">{p.position}</td>
                    <td className="px-2 py-1 text-gray-300 font-mono">
                      {p.time}
                      {p.ev_surge && <span className="ml-1 text-[9px] text-amber-400 font-bold">EV</span>}
                    </td>
                    <td className="px-2 py-1 text-right">
                      <span className="text-blue-300 font-mono">{Math.abs(p.quantity_Minimum).toFixed(1)}</span>
                    </td>
                    <td className="px-2 py-1 text-right">
                      <span className={clsx(
                        'font-mono',
                        p.quantity_Maximum <= 0 ? 'text-red-400' : 'text-green-300'
                      )}>{p.quantity_Maximum.toFixed(1)}</span>
                    </td>
                    {oeSolver === 'LinDistFlow' && <>
                      <td className="px-2 py-1 text-right">
                        <span className={clsx(
                          'font-mono text-[11px]',
                          (p.dt_loading_pct ?? 0) > 100 ? 'text-red-400' :
                          (p.dt_loading_pct ?? 0) > 75 ? 'text-amber-400' : 'text-gray-400'
                        )}>
                          {p.dt_loading_pct?.toFixed(0)}%
                        </span>
                      </td>
                      <td className="px-2 py-1 text-right">
                        <span className={clsx(
                          'font-mono text-[11px]',
                          (p.min_v_end_pu ?? 1) < 0.94 ? 'text-red-400' :
                          (p.min_v_end_pu ?? 1) < 0.97 ? 'text-amber-400' : 'text-gray-400'
                        )}>
                          {p.min_v_end_pu?.toFixed(3)}
                        </span>
                      </td>
                    </>}
                    <td className="px-2 py-1">
                      {p.constraint === '—' ? (
                        <span className="text-gray-600 text-[10px]">—</span>
                      ) : (
                        <span className="px-1.5 py-0.5 rounded text-[10px] font-medium bg-red-900/50 text-red-300 border border-red-800/40">
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
