import React, { useState, useEffect } from 'react'
import { Plus, X, Loader2, Car, Sun, Battery, Thermometer, Zap } from 'lucide-react'
import clsx from 'clsx'
import { apiClient } from '../api/client'

interface Asset {
  id: string
  name?: string
  asset_ref?: string
  counterparty_id?: string
  counterparty_name?: string
  type: string
  phase?: string
  capacity_kw: number
  feeder_id?: string
  dt_id?: string
  program_id?: string
  program_name?: string
  status: string
  mpan?: string
  lat?: number
  lng?: number
}

interface Counterparty {
  id: string
  name: string
}

interface Program {
  id: string
  name: string
}

const DEMO_ASSETS: Asset[] = [
  {
    id: 'ast-demo-001',
    name: 'EVC-B01',
    asset_ref: 'EVC-B01',
    counterparty_name: 'Digital4Grids',
    type: 'EV_CHARGER',
    phase: 'B',
    capacity_kw: 120,
    feeder_id: 'BR-B',
    program_name: 'EDF Réseau Peak Flex',
    status: 'active',
  },
  {
    id: 'ast-demo-002',
    name: 'EVC-B02',
    asset_ref: 'EVC-B02',
    counterparty_name: 'Digital4Grids',
    type: 'EV_CHARGER',
    phase: 'B',
    capacity_kw: 110,
    feeder_id: 'BR-B',
    program_name: 'EDF Réseau Peak Flex',
    status: 'active',
  },
  {
    id: 'ast-demo-003',
    name: 'EVC-B03',
    asset_ref: 'EVC-B03',
    counterparty_name: 'Digital4Grids',
    type: 'EV_CHARGER',
    phase: 'B',
    capacity_kw: 120,
    feeder_id: 'BR-B',
    program_name: 'EDF Réseau Peak Flex',
    status: 'active',
  },
]

function assetTypeBadge(type: string) {
  const cfg: Record<string, { label: string; cls: string; Icon: React.ElementType }> = {
    EV_CHARGER:     { label: 'EV Charger',      cls: 'bg-orange-900/40 text-orange-400 border-orange-800/40', Icon: Car },
    SOLAR_PV:       { label: 'Solar PV',         cls: 'bg-yellow-900/40 text-yellow-400 border-yellow-800/40', Icon: Sun },
    BESS:           { label: 'BESS',             cls: 'bg-blue-900/40 text-blue-400 border-blue-800/40', Icon: Battery },
    HEAT_PUMP:      { label: 'Heat Pump',        cls: 'bg-green-900/40 text-green-400 border-green-800/40', Icon: Thermometer },
    FLEXIBLE_LOAD:  { label: 'Flexible Load',    cls: 'bg-gray-700/60 text-gray-300 border-gray-600/40', Icon: Zap },
  }
  const c = cfg[type] || cfg['FLEXIBLE_LOAD']
  const { Icon } = c
  return (
    <span className={clsx('inline-flex items-center gap-1 px-2 py-0.5 rounded text-[10px] font-semibold border', c.cls)}>
      <Icon className="w-3 h-3" />
      {c.label}
    </span>
  )
}

function statusBadge(status: string) {
  const cls =
    status === 'active' || status === 'ACTIVE'
      ? 'bg-green-900/40 text-green-400 border-green-800/40'
      : status === 'offline' || status === 'OFFLINE'
      ? 'bg-red-900/40 text-red-400 border-red-800/40'
      : 'bg-gray-700/60 text-gray-400 border-gray-600/40'
  return (
    <span className={clsx('inline-flex items-center px-2 py-0.5 rounded text-[10px] font-semibold border', cls)}>
      {status.toLowerCase()}
    </span>
  )
}

interface FormState {
  name: string
  counterparty_id: string
  type: string
  capacity_kw: string
  phase: string
  mpan: string
  feeder_id: string
  program_id: string
  lat: string
  lng: string
}

const EMPTY_FORM: FormState = {
  name: '',
  counterparty_id: '',
  type: 'EV_CHARGER',
  capacity_kw: '',
  phase: 'A',
  mpan: '',
  feeder_id: 'BR-A',
  program_id: '',
  lat: '',
  lng: '',
}

export default function AssetsAdminPage() {
  const [assets, setAssets] = useState<Asset[]>([])
  const [counterparties, setCounterparties] = useState<Counterparty[]>([])
  const [programs, setPrograms] = useState<Program[]>([])
  const [loading, setLoading] = useState(true)
  const [showModal, setShowModal] = useState(false)
  const [form, setForm] = useState<FormState>(EMPTY_FORM)
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    Promise.all([
      apiClient.get('/assets').catch(() => ({ data: null })),
      apiClient.get('/counterparties').catch(() => ({ data: null })),
      apiClient.get('/programs').catch(() => ({ data: null })),
    ]).then(([assetsRes, cpRes, progRes]) => {
      const assetsData: Asset[] = Array.isArray(assetsRes.data)
        ? assetsRes.data
        : (assetsRes.data?.items ?? [])
      setAssets(assetsData.length > 0 ? assetsData : DEMO_ASSETS)

      const cpData: Counterparty[] = Array.isArray(cpRes.data)
        ? cpRes.data
        : (cpRes.data?.items ?? [])
      setCounterparties(cpData)

      const progData: Program[] = Array.isArray(progRes.data)
        ? progRes.data
        : (progRes.data?.items ?? [])
      setPrograms(progData)
    }).finally(() => setLoading(false))
  }, [])

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setSaving(true)
    try {
      const payload = {
        name: form.name,
        asset_ref: form.name,
        counterparty_id: form.counterparty_id || undefined,
        type: form.type,
        capacity_kw: parseFloat(form.capacity_kw) || 0,
        phase: form.phase,
        mpan: form.mpan || undefined,
        feeder_id: form.feeder_id,
        program_id: form.program_id || undefined,
        lat: form.lat ? parseFloat(form.lat) : undefined,
        lng: form.lng ? parseFloat(form.lng) : undefined,
        status: 'active',
      }
      const r = await apiClient.post('/assets', payload)
      setAssets((prev) => [...prev, r.data])
    } catch {
      const cp = counterparties.find((c) => c.id === form.counterparty_id)
      const prog = programs.find((p) => p.id === form.program_id)
      setAssets((prev) => [
        ...prev,
        {
          id: `ast-local-${Date.now()}`,
          name: form.name,
          asset_ref: form.name,
          counterparty_name: cp?.name,
          type: form.type,
          phase: form.phase,
          capacity_kw: parseFloat(form.capacity_kw) || 0,
          feeder_id: form.feeder_id,
          program_name: prog?.name,
          status: 'active',
        },
      ])
    } finally {
      setSaving(false)
      setShowModal(false)
      setForm(EMPTY_FORM)
    }
  }

  return (
    <div className="space-y-4 max-w-6xl mx-auto">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-bold text-white">Assets</h1>
          <p className="text-sm text-gray-400 mt-0.5">DER assets enrolled in flexibility programs</p>
        </div>
        <button
          onClick={() => setShowModal(true)}
          className="btn-primary flex items-center gap-2"
        >
          <Plus className="w-4 h-4" />
          New Asset
        </button>
      </div>

      {/* Table */}
      <div className="card p-0 overflow-hidden">
        {loading ? (
          <div className="flex items-center justify-center py-16 text-gray-500 gap-2">
            <Loader2 className="w-5 h-5 animate-spin" />
            <span className="text-sm">Loading assets…</span>
          </div>
        ) : assets.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-16 text-gray-500">
            <p className="text-sm">No assets yet</p>
            <button onClick={() => setShowModal(true)} className="text-xs text-indigo-400 mt-2 hover:text-indigo-300">
              Register first asset
            </button>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-gray-800/80 border-b border-gray-700">
                <tr>
                  <th className="text-left text-xs text-gray-400 font-medium px-4 py-3">Asset ID</th>
                  <th className="text-left text-xs text-gray-400 font-medium px-4 py-3">Counterparty</th>
                  <th className="text-left text-xs text-gray-400 font-medium px-4 py-3">Type</th>
                  <th className="text-left text-xs text-gray-400 font-medium px-4 py-3">Phase</th>
                  <th className="text-right text-xs text-gray-400 font-medium px-4 py-3">Capacity kW</th>
                  <th className="text-left text-xs text-gray-400 font-medium px-4 py-3">Branch</th>
                  <th className="text-left text-xs text-gray-400 font-medium px-4 py-3">Program</th>
                  <th className="text-center text-xs text-gray-400 font-medium px-4 py-3">Status</th>
                </tr>
              </thead>
              <tbody>
                {assets.map((a) => (
                  <tr key={a.id} className="border-t border-gray-700/50 hover:bg-gray-800/30 transition-colors">
                    <td className="px-4 py-3 font-mono text-xs text-gray-300 font-medium">{a.asset_ref || a.name || a.id.slice(0, 12)}</td>
                    <td className="px-4 py-3 text-gray-400 text-xs">{a.counterparty_name || '—'}</td>
                    <td className="px-4 py-3">{assetTypeBadge(a.type)}</td>
                    <td className="px-4 py-3 text-gray-400 text-xs font-mono">{a.phase || '—'}</td>
                    <td className="px-4 py-3 text-right font-mono text-gray-300">{a.capacity_kw}</td>
                    <td className="px-4 py-3 text-gray-400 text-xs font-mono">{a.feeder_id || a.dt_id || '—'}</td>
                    <td className="px-4 py-3 text-gray-400 text-xs">{a.program_name || '—'}</td>
                    <td className="px-4 py-3 text-center">{statusBadge(a.status)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Modal */}
      {showModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60">
          <div className="bg-gray-900 border border-gray-700 rounded-xl w-full max-w-lg mx-4 shadow-2xl max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between px-5 py-4 border-b border-gray-700 sticky top-0 bg-gray-900">
              <h2 className="text-sm font-semibold text-white">Register New Asset</h2>
              <button onClick={() => { setShowModal(false); setForm(EMPTY_FORM) }} className="text-gray-500 hover:text-gray-300">
                <X className="w-4 h-4" />
              </button>
            </div>
            <form onSubmit={handleSubmit} className="p-5 space-y-4">
              <div>
                <label className="block text-xs text-gray-400 mb-1.5">Asset Name / ID</label>
                <input
                  required
                  type="text"
                  value={form.name}
                  onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
                  placeholder="e.g. EVC-B04"
                  className="w-full bg-gray-800 border border-gray-600 text-gray-100 px-3 py-2 rounded-lg text-sm font-mono focus:outline-none focus:ring-1 focus:ring-indigo-500"
                />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs text-gray-400 mb-1.5">Counterparty</label>
                  <select
                    value={form.counterparty_id}
                    onChange={(e) => setForm((f) => ({ ...f, counterparty_id: e.target.value }))}
                    className="w-full bg-gray-800 border border-gray-600 text-gray-100 px-3 py-2 rounded-lg text-sm focus:outline-none focus:ring-1 focus:ring-indigo-500"
                  >
                    <option value="">— select —</option>
                    {counterparties.map((cp) => (
                      <option key={cp.id} value={cp.id}>{cp.name}</option>
                    ))}
                    {counterparties.length === 0 && (
                      <option value="cp-demo-001">Digital4Grids</option>
                    )}
                  </select>
                </div>
                <div>
                  <label className="block text-xs text-gray-400 mb-1.5">Asset Type</label>
                  <select
                    value={form.type}
                    onChange={(e) => setForm((f) => ({ ...f, type: e.target.value }))}
                    className="w-full bg-gray-800 border border-gray-600 text-gray-100 px-3 py-2 rounded-lg text-sm focus:outline-none focus:ring-1 focus:ring-indigo-500"
                  >
                    <option value="EV_CHARGER">EV Charger</option>
                    <option value="SOLAR_PV">Solar PV</option>
                    <option value="BESS">BESS</option>
                    <option value="HEAT_PUMP">Heat Pump</option>
                    <option value="FLEXIBLE_LOAD">Flexible Load</option>
                  </select>
                </div>
              </div>
              <div className="grid grid-cols-3 gap-3">
                <div>
                  <label className="block text-xs text-gray-400 mb-1.5">Nameplate kW</label>
                  <input
                    required
                    type="number"
                    min={0}
                    step={0.1}
                    value={form.capacity_kw}
                    onChange={(e) => setForm((f) => ({ ...f, capacity_kw: e.target.value }))}
                    placeholder="120"
                    className="w-full bg-gray-800 border border-gray-600 text-gray-100 px-3 py-2 rounded-lg text-sm focus:outline-none focus:ring-1 focus:ring-indigo-500"
                  />
                </div>
                <div>
                  <label className="block text-xs text-gray-400 mb-1.5">Phase</label>
                  <select
                    value={form.phase}
                    onChange={(e) => setForm((f) => ({ ...f, phase: e.target.value }))}
                    className="w-full bg-gray-800 border border-gray-600 text-gray-100 px-3 py-2 rounded-lg text-sm focus:outline-none focus:ring-1 focus:ring-indigo-500"
                  >
                    <option value="A">A</option>
                    <option value="B">B</option>
                    <option value="C">C</option>
                  </select>
                </div>
                <div>
                  <label className="block text-xs text-gray-400 mb-1.5">Branch</label>
                  <select
                    value={form.feeder_id}
                    onChange={(e) => setForm((f) => ({ ...f, feeder_id: e.target.value }))}
                    className="w-full bg-gray-800 border border-gray-600 text-gray-100 px-3 py-2 rounded-lg text-sm focus:outline-none focus:ring-1 focus:ring-indigo-500"
                  >
                    <option value="BR-A">BR-A</option>
                    <option value="BR-B">BR-B</option>
                    <option value="BR-C">BR-C</option>
                  </select>
                </div>
              </div>
              <div>
                <label className="block text-xs text-gray-400 mb-1.5">MPAN</label>
                <input
                  type="text"
                  value={form.mpan}
                  onChange={(e) => setForm((f) => ({ ...f, mpan: e.target.value }))}
                  placeholder="Meter point administration number"
                  className="w-full bg-gray-800 border border-gray-600 text-gray-100 px-3 py-2 rounded-lg text-sm font-mono focus:outline-none focus:ring-1 focus:ring-indigo-500"
                />
              </div>
              <div>
                <label className="block text-xs text-gray-400 mb-1.5">Linked Program</label>
                <select
                  value={form.program_id}
                  onChange={(e) => setForm((f) => ({ ...f, program_id: e.target.value }))}
                  className="w-full bg-gray-800 border border-gray-600 text-gray-100 px-3 py-2 rounded-lg text-sm focus:outline-none focus:ring-1 focus:ring-indigo-500"
                >
                  <option value="">— none —</option>
                  {programs.map((p) => (
                    <option key={p.id} value={p.id}>{p.name}</option>
                  ))}
                  {programs.length === 0 && (
                    <option value="prog-demo-001">EDF Réseau Peak Flex</option>
                  )}
                </select>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs text-gray-400 mb-1.5">Latitude (optional)</label>
                  <input
                    type="number"
                    step="any"
                    value={form.lat}
                    onChange={(e) => setForm((f) => ({ ...f, lat: e.target.value }))}
                    placeholder="46.123"
                    className="w-full bg-gray-800 border border-gray-600 text-gray-100 px-3 py-2 rounded-lg text-sm font-mono focus:outline-none focus:ring-1 focus:ring-indigo-500"
                  />
                </div>
                <div>
                  <label className="block text-xs text-gray-400 mb-1.5">Longitude (optional)</label>
                  <input
                    type="number"
                    step="any"
                    value={form.lng}
                    onChange={(e) => setForm((f) => ({ ...f, lng: e.target.value }))}
                    placeholder="2.456"
                    className="w-full bg-gray-800 border border-gray-600 text-gray-100 px-3 py-2 rounded-lg text-sm font-mono focus:outline-none focus:ring-1 focus:ring-indigo-500"
                  />
                </div>
              </div>
              <div className="flex gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => { setShowModal(false); setForm(EMPTY_FORM) }}
                  className="flex-1 btn-secondary text-sm"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={saving || !form.name || !form.capacity_kw}
                  className="flex-1 btn-primary flex items-center justify-center gap-2 text-sm"
                >
                  {saving && <Loader2 className="w-4 h-4 animate-spin" />}
                  {saving ? 'Saving…' : 'Register Asset'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  )
}
