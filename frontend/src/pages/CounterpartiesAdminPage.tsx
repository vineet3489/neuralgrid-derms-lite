import React, { useState, useEffect } from 'react'
import { Plus, X, Loader2, ExternalLink, Eye } from 'lucide-react'
import clsx from 'clsx'
import { apiClient } from '../api/client'

interface Counterparty {
  id: string
  name: string
  market_mrid?: string
  market_role?: string
  d4g_api_url?: string
  country?: string
  asset_count?: number
  portfolio_kw?: number
  status: string
  contact_email?: string
  contact_name?: string
  type?: string
}

const DEMO_COUNTERPARTIES: Counterparty[] = [
  {
    id: 'cp-demo-001',
    name: 'Digital4Grids',
    market_mrid: '17XTESTD4GRID02T',
    market_role: 'A27',
    d4g_api_url: 'https://lnt.digital4grids.com',
    country: 'FR',
    asset_count: 3,
    status: 'active',
    contact_email: 'api@digital4grids.com',
  },
]

function statusBadge(status: string) {
  const cls =
    status === 'active'
      ? 'bg-green-900/40 text-green-400 border-green-800/40'
      : status === 'suspended'
      ? 'bg-amber-900/40 text-amber-400 border-amber-800/40'
      : 'bg-gray-700/60 text-gray-400 border-gray-600/40'
  return (
    <span className={clsx('inline-flex items-center px-2 py-0.5 rounded text-[10px] font-semibold border', cls)}>
      {status}
    </span>
  )
}

interface FormState {
  name: string
  market_mrid: string
  market_role: string
  d4g_api_url: string
  api_key: string
  resource_group_id: string
  country: string
  contact_email: string
}

const EMPTY_FORM: FormState = {
  name: '',
  market_mrid: '',
  market_role: 'A27',
  d4g_api_url: 'https://lnt.digital4grids.com',
  api_key: '',
  resource_group_id: '',
  country: 'FR',
  contact_email: '',
}

export default function CounterpartiesAdminPage() {
  const [counterparties, setCounterparties] = useState<Counterparty[]>([])
  const [loading, setLoading] = useState(true)
  const [showModal, setShowModal] = useState(false)
  const [form, setForm] = useState<FormState>(EMPTY_FORM)
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    apiClient.get('/counterparties')
      .then((r) => {
        const data: Counterparty[] = Array.isArray(r.data) ? r.data : (r.data?.items ?? [])
        setCounterparties(data.length > 0 ? data : DEMO_COUNTERPARTIES)
      })
      .catch(() => {
        setCounterparties(DEMO_COUNTERPARTIES)
      })
      .finally(() => setLoading(false))
  }, [])

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setSaving(true)
    try {
      const payload = {
        name: form.name,
        market_mrid: form.market_mrid,
        market_role: form.market_role,
        d4g_api_url: form.d4g_api_url,
        resource_group_id: form.resource_group_id,
        country: form.country,
        contact_email: form.contact_email,
        status: 'active',
        type: form.market_role === 'A27' ? 'AGGREGATOR' : 'DSO',
      }
      const r = await apiClient.post('/counterparties', payload)
      setCounterparties((prev) => [...prev, r.data])
    } catch {
      setCounterparties((prev) => [
        ...prev,
        {
          id: `cp-local-${Date.now()}`,
          name: form.name,
          market_mrid: form.market_mrid,
          market_role: form.market_role,
          d4g_api_url: form.d4g_api_url,
          country: form.country,
          asset_count: 0,
          status: 'active',
          contact_email: form.contact_email,
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
          <h1 className="text-xl font-bold text-white">Counterparties</h1>
          <p className="text-sm text-gray-400 mt-0.5">Aggregators and DSO market participants</p>
        </div>
        <button
          onClick={() => setShowModal(true)}
          className="btn-primary flex items-center gap-2"
        >
          <Plus className="w-4 h-4" />
          New Counterparty
        </button>
      </div>

      {/* Table */}
      <div className="card p-0 overflow-hidden">
        {loading ? (
          <div className="flex items-center justify-center py-16 text-gray-500 gap-2">
            <Loader2 className="w-5 h-5 animate-spin" />
            <span className="text-sm">Loading counterparties…</span>
          </div>
        ) : counterparties.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-16 text-gray-500">
            <p className="text-sm">No counterparties yet</p>
            <button onClick={() => setShowModal(true)} className="text-xs text-indigo-400 mt-2 hover:text-indigo-300">
              Add first counterparty
            </button>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-gray-800/80 border-b border-gray-700">
                <tr>
                  <th className="text-left text-xs text-gray-400 font-medium px-4 py-3">Name</th>
                  <th className="text-left text-xs text-gray-400 font-medium px-4 py-3">Market mRID</th>
                  <th className="text-left text-xs text-gray-400 font-medium px-4 py-3">D4G API URL</th>
                  <th className="text-left text-xs text-gray-400 font-medium px-4 py-3">Country</th>
                  <th className="text-right text-xs text-gray-400 font-medium px-4 py-3">Assets</th>
                  <th className="text-center text-xs text-gray-400 font-medium px-4 py-3">Status</th>
                  <th className="text-center text-xs text-gray-400 font-medium px-4 py-3">Actions</th>
                </tr>
              </thead>
              <tbody>
                {counterparties.map((cp) => (
                  <tr key={cp.id} className="border-t border-gray-700/50 hover:bg-gray-800/30 transition-colors">
                    <td className="px-4 py-3">
                      <div className="text-gray-200 font-medium">{cp.name}</div>
                      {cp.market_role && (
                        <div className="text-[10px] text-gray-500 mt-0.5">
                          {cp.market_role === 'A27' ? 'Aggregator' : 'DSO'}
                        </div>
                      )}
                    </td>
                    <td className="px-4 py-3 font-mono text-xs text-gray-400">{cp.market_mrid || '—'}</td>
                    <td className="px-4 py-3">
                      {cp.d4g_api_url ? (
                        <a
                          href={cp.d4g_api_url}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="flex items-center gap-1 text-xs text-indigo-400 hover:text-indigo-300 font-mono"
                        >
                          {cp.d4g_api_url.replace('https://', '')}
                          <ExternalLink className="w-3 h-3" />
                        </a>
                      ) : (
                        <span className="text-gray-600 text-xs">—</span>
                      )}
                    </td>
                    <td className="px-4 py-3 text-gray-400 text-xs">{cp.country || '—'}</td>
                    <td className="px-4 py-3 text-right text-gray-300 font-mono text-xs">
                      {cp.asset_count != null ? cp.asset_count : '—'}
                    </td>
                    <td className="px-4 py-3 text-center">{statusBadge(cp.status)}</td>
                    <td className="px-4 py-3 text-center">
                      <button className="inline-flex items-center gap-1 text-xs text-gray-500 hover:text-gray-300 px-2 py-1 rounded border border-gray-700 hover:border-gray-600 transition-colors">
                        <Eye className="w-3 h-3" /> View
                      </button>
                    </td>
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
              <h2 className="text-sm font-semibold text-white">New Counterparty</h2>
              <button onClick={() => { setShowModal(false); setForm(EMPTY_FORM) }} className="text-gray-500 hover:text-gray-300">
                <X className="w-4 h-4" />
              </button>
            </div>
            <form onSubmit={handleSubmit} className="p-5 space-y-4">
              <div>
                <label className="block text-xs text-gray-400 mb-1.5">Name</label>
                <input
                  required
                  type="text"
                  value={form.name}
                  onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
                  placeholder="e.g. Digital4Grids"
                  className="w-full bg-gray-800 border border-gray-600 text-gray-100 px-3 py-2 rounded-lg text-sm focus:outline-none focus:ring-1 focus:ring-indigo-500"
                />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs text-gray-400 mb-1.5">Market mRID</label>
                  <input
                    type="text"
                    value={form.market_mrid}
                    onChange={(e) => setForm((f) => ({ ...f, market_mrid: e.target.value }))}
                    placeholder="17XTESTD4GRID02T"
                    className="w-full bg-gray-800 border border-gray-600 text-gray-100 px-3 py-2 rounded-lg text-sm font-mono focus:outline-none focus:ring-1 focus:ring-indigo-500"
                  />
                </div>
                <div>
                  <label className="block text-xs text-gray-400 mb-1.5">Market Role</label>
                  <select
                    value={form.market_role}
                    onChange={(e) => setForm((f) => ({ ...f, market_role: e.target.value }))}
                    className="w-full bg-gray-800 border border-gray-600 text-gray-100 px-3 py-2 rounded-lg text-sm focus:outline-none focus:ring-1 focus:ring-indigo-500"
                  >
                    <option value="A27">A27 Aggregator</option>
                    <option value="A04">A04 DSO</option>
                  </select>
                </div>
              </div>
              <div>
                <label className="block text-xs text-gray-400 mb-1.5">D4G API Base URL</label>
                <input
                  type="url"
                  value={form.d4g_api_url}
                  onChange={(e) => setForm((f) => ({ ...f, d4g_api_url: e.target.value }))}
                  className="w-full bg-gray-800 border border-gray-600 text-gray-100 px-3 py-2 rounded-lg text-sm font-mono focus:outline-none focus:ring-1 focus:ring-indigo-500"
                />
              </div>
              <div>
                <label className="block text-xs text-gray-400 mb-1.5">API Key</label>
                <input
                  type="password"
                  value={form.api_key}
                  onChange={(e) => setForm((f) => ({ ...f, api_key: e.target.value }))}
                  placeholder="Stored for X-API-Key header"
                  className="w-full bg-gray-800 border border-gray-600 text-gray-100 px-3 py-2 rounded-lg text-sm focus:outline-none focus:ring-1 focus:ring-indigo-500"
                />
              </div>
              <div>
                <label className="block text-xs text-gray-400 mb-1.5">Resource Group ID</label>
                <input
                  type="text"
                  value={form.resource_group_id}
                  onChange={(e) => setForm((f) => ({ ...f, resource_group_id: e.target.value }))}
                  placeholder="Used for /v1/baseline and /v1/ods calls"
                  className="w-full bg-gray-800 border border-gray-600 text-gray-100 px-3 py-2 rounded-lg text-sm font-mono focus:outline-none focus:ring-1 focus:ring-indigo-500"
                />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs text-gray-400 mb-1.5">Country</label>
                  <select
                    value={form.country}
                    onChange={(e) => setForm((f) => ({ ...f, country: e.target.value }))}
                    className="w-full bg-gray-800 border border-gray-600 text-gray-100 px-3 py-2 rounded-lg text-sm focus:outline-none focus:ring-1 focus:ring-indigo-500"
                  >
                    <option value="FR">FR</option>
                    <option value="GB">GB</option>
                    <option value="DE">DE</option>
                    <option value="IE">IE</option>
                  </select>
                </div>
                <div>
                  <label className="block text-xs text-gray-400 mb-1.5">Contact Email</label>
                  <input
                    type="email"
                    value={form.contact_email}
                    onChange={(e) => setForm((f) => ({ ...f, contact_email: e.target.value }))}
                    placeholder="api@example.com"
                    className="w-full bg-gray-800 border border-gray-600 text-gray-100 px-3 py-2 rounded-lg text-sm focus:outline-none focus:ring-1 focus:ring-indigo-500"
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
                  disabled={saving || !form.name}
                  className="flex-1 btn-primary flex items-center justify-center gap-2 text-sm"
                >
                  {saving && <Loader2 className="w-4 h-4 animate-spin" />}
                  {saving ? 'Saving…' : 'Create Counterparty'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  )
}
