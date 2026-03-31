import React, { useState } from 'react'
import {
  ComposedChart, Area, Line, XAxis, YAxis, CartesianGrid, Tooltip,
  Legend, ResponsiveContainer, ReferenceLine,
} from 'recharts'
import { DISTRIBUTION_TRANSFORMERS, DER_ASSETS } from '../data/auzanceNetwork'
import { CheckCircle, Copy, ChevronDown, ChevronUp, Loader2, Send } from 'lucide-react'
import clsx from 'clsx'

interface OEPoint {
  position: number
  time: string
  quantity_Minimum: number
  quantity_Maximum: number
  qualityCode: string
}

function generateOEPoints(dtId: string, startTime: Date, count = 48): OEPoint[] {
  const isCritical = dtId === 'DT-AUZ-005'
  const points: OEPoint[] = []
  for (let i = 0; i < count; i++) {
    const t = new Date(startTime.getTime() + i * 30 * 60 * 1000)
    const hour = t.getHours() + t.getMinutes() / 60
    // Sine wave variation across the day (peak midday)
    const sineVal = Math.sin((Math.PI * (hour - 6)) / 12)
    const factor = Math.max(0, sineVal)
    if (isCritical) {
      // Constrained: max export 120 kW during day, reduced further at night
      const maxExport = factor > 0.1 ? 120 - factor * 20 : 50
      const minImport = factor > 0.1 ? -(50 - factor * 10) : -30
      points.push({
        position: i + 1,
        time: t.toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' }),
        quantity_Minimum: parseFloat(minImport.toFixed(1)),
        quantity_Maximum: parseFloat(maxExport.toFixed(1)),
        qualityCode: 'A06',
      })
    } else {
      const dt = DISTRIBUTION_TRANSFORMERS.find((d) => d.id === dtId)
      const cap = dt ? dt.capacity_kva * 0.8 : 200
      points.push({
        position: i + 1,
        time: t.toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' }),
        quantity_Minimum: parseFloat((-cap * 0.4 - factor * cap * 0.1).toFixed(1)),
        quantity_Maximum: parseFloat((cap * 0.6 + factor * cap * 0.15).toFixed(1)),
        qualityCode: 'A06',
      })
    }
  }
  return points
}

function buildOEDocument(dtId: string, startDate: string, startTime: string, endTime: string, points: OEPoint[]) {
  const ts = new Date().toISOString()
  const mRID = `OE-${dtId}-${Date.now()}`
  const startDT = new Date(`${startDate}T${startTime}:00`)
  const endDT = new Date(`${startDate}T${endTime}:00`)
  return {
    ReferenceEnergyCurveOperatingEnvelope_MarketDocument: {
      mRID,
      type: 'A44',
      'process.processType': 'Z01',
      'sender_MarketParticipant.mRID': 'neuralgrid-derms',
      'receiver_MarketParticipant.mRID': 'd4g-aggregator-001',
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

function buildD4GResponse(dtId: string, oeDoc: ReturnType<typeof buildOEDocument>) {
  const ts = Date.now()
  const oeId = oeDoc.ReferenceEnergyCurveOperatingEnvelope_MarketDocument.mRID
  const isCritical = dtId === 'DT-AUZ-005'
  return {
    FlexOfferResponse_MarketDocument: {
      mRID: `D4G-RESP-${ts}`,
      correlationID: oeId,
      status: 'ACKNOWLEDGED',
      DERGroupStatus: isCritical
        ? [
            {
              assetID: 'AST-AUZ-009',
              assetName: 'Bois-Rond Solar Farm',
              availableCapacity_kW: 250,
              currentGeneration_kW: 285.6,
              committedCurtailment_kW: 165.6,
              confirmedLimit_kW: 120.0,
            },
            {
              assetID: 'AST-AUZ-010',
              assetName: 'Bois-Rond BESS',
              availableCapacity_kW: 120,
              currentGeneration_kW: 142.8,
              committedCurtailment_kW: 22.8,
              confirmedLimit_kW: 120.0,
            },
          ]
        : DER_ASSETS.filter((a) => a.dt_id === dtId).map((a) => ({
            assetID: a.id,
            assetName: a.name,
            availableCapacity_kW: a.capacity_kw,
            currentGeneration_kW: Math.abs(a.current_kw),
            committedCurtailment_kW: 0,
            confirmedLimit_kW: a.doe_export_kw ?? a.capacity_kw,
          })),
    },
  }
}

export default function OperatingEnvelopePage() {
  const savedDtId = localStorage.getItem('lite_selected_dt') || DISTRIBUTION_TRANSFORMERS[0].id
  const [selectedDtId, setSelectedDtId] = useState(savedDtId)

  const today = new Date().toISOString().slice(0, 10)
  const [oeDate, setOeDate] = useState(today)
  const [oeStartTime, setOeStartTime] = useState('00:00')
  const [oeEndTime, setOeEndTime] = useState('23:30')

  const [oeDoc, setOeDoc] = useState<ReturnType<typeof buildOEDocument> | null>(null)
  const [oePoints, setOePoints] = useState<OEPoint[]>([])
  const [showRawOE, setShowRawOE] = useState(false)
  const [copiedOE, setCopiedOE] = useState(false)

  // D4G state
  const [endpoint, setEndpoint] = useState('https://d4g-aggregator.example.com/oe/receive')
  const [protocol, setProtocol] = useState('IEC 62746-4')
  const [sending, setSending] = useState(false)
  const [d4gResponse, setD4gResponse] = useState<ReturnType<typeof buildD4GResponse> | null>(null)
  const [showRawD4G, setShowRawD4G] = useState(false)

  const handleGenerateOE = () => {
    const startDT = new Date(`${oeDate}T${oeStartTime}:00`)
    const pts = generateOEPoints(selectedDtId, startDT, 48)
    setOePoints(pts)
    const doc = buildOEDocument(selectedDtId, oeDate, oeStartTime, oeEndTime, pts)
    setOeDoc(doc)
    setD4gResponse(null)
  }

  const handleCopyOE = () => {
    if (!oeDoc) return
    navigator.clipboard.writeText(JSON.stringify(oeDoc, null, 2))
    setCopiedOE(true)
    setTimeout(() => setCopiedOE(false), 2000)
  }

  const handleSendD4G = async () => {
    if (!oeDoc) return
    setSending(true)
    await new Promise((r) => setTimeout(r, 1500))
    setSending(false)
    setD4gResponse(buildD4GResponse(selectedDtId, oeDoc))
  }

  const rollingOEData = React.useMemo(() => {
    if (oePoints.length === 0) return []
    const now = new Date()
    const slots = []
    for (let i = -12; i < 12; i++) {
      const t = new Date(now.getTime() + i * 30 * 60 * 1000)
      const h = t.getHours()
      const m = t.getMinutes() < 30 ? '00' : '30'
      const label = `${String(h).padStart(2,'0')}:${m}`
      const isPast = i < 0
      const slotIdx = Math.min(Math.max(Math.floor((h * 60 + t.getMinutes()) / 30), 0), 47)
      const slot = oePoints[slotIdx] || oePoints[0]
      const exportLimit = slot?.quantity_Maximum ?? 120
      const importLimit = slot ? Math.abs(slot.quantity_Minimum) : 50
      // Simulate actual generation for past slots (noisy around export limit)
      const actualGen = isPast ? Math.max(0, exportLimit * (0.8 + Math.random() * 0.35)) : undefined
      slots.push({ label, exportLimit, importLimit, actualGen })
    }
    return slots
  }, [oePoints])

  const d4gDers = d4gResponse?.FlexOfferResponse_MarketDocument.DERGroupStatus || []
  const totalFlex = d4gDers.reduce((s, a) => s + a.availableCapacity_kW, 0)
  const totalCurrentGen = d4gDers.reduce((s, a) => s + a.currentGeneration_kW, 0)
  const totalCommitted = d4gDers.reduce((s, a) => s + a.committedCurtailment_kW, 0)

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-xl font-bold text-white">Operating Envelope</h1>
        <p className="text-sm text-gray-400 mt-0.5">IEC 62746-4 · 48-slot rolling window · published every 30 min</p>
      </div>

      <div className="grid grid-cols-2 gap-6">
        {/* LEFT — OE Generation */}
        <div className="space-y-4">
          <div className="card">
            <h2 className="text-sm font-semibold text-white mb-4">OE Generation</h2>

            <div className="space-y-3">
              <div>
                <label className="block text-xs text-gray-400 mb-1.5">Distribution Transformer</label>
                <select
                  value={selectedDtId}
                  onChange={(e) => { setSelectedDtId(e.target.value); localStorage.setItem('lite_selected_dt', e.target.value); setOeDoc(null); setD4gResponse(null) }}
                  className="w-full bg-gray-700 border border-gray-600 text-gray-100 px-3 py-2 rounded-lg text-sm focus:outline-none focus:ring-1 focus:ring-indigo-500"
                >
                  {DISTRIBUTION_TRANSFORMERS.map((dt) => (
                    <option key={dt.id} value={dt.id}>
                      {dt.id} — {dt.name}
                    </option>
                  ))}
                </select>
              </div>

              <div className="grid grid-cols-3 gap-2">
                <div>
                  <label className="block text-xs text-gray-400 mb-1.5">Date</label>
                  <input
                    type="date"
                    value={oeDate}
                    onChange={(e) => setOeDate(e.target.value)}
                    className="w-full bg-gray-700 border border-gray-600 text-gray-100 px-2 py-2 rounded-lg text-sm focus:outline-none focus:ring-1 focus:ring-indigo-500"
                  />
                </div>
                <div>
                  <label className="block text-xs text-gray-400 mb-1.5">Start Time</label>
                  <input
                    type="time"
                    value={oeStartTime}
                    onChange={(e) => setOeStartTime(e.target.value)}
                    className="w-full bg-gray-700 border border-gray-600 text-gray-100 px-2 py-2 rounded-lg text-sm focus:outline-none focus:ring-1 focus:ring-indigo-500"
                  />
                </div>
                <div>
                  <label className="block text-xs text-gray-400 mb-1.5">End Time</label>
                  <input
                    type="time"
                    value={oeEndTime}
                    onChange={(e) => setOeEndTime(e.target.value)}
                    className="w-full bg-gray-700 border border-gray-600 text-gray-100 px-2 py-2 rounded-lg text-sm focus:outline-none focus:ring-1 focus:ring-indigo-500"
                  />
                </div>
              </div>

              <button onClick={handleGenerateOE} className="w-full btn-primary">
                Generate OE Document
              </button>
            </div>
          </div>

          {/* Rolling OE Timeline Chart */}
          {oePoints.length > 0 && (
            <div className="mt-4">
              <h3 className="text-xs font-semibold text-gray-400 uppercase tracking-wide mb-2">
                Rolling OE Timeline — 30-min windows
              </h3>
              <p className="text-xs text-gray-500 mb-3">
                Past 6h (actual vs limit) + Next 6h (scheduled OE). Updates every 30 min.
              </p>
              <div className="h-52">
                <ResponsiveContainer width="100%" height="100%">
                  <ComposedChart data={rollingOEData} margin={{ top: 5, right: 10, left: 0, bottom: 5 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#374151" />
                    <XAxis dataKey="label" tick={{ fill: '#9ca3af', fontSize: 9 }} interval={3} />
                    <YAxis tick={{ fill: '#9ca3af', fontSize: 10 }} unit=" kW" />
                    <Tooltip
                      contentStyle={{ background: '#1f2937', border: '1px solid #374151', borderRadius: 8, fontSize: 11 }}
                    />
                    <Legend wrapperStyle={{ fontSize: 10, color: '#9ca3af' }} />
                    <ReferenceLine x={rollingOEData[12]?.label} stroke="#818cf8" strokeWidth={2} label={{ value: 'Now', fill: '#818cf8', fontSize: 10 }} />
                    <Area type="monotone" dataKey="exportLimit" name="Export Cap kW" fill="#10b98133" stroke="#10b981" strokeWidth={1.5} />
                    <Area type="monotone" dataKey="importLimit" name="Import Cap kW" fill="#3b82f633" stroke="#3b82f6" strokeWidth={1.5} />
                    <Line type="monotone" dataKey="actualGen" name="Actual Gen kW" stroke="#f59e0b" strokeWidth={2} dot={false} connectNulls />
                  </ComposedChart>
                </ResponsiveContainer>
              </div>
            </div>
          )}

          {/* OE Table */}
          {oePoints.length > 0 && oeDoc && (
            <div className="card">
              <div className="flex items-center justify-between mb-3">
                <h3 className="text-sm font-semibold text-white">Time-Slot Schedule (48 slots · PT30M)</h3>
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
                      <th className="text-center text-gray-400 font-medium px-2 py-1.5">Quality</th>
                    </tr>
                  </thead>
                  <tbody>
                    {oePoints.map((p) => (
                      <tr key={p.position} className="border-t border-gray-700/50 hover:bg-gray-800/40">
                        <td className="px-2 py-1 text-gray-400 font-mono">{p.position}</td>
                        <td className="px-2 py-1 text-gray-300 font-mono">{p.time}</td>
                        <td className="px-2 py-1 text-right">
                          <div className="flex items-center justify-end gap-1.5">
                            <div
                              className="h-3 bg-blue-500/70 rounded-sm"
                              style={{ width: `${Math.abs(p.quantity_Minimum) / 2}px`, minWidth: 2 }}
                            />
                            <span className="text-blue-300 font-mono">{Math.abs(p.quantity_Minimum).toFixed(1)}</span>
                          </div>
                        </td>
                        <td className="px-2 py-1 text-right">
                          <div className="flex items-center justify-end gap-1.5">
                            <div
                              className="h-3 bg-green-500/70 rounded-sm"
                              style={{ width: `${p.quantity_Maximum / 2}px`, minWidth: 2 }}
                            />
                            <span className="text-green-300 font-mono">{p.quantity_Maximum.toFixed(1)}</span>
                          </div>
                        </td>
                        <td className="px-2 py-1 text-center">
                          <span className="badge-info text-[10px]">{p.qualityCode}</span>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </div>

        {/* RIGHT — D4G Communication */}
        <div className="space-y-4">
          <div className="card">
            <h2 className="text-sm font-semibold text-white mb-4">D4G Endpoint</h2>
            <div className="space-y-3">
              <div>
                <label className="block text-xs text-gray-400 mb-1.5">Endpoint URL</label>
                <input
                  type="text"
                  value={endpoint}
                  onChange={(e) => setEndpoint(e.target.value)}
                  className="w-full bg-gray-700 border border-gray-600 text-gray-100 px-3 py-2 rounded-lg text-sm focus:outline-none focus:ring-1 focus:ring-indigo-500 font-mono"
                />
              </div>
              <div>
                <label className="block text-xs text-gray-400 mb-1.5">Protocol</label>
                <select
                  value={protocol}
                  onChange={(e) => setProtocol(e.target.value)}
                  className="w-full bg-gray-700 border border-gray-600 text-gray-100 px-3 py-2 rounded-lg text-sm focus:outline-none focus:ring-1 focus:ring-indigo-500"
                >
                  <option>IEC 62746-4</option>
                  <option>IEEE 2030.5</option>
                  <option>OpenADR 2.0b</option>
                </select>
              </div>
              <button
                onClick={handleSendD4G}
                disabled={!oeDoc || sending}
                className="w-full btn-primary flex items-center justify-center gap-2"
              >
                {sending ? (
                  <><Loader2 className="w-4 h-4 animate-spin" /> Sending…</>
                ) : d4gResponse ? (
                  <><CheckCircle className="w-4 h-4 text-green-300" /> Sent ✓</>
                ) : (
                  <><Send className="w-4 h-4" /> Send to D4G →</>
                )}
              </button>
              {!oeDoc && <p className="text-xs text-gray-500 text-center">Generate OE document first</p>}
            </div>
          </div>

          {/* D4G Response */}
          {d4gResponse && (
            <div className="card">
              <div className="flex items-center justify-between mb-3">
                <h2 className="text-sm font-semibold text-white">D4G Response</h2>
                <span className="badge-online text-xs">ACKNOWLEDGED</span>
              </div>

              {/* DER capacity table */}
              <div className="mb-4">
                <h4 className="text-xs font-semibold text-gray-400 uppercase tracking-wider mb-2">Available DER Capacity</h4>
                <div className="space-y-2">
                  {d4gDers.map((a) => (
                    <div key={a.assetID} className="bg-gray-800 rounded-lg p-2.5">
                      <div className="flex items-start justify-between">
                        <div>
                          <div className="text-xs font-medium text-gray-200">{a.assetName}</div>
                          <div className="text-xs text-gray-500">{a.assetID}</div>
                        </div>
                        <div className="text-right">
                          <div className="text-xs text-green-400 font-medium">Available: {a.availableCapacity_kW} kW</div>
                          <div className="text-xs text-gray-400">Current: {a.currentGeneration_kW} kW</div>
                        </div>
                      </div>
                      {a.committedCurtailment_kW > 0 && (
                        <div className="mt-1.5 text-xs text-amber-300">
                          Response: Will curtail to {a.confirmedLimit_kW} kW (−{a.committedCurtailment_kW.toFixed(1)} kW)
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              </div>

              {/* Summary */}
              <div className="bg-indigo-900/30 border border-indigo-700/30 rounded-lg p-3 mb-4">
                <div className="grid grid-cols-3 gap-2 text-center">
                  <div>
                    <div className="text-xs text-gray-400">Available Flex</div>
                    <div className="text-sm font-bold text-indigo-300">{totalFlex} kW</div>
                  </div>
                  <div>
                    <div className="text-xs text-gray-400">Current Gen</div>
                    <div className="text-sm font-bold text-amber-300">{totalCurrentGen.toFixed(1)} kW</div>
                  </div>
                  <div>
                    <div className="text-xs text-gray-400">Committed ↓</div>
                    <div className="text-sm font-bold text-green-300">{totalCommitted.toFixed(1)} kW</div>
                  </div>
                </div>
              </div>

              <button
                onClick={() => setShowRawD4G(!showRawD4G)}
                className="flex items-center gap-1.5 text-xs text-gray-400 hover:text-gray-200 transition-colors"
              >
                {showRawD4G ? <ChevronUp className="w-3.5 h-3.5" /> : <ChevronDown className="w-3.5 h-3.5" />}
                {showRawD4G ? 'Hide' : 'View'} Raw JSON
              </button>
              {showRawD4G && (
                <pre className="bg-gray-950 rounded-lg p-3 text-xs text-green-300 overflow-auto max-h-64 mt-2 font-mono">
                  {JSON.stringify(d4gResponse, null, 2)}
                </pre>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
