import React, { useState, useEffect } from 'react'
import { Plus, X, Loader2, Info, CheckCircle, Ban } from 'lucide-react'
import clsx from 'clsx'
import { apiClient } from '../api/client'

interface Enrollment {
  id: string
  program_id: string
  program_name: string
  company: string
  contact_name: string
  contact_email: string
  flex_capacity_kw: number
  assets: string[]
  registered_at: string
  status: 'pending' | 'approved' | 'suspended'
}

interface Program {
  id: string
  name: string
  constraint_type?: string
  type?: string
  dt_id?: string
  min_flex_kw?: number
  max_flex_kw?: number
  target_mw?: number
  price_per_mwh?: number
  lead_time_min?: number
  valid_from?: string
  valid_to?: string
  start_date?: string
  end_date?: string
  status: string
}

const DEMO_PROGRAMS: Program[] = [
  {
    id: 'prog-demo-001',
    name: 'EDF Réseau Peak Flex',
    constraint_type: 'thermal',
    dt_id: 'DT-AUZ-001',
    min_flex_kw: 50,
    max_flex_kw: 245,
    price_per_mwh: 85,
    lead_time_min: 15,
    valid_from: '2026-01-01',
    valid_to: '2026-12-31',
    status: 'active',
  },
]

function statusBadge(status: string) {
  const cls =
    status === 'active'
      ? 'bg-green-100 text-green-700 border-green-200'
      : status === 'suspended'
      ? 'bg-amber-100 text-amber-700 border-amber-200'
      : 'bg-gray-100 text-gray-500 border-gray-200'
  return (
    <span className={clsx('inline-flex items-center px-2 py-0.5 rounded text-[10px] font-semibold border', cls)}>
      {status}
    </span>
  )
}

function constraintBadge(ct?: string) {
  if (!ct) return <span className="text-gray-400 text-xs">—</span>
  const cls =
    ct === 'thermal'
      ? 'bg-orange-100 text-orange-600 border-orange-200'
      : ct === 'voltage'
      ? 'bg-blue-100 text-blue-600 border-blue-200'
      : 'bg-purple-100 text-purple-600 border-purple-200'
  return (
    <span className={clsx('inline-flex items-center px-2 py-0.5 rounded text-[10px] font-semibold border', cls)}>
      {ct}
    </span>
  )
}

interface FormState {
  name: string
  constraint_type: string
  dt_id: string
  min_flex_kw: string
  max_flex_kw: string
  price_per_mwh: string
  currency: string
  lead_time_min: string
  valid_from: string
  valid_to: string
}

const EMPTY_FORM: FormState = {
  name: '',
  constraint_type: 'thermal',
  dt_id: 'DT-AUZ-001',
  min_flex_kw: '',
  max_flex_kw: '',
  price_per_mwh: '',
  currency: 'EUR',
  lead_time_min: '15',
  valid_from: '',
  valid_to: '',
}

export default function ProgramsAdminPage() {
  const [activeTab, setActiveTab] = useState<'programs' | 'enrollments'>('programs')
  const [programs, setPrograms] = useState<Program[]>([])
  const [loading, setLoading] = useState(true)
  const [usingDemo, setUsingDemo] = useState(false)
  const [showModal, setShowModal] = useState(false)
  const [form, setForm] = useState<FormState>(EMPTY_FORM)
  const [saving, setSaving] = useState(false)
  const [enrollments, setEnrollments] = useState<Enrollment[]>([])

  // Load enrollments from localStorage
  useEffect(() => {
    const stored = localStorage.getItem('ng_enrollments')
    if (stored) {
      try { setEnrollments(JSON.parse(stored)) } catch { /* ignore */ }
    }
  }, [activeTab])

  const updateEnrollmentStatus = (id: string, status: Enrollment['status']) => {
    setEnrollments(prev => {
      const updated = prev.map(e => e.id === id ? { ...e, status } : e)
      localStorage.setItem('ng_enrollments', JSON.stringify(updated))
      return updated
    })
  }

  useEffect(() => {
    apiClient.get('/programs')
      .then((r) => {
        const data: Program[] = Array.isArray(r.data) ? r.data : (r.data?.items ?? [])
        setPrograms(data)
        setUsingDemo(false)
      })
      .catch(() => {
        setPrograms(DEMO_PROGRAMS)
        setUsingDemo(true)
      })
      .finally(() => setLoading(false))
  }, [])

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setSaving(true)
    try {
      const payload = {
        name: form.name,
        constraint_type: form.constraint_type,
        dt_id: form.dt_id,
        min_flex_kw: parseFloat(form.min_flex_kw) || 0,
        max_flex_kw: parseFloat(form.max_flex_kw) || 0,
        price_per_mwh: parseFloat(form.price_per_mwh) || 0,
        currency: form.currency,
        lead_time_min: parseInt(form.lead_time_min) || 15,
        valid_from: form.valid_from,
        valid_to: form.valid_to,
        status: 'active',
      }
      const r = await apiClient.post('/programs', payload)
      setPrograms((prev) => [...prev, r.data])
    } catch {
      // If API fails, add locally as demo entry
      setPrograms((prev) => [
        ...prev,
        {
          id: `prog-local-${Date.now()}`,
          name: form.name,
          constraint_type: form.constraint_type,
          dt_id: form.dt_id,
          min_flex_kw: parseFloat(form.min_flex_kw) || 0,
          max_flex_kw: parseFloat(form.max_flex_kw) || 0,
          price_per_mwh: parseFloat(form.price_per_mwh) || 0,
          lead_time_min: parseInt(form.lead_time_min) || 15,
          valid_from: form.valid_from,
          valid_to: form.valid_to,
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
          <h1 className="text-xl font-bold text-gray-900">Flex Programs</h1>
          <p className="text-sm text-gray-500 mt-0.5">Manage flexibility programs and aggregator enrollments</p>
        </div>
        {activeTab === 'programs' && (
          <button onClick={() => setShowModal(true)} className="btn-primary flex items-center gap-2">
            <Plus className="w-4 h-4" />
            New Program
          </button>
        )}
      </div>

      {/* Tabs */}
      <div className="flex gap-1 bg-gray-100 p-1 rounded-lg w-fit">
        {(['programs', 'enrollments'] as const).map(tab => (
          <button
            key={tab}
            onClick={() => setActiveTab(tab)}
            className={clsx(
              'px-4 py-1.5 rounded-md text-sm font-medium transition-colors capitalize',
              activeTab === tab ? 'bg-white text-gray-900 shadow-sm' : 'text-gray-500 hover:text-gray-700'
            )}
          >
            {tab}
            {tab === 'enrollments' && enrollments.length > 0 && (
              <span className="ml-1.5 text-[10px] bg-indigo-100 text-indigo-600 px-1.5 py-0.5 rounded-full font-bold">{enrollments.length}</span>
            )}
          </button>
        ))}
      </div>

      {/* Demo info banner */}
      {activeTab === 'programs' && usingDemo && programs.length > 0 && (
        <div className="flex items-center gap-2.5 bg-indigo-50 border border-indigo-200 rounded-lg px-4 py-2.5 text-xs text-indigo-600">
          <Info className="w-3.5 h-3.5 flex-shrink-0" />
          Demo: 1 program pre-loaded — EDF Réseau Peak Flex
        </div>
      )}

      {/* Enrollments tab */}
      {activeTab === 'enrollments' && (
        <div className="card p-0 overflow-hidden">
          {enrollments.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-16 text-gray-400">
              <p className="text-sm">No enrollments yet</p>
              <p className="text-xs mt-1">Aggregators register via the Programs page</p>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="bg-gray-50 border-b border-gray-200">
                  <tr>
                    <th className="text-left text-xs text-gray-500 font-medium px-4 py-3">Company</th>
                    <th className="text-left text-xs text-gray-500 font-medium px-4 py-3">Contact</th>
                    <th className="text-left text-xs text-gray-500 font-medium px-4 py-3">Program</th>
                    <th className="text-right text-xs text-gray-500 font-medium px-4 py-3">Flex (kW)</th>
                    <th className="text-left text-xs text-gray-500 font-medium px-4 py-3">Assets</th>
                    <th className="text-left text-xs text-gray-500 font-medium px-4 py-3">Registered</th>
                    <th className="text-center text-xs text-gray-500 font-medium px-4 py-3">Status</th>
                    <th className="text-center text-xs text-gray-500 font-medium px-4 py-3">Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {enrollments.map(e => (
                    <tr key={e.id} className="border-t border-gray-100 hover:bg-gray-50">
                      <td className="px-4 py-3">
                        <div className="text-gray-800 font-medium text-sm">{e.company}</div>
                      </td>
                      <td className="px-4 py-3">
                        <div className="text-gray-700 text-xs">{e.contact_name}</div>
                        <div className="text-gray-400 text-[10px]">{e.contact_email}</div>
                      </td>
                      <td className="px-4 py-3 text-xs text-gray-600">{e.program_name}</td>
                      <td className="px-4 py-3 text-right font-mono text-gray-700">{e.flex_capacity_kw}</td>
                      <td className="px-4 py-3">
                        <div className="flex flex-wrap gap-1">
                          {e.assets.map(a => (
                            <span key={a} className="text-[10px] bg-gray-100 text-gray-600 px-1.5 py-0.5 rounded">{a}</span>
                          ))}
                        </div>
                      </td>
                      <td className="px-4 py-3 text-xs text-gray-400">{new Date(e.registered_at).toLocaleDateString()}</td>
                      <td className="px-4 py-3 text-center">
                        <span className={clsx('px-2 py-0.5 rounded text-[10px] font-semibold border',
                          e.status === 'approved' ? 'bg-green-100 text-green-700 border-green-200' :
                          e.status === 'suspended' ? 'bg-red-100 text-red-600 border-red-200' :
                          'bg-amber-100 text-amber-700 border-amber-200'
                        )}>
                          {e.status}
                        </span>
                      </td>
                      <td className="px-4 py-3 text-center">
                        <div className="flex items-center justify-center gap-1.5">
                          {e.status !== 'approved' && (
                            <button
                              onClick={() => updateEnrollmentStatus(e.id, 'approved')}
                              title="Approve"
                              className="p-1 rounded hover:bg-green-50 text-green-600 transition-colors"
                            >
                              <CheckCircle className="w-3.5 h-3.5" />
                            </button>
                          )}
                          {e.status !== 'suspended' && (
                            <button
                              onClick={() => updateEnrollmentStatus(e.id, 'suspended')}
                              title="Suspend"
                              className="p-1 rounded hover:bg-red-50 text-red-500 transition-colors"
                            >
                              <Ban className="w-3.5 h-3.5" />
                            </button>
                          )}
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}

      {/* Programs table */}
      {activeTab === 'programs' && (<div className="card p-0 overflow-hidden">
        {loading ? (
          <div className="flex items-center justify-center py-16 text-gray-500 gap-2">
            <Loader2 className="w-5 h-5 animate-spin" />
            <span className="text-sm">Loading programs…</span>
          </div>
        ) : programs.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-16 text-gray-500">
            <p className="text-sm">No programs yet</p>
            <button onClick={() => setShowModal(true)} className="text-xs text-indigo-500 mt-2 hover:text-indigo-600">
              Create your first program
            </button>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-gray-50 border-b border-gray-200">
                <tr>
                  <th className="text-left text-xs text-gray-500 font-medium px-4 py-3">Program ID</th>
                  <th className="text-left text-xs text-gray-500 font-medium px-4 py-3">Name</th>
                  <th className="text-left text-xs text-gray-500 font-medium px-4 py-3">Constraint Type</th>
                  <th className="text-left text-xs text-gray-500 font-medium px-4 py-3">DT</th>
                  <th className="text-right text-xs text-gray-500 font-medium px-4 py-3">Max Flex (kW)</th>
                  <th className="text-right text-xs text-gray-500 font-medium px-4 py-3">Price</th>
                  <th className="text-right text-xs text-gray-500 font-medium px-4 py-3">Lead Time</th>
                  <th className="text-center text-xs text-gray-500 font-medium px-4 py-3">Status</th>
                </tr>
              </thead>
              <tbody>
                {programs.map((p) => (
                  <tr key={p.id} className="border-t border-gray-200 hover:bg-gray-50 transition-colors">
                    <td className="px-4 py-3 font-mono text-xs text-gray-500">{p.id.slice(0, 16)}…</td>
                    <td className="px-4 py-3 text-gray-800 font-medium">{p.name}</td>
                    <td className="px-4 py-3">{constraintBadge(p.constraint_type)}</td>
                    <td className="px-4 py-3 text-gray-500 text-xs font-mono">{p.dt_id || '—'}</td>
                    <td className="px-4 py-3 text-right font-mono text-gray-700">
                      {p.max_flex_kw != null ? p.max_flex_kw : (p.target_mw != null ? (p.target_mw * 1000).toFixed(0) : '—')}
                    </td>
                    <td className="px-4 py-3 text-right font-mono text-gray-700">
                      {p.price_per_mwh != null ? `€${p.price_per_mwh}/MWh` : '—'}
                    </td>
                    <td className="px-4 py-3 text-right text-gray-500 text-xs">
                      {p.lead_time_min != null ? `${p.lead_time_min} min` : '—'}
                    </td>
                    <td className="px-4 py-3 text-center">{statusBadge(p.status)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>)}

      {/* Modal */}
      {showModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60">
          <div className="bg-white border border-gray-200 rounded-xl w-full max-w-lg mx-4 shadow-2xl">
            <div className="flex items-center justify-between px-5 py-4 border-b border-gray-200">
              <h2 className="text-sm font-semibold text-gray-900">New Flex Program</h2>
              <button onClick={() => { setShowModal(false); setForm(EMPTY_FORM) }} className="text-gray-500 hover:text-gray-700">
                <X className="w-4 h-4" />
              </button>
            </div>
            <form onSubmit={handleSubmit} className="p-5 space-y-4">
              <div>
                <label className="block text-xs text-gray-500 mb-1.5">Program Name</label>
                <input
                  required
                  type="text"
                  value={form.name}
                  onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
                  placeholder="e.g. EDF Réseau Peak Flex"
                  className="w-full bg-white border border-gray-300 text-gray-900 px-3 py-2 rounded-lg text-sm focus:outline-none focus:ring-1 focus:ring-indigo-500"
                />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs text-gray-500 mb-1.5">Constraint Type</label>
                  <select
                    value={form.constraint_type}
                    onChange={(e) => setForm((f) => ({ ...f, constraint_type: e.target.value }))}
                    className="w-full bg-white border border-gray-300 text-gray-900 px-3 py-2 rounded-lg text-sm focus:outline-none focus:ring-1 focus:ring-indigo-500"
                  >
                    <option value="thermal">Thermal</option>
                    <option value="voltage">Voltage</option>
                    <option value="both">Both</option>
                  </select>
                </div>
                <div>
                  <label className="block text-xs text-gray-500 mb-1.5">Linked DT</label>
                  <select
                    value={form.dt_id}
                    onChange={(e) => setForm((f) => ({ ...f, dt_id: e.target.value }))}
                    className="w-full bg-white border border-gray-300 text-gray-900 px-3 py-2 rounded-lg text-sm focus:outline-none focus:ring-1 focus:ring-indigo-500"
                  >
                    <option value="DT-AUZ-001">DT-AUZ-001 — Auzances LV Substation</option>
                    <option value="DT-AUZ-005">DT-AUZ-005 — Bois-Rond T2</option>
                  </select>
                </div>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs text-gray-500 mb-1.5">Min Flex Volume (kW)</label>
                  <input
                    type="number"
                    min={0}
                    value={form.min_flex_kw}
                    onChange={(e) => setForm((f) => ({ ...f, min_flex_kw: e.target.value }))}
                    placeholder="50"
                    className="w-full bg-white border border-gray-300 text-gray-900 px-3 py-2 rounded-lg text-sm focus:outline-none focus:ring-1 focus:ring-indigo-500"
                  />
                </div>
                <div>
                  <label className="block text-xs text-gray-500 mb-1.5">Max Flex Volume (kW)</label>
                  <input
                    type="number"
                    min={0}
                    value={form.max_flex_kw}
                    onChange={(e) => setForm((f) => ({ ...f, max_flex_kw: e.target.value }))}
                    placeholder="245"
                    className="w-full bg-white border border-gray-300 text-gray-900 px-3 py-2 rounded-lg text-sm focus:outline-none focus:ring-1 focus:ring-indigo-500"
                  />
                </div>
              </div>
              <div className="grid grid-cols-3 gap-3">
                <div>
                  <label className="block text-xs text-gray-500 mb-1.5">Price per MWh</label>
                  <input
                    type="number"
                    min={0}
                    step={0.01}
                    value={form.price_per_mwh}
                    onChange={(e) => setForm((f) => ({ ...f, price_per_mwh: e.target.value }))}
                    placeholder="85"
                    className="w-full bg-white border border-gray-300 text-gray-900 px-3 py-2 rounded-lg text-sm focus:outline-none focus:ring-1 focus:ring-indigo-500"
                  />
                </div>
                <div>
                  <label className="block text-xs text-gray-500 mb-1.5">Currency</label>
                  <select
                    value={form.currency}
                    onChange={(e) => setForm((f) => ({ ...f, currency: e.target.value }))}
                    className="w-full bg-white border border-gray-300 text-gray-900 px-3 py-2 rounded-lg text-sm focus:outline-none focus:ring-1 focus:ring-indigo-500"
                  >
                    <option value="EUR">EUR</option>
                    <option value="GBP">GBP</option>
                  </select>
                </div>
                <div>
                  <label className="block text-xs text-gray-500 mb-1.5">Lead Time (min)</label>
                  <input
                    type="number"
                    min={1}
                    value={form.lead_time_min}
                    onChange={(e) => setForm((f) => ({ ...f, lead_time_min: e.target.value }))}
                    placeholder="15"
                    className="w-full bg-white border border-gray-300 text-gray-900 px-3 py-2 rounded-lg text-sm focus:outline-none focus:ring-1 focus:ring-indigo-500"
                  />
                </div>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs text-gray-500 mb-1.5">Valid From</label>
                  <input
                    type="date"
                    value={form.valid_from}
                    onChange={(e) => setForm((f) => ({ ...f, valid_from: e.target.value }))}
                    className="w-full bg-white border border-gray-300 text-gray-900 px-3 py-2 rounded-lg text-sm focus:outline-none focus:ring-1 focus:ring-indigo-500"
                  />
                </div>
                <div>
                  <label className="block text-xs text-gray-500 mb-1.5">Valid To</label>
                  <input
                    type="date"
                    value={form.valid_to}
                    onChange={(e) => setForm((f) => ({ ...f, valid_to: e.target.value }))}
                    className="w-full bg-white border border-gray-300 text-gray-900 px-3 py-2 rounded-lg text-sm focus:outline-none focus:ring-1 focus:ring-indigo-500"
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
                  {saving ? 'Saving…' : 'Create Program'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  )
}
