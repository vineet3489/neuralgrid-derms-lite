import React, { useState, useEffect } from 'react'
import { CheckCircle, X, Loader2, Zap } from 'lucide-react'
import clsx from 'clsx'
import { apiClient } from '../api/client'

// ── Types ────────────────────────────────────────────────────────────────────

interface Program {
  id: string
  name: string
  constraint_type?: string
  dt_id?: string
  min_flex_kw?: number
  max_flex_kw?: number
  price_per_mwh?: number
  lead_time_min?: number
  valid_from?: string
  valid_to?: string
  status: string
}

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

interface RegForm {
  company: string
  contact_name: string
  contact_email: string
  flex_capacity_kw: string
  assets: string[]
}

// ── Demo data ────────────────────────────────────────────────────────────────

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
  {
    id: 'prog-demo-002',
    name: 'Bois-Rond Solar Constraint Relief',
    constraint_type: 'voltage',
    dt_id: 'DT-AUZ-005',
    min_flex_kw: 100,
    max_flex_kw: 428,
    price_per_mwh: 72,
    lead_time_min: 30,
    valid_from: '2026-01-01',
    valid_to: '2026-12-31',
    status: 'active',
  },
]

const AVAILABLE_ASSETS: { id: string; label: string; dt: string; capacity: string }[] = [
  { id: 'solar-a',  label: 'Community Solar A',       dt: 'DT-AUZ-001', capacity: '80 kWp' },
  { id: 'solar-b',  label: 'Community Solar B',       dt: 'DT-AUZ-001', capacity: '60 kWp' },
  { id: 'bois-solar', label: 'Bois-Rond Solar Farm',  dt: 'DT-AUZ-005', capacity: '250 kWp' },
  { id: 'bois-bess',  label: 'Bois-Rond BESS',        dt: 'DT-AUZ-005', capacity: '120 kW' },
  { id: 'fougeres-bess', label: 'Fougères BESS',      dt: 'DT-AUZ-004', capacity: '120 kW' },
  { id: 'zi-dsr',   label: 'ZI Est Industrial DSR',   dt: 'DT-AUZ-004', capacity: '500 kW' },
]

// ── Helpers ──────────────────────────────────────────────────────────────────

function loadEnrollments(): Enrollment[] {
  try {
    const s = localStorage.getItem('ng_enrollments')
    return s ? JSON.parse(s) : []
  } catch { return [] }
}

function saveEnrollments(e: Enrollment[]) {
  localStorage.setItem('ng_enrollments', JSON.stringify(e))
}

function constraintBadge(ct?: string) {
  if (!ct) return null
  const cls =
    ct === 'thermal' ? 'bg-orange-100 text-orange-600 border-orange-200' :
    ct === 'voltage' ? 'bg-blue-100 text-blue-600 border-blue-200' :
    'bg-purple-100 text-purple-600 border-purple-200'
  return (
    <span className={clsx('inline-flex items-center px-2 py-0.5 rounded text-[10px] font-semibold border', cls)}>
      {ct}
    </span>
  )
}

// ── Main page ────────────────────────────────────────────────────────────────

export default function ProgramsLitePage() {
  const [programs, setPrograms] = useState<Program[]>([])
  const [loading, setLoading] = useState(true)
  const [enrollments, setEnrollments] = useState<Enrollment[]>(loadEnrollments)

  // Registration modal state
  const [registeringFor, setRegisteringFor] = useState<Program | null>(null)
  const [form, setForm] = useState<RegForm>({ company: '', contact_name: '', contact_email: '', flex_capacity_kw: '', assets: [] })
  const [saving, setSaving] = useState(false)
  const [saved, setSaved] = useState(false)

  useEffect(() => {
    apiClient.get('/programs')
      .then(r => {
        const data: Program[] = Array.isArray(r.data) ? r.data : (r.data?.items ?? [])
        setPrograms(data.filter(p => p.status === 'active'))
      })
      .catch(() => setPrograms(DEMO_PROGRAMS))
      .finally(() => setLoading(false))
  }, [])

  const enrolledIds = new Set(enrollments.map(e => e.program_id))

  const openRegister = (p: Program) => {
    setRegisteringFor(p)
    setForm({ company: '', contact_name: '', contact_email: '', flex_capacity_kw: String(p.min_flex_kw ?? ''), assets: [] })
    setSaved(false)
  }

  const toggleAsset = (assetId: string) => {
    setForm(f => ({
      ...f,
      assets: f.assets.includes(assetId) ? f.assets.filter(a => a !== assetId) : [...f.assets, assetId],
    }))
  }

  const handleRegister = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!registeringFor) return
    setSaving(true)

    const enrollment: Enrollment = {
      id: `enr-${Date.now()}`,
      program_id: registeringFor.id,
      program_name: registeringFor.name,
      company: form.company,
      contact_name: form.contact_name,
      contact_email: form.contact_email,
      flex_capacity_kw: parseFloat(form.flex_capacity_kw) || 0,
      assets: form.assets.map(id => AVAILABLE_ASSETS.find(a => a.id === id)?.label ?? id),
      registered_at: new Date().toISOString(),
      status: 'pending',
    }

    // Try backend, fall back to localStorage only
    try {
      await apiClient.post('/enrollments', enrollment)
    } catch { /* expected in demo */ }

    const updated = [...enrollments, enrollment]
    saveEnrollments(updated)
    setEnrollments(updated)
    setSaving(false)
    setSaved(true)
    setTimeout(() => { setRegisteringFor(null); setSaved(false) }, 1400)
  }

  return (
    <div className="space-y-6 max-w-5xl mx-auto">
      <div>
        <h1 className="text-xl font-bold text-gray-900">Flexibility Programs</h1>
        <p className="text-sm text-gray-500 mt-0.5">
          Active programs open for aggregator enrollment. Register your assets and flex capacity under a program to participate in operating envelope dispatch.
        </p>
      </div>

      {/* Active programs */}
      {loading ? (
        <div className="flex items-center justify-center py-16 text-gray-400 gap-2">
          <Loader2 className="w-5 h-5 animate-spin" />
          <span className="text-sm">Loading programs…</span>
        </div>
      ) : (
        <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
          {programs.map(p => {
            const enrolled = enrolledIds.has(p.id)
            const enrollment = enrollments.find(e => e.program_id === p.id)
            return (
              <div key={p.id} className={clsx(
                'bg-white border rounded-xl p-5 flex flex-col gap-3',
                enrolled ? 'border-indigo-200 bg-indigo-50/30' : 'border-gray-200'
              )}>
                {/* Header */}
                <div className="flex items-start justify-between gap-2">
                  <div>
                    <h2 className="text-sm font-semibold text-gray-900">{p.name}</h2>
                    <div className="flex items-center gap-2 mt-1.5">
                      {constraintBadge(p.constraint_type)}
                      <span className="text-[10px] text-gray-400 font-mono">{p.dt_id}</span>
                    </div>
                  </div>
                  {enrolled ? (
                    <span className="flex items-center gap-1 text-[10px] font-bold bg-green-100 text-green-700 border border-green-200 px-2 py-1 rounded-full flex-shrink-0">
                      <CheckCircle className="w-3 h-3" /> Enrolled
                    </span>
                  ) : (
                    <span className="text-[10px] font-bold bg-green-50 text-green-600 border border-green-200 px-2 py-0.5 rounded">
                      Open
                    </span>
                  )}
                </div>

                {/* Key terms */}
                <div className="grid grid-cols-3 gap-2 text-xs">
                  <div className="bg-gray-50 rounded-lg px-3 py-2 text-center">
                    <div className="text-gray-400 text-[10px]">Flex Range</div>
                    <div className="font-semibold text-gray-800 mt-0.5">{p.min_flex_kw}–{p.max_flex_kw} kW</div>
                  </div>
                  <div className="bg-gray-50 rounded-lg px-3 py-2 text-center">
                    <div className="text-gray-400 text-[10px]">Price</div>
                    <div className="font-semibold text-gray-800 mt-0.5">€{p.price_per_mwh}/MWh</div>
                  </div>
                  <div className="bg-gray-50 rounded-lg px-3 py-2 text-center">
                    <div className="text-gray-400 text-[10px]">Lead Time</div>
                    <div className="font-semibold text-gray-800 mt-0.5">{p.lead_time_min} min</div>
                  </div>
                </div>

                {/* Validity */}
                <div className="text-[10px] text-gray-400">
                  Valid {p.valid_from} → {p.valid_to}
                </div>

                {/* Enrollment summary or register button */}
                {enrolled && enrollment ? (
                  <div className="border border-indigo-100 bg-white rounded-lg px-3 py-2 text-xs text-gray-600">
                    <span className="font-medium text-gray-800">{enrollment.company}</span>
                    {' · '}{enrollment.flex_capacity_kw} kW offered
                    {' · '}<span className={clsx('font-semibold',
                      enrollment.status === 'approved' ? 'text-green-600' :
                      enrollment.status === 'suspended' ? 'text-red-500' : 'text-amber-500'
                    )}>{enrollment.status}</span>
                  </div>
                ) : (
                  <button
                    onClick={() => openRegister(p)}
                    className="w-full btn-primary text-sm py-2 flex items-center justify-center gap-2"
                  >
                    <Zap className="w-3.5 h-3.5" />
                    Register Under This Program
                  </button>
                )}
              </div>
            )
          })}
        </div>
      )}

      {/* My registrations summary */}
      {enrollments.length > 0 && (
        <div>
          <h2 className="text-sm font-semibold text-gray-700 mb-3">My Registrations</h2>
          <div className="bg-white border border-gray-200 rounded-xl overflow-hidden">
            <table className="w-full text-xs">
              <thead className="bg-gray-50 border-b border-gray-200">
                <tr>
                  <th className="text-left px-4 py-2.5 font-medium text-gray-500">Program</th>
                  <th className="text-left px-4 py-2.5 font-medium text-gray-500">Company</th>
                  <th className="text-right px-4 py-2.5 font-medium text-gray-500">Flex (kW)</th>
                  <th className="text-left px-4 py-2.5 font-medium text-gray-500">Assets</th>
                  <th className="text-center px-4 py-2.5 font-medium text-gray-500">Status</th>
                  <th className="text-left px-4 py-2.5 font-medium text-gray-500">Registered</th>
                </tr>
              </thead>
              <tbody>
                {enrollments.map(e => (
                  <tr key={e.id} className="border-t border-gray-100">
                    <td className="px-4 py-2.5 text-gray-800 font-medium">{e.program_name}</td>
                    <td className="px-4 py-2.5 text-gray-600">{e.company}</td>
                    <td className="px-4 py-2.5 text-right font-mono text-gray-700">{e.flex_capacity_kw}</td>
                    <td className="px-4 py-2.5">
                      <div className="flex flex-wrap gap-1">
                        {e.assets.map(a => (
                          <span key={a} className="text-[10px] bg-gray-100 text-gray-500 px-1.5 py-0.5 rounded">{a}</span>
                        ))}
                      </div>
                    </td>
                    <td className="px-4 py-2.5 text-center">
                      <span className={clsx('px-2 py-0.5 rounded text-[10px] font-semibold border',
                        e.status === 'approved' ? 'bg-green-100 text-green-700 border-green-200' :
                        e.status === 'suspended' ? 'bg-red-100 text-red-600 border-red-200' :
                        'bg-amber-100 text-amber-700 border-amber-200'
                      )}>
                        {e.status}
                      </span>
                    </td>
                    <td className="px-4 py-2.5 text-gray-400">{new Date(e.registered_at).toLocaleDateString()}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Registration Modal */}
      {registeringFor && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
          <div className="bg-white rounded-2xl w-full max-w-lg shadow-2xl border border-gray-200">
            <div className="flex items-center justify-between px-5 py-4 border-b border-gray-100">
              <div>
                <h2 className="text-sm font-semibold text-gray-900">Register for Program</h2>
                <p className="text-xs text-gray-500 mt-0.5">{registeringFor.name}</p>
              </div>
              <button onClick={() => setRegisteringFor(null)} className="text-gray-400 hover:text-gray-700">
                <X className="w-4 h-4" />
              </button>
            </div>

            {saved ? (
              <div className="flex flex-col items-center justify-center py-12 gap-3">
                <CheckCircle className="w-10 h-10 text-green-500" />
                <p className="text-sm font-semibold text-gray-800">Registration submitted</p>
                <p className="text-xs text-gray-400">Pending DSO approval</p>
              </div>
            ) : (
              <form onSubmit={handleRegister} className="p-5 space-y-4">
                {/* Company */}
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="block text-xs text-gray-500 mb-1">Company / Organisation *</label>
                    <input
                      required
                      type="text"
                      value={form.company}
                      onChange={e => setForm(f => ({ ...f, company: e.target.value }))}
                      placeholder="Digital4Grids SA"
                      className="w-full border border-gray-300 rounded-lg px-3 py-1.5 text-sm focus:outline-none focus:ring-1 focus:ring-indigo-500"
                    />
                  </div>
                  <div>
                    <label className="block text-xs text-gray-500 mb-1">Contact Name *</label>
                    <input
                      required
                      type="text"
                      value={form.contact_name}
                      onChange={e => setForm(f => ({ ...f, contact_name: e.target.value }))}
                      placeholder="Jean Dupont"
                      className="w-full border border-gray-300 rounded-lg px-3 py-1.5 text-sm focus:outline-none focus:ring-1 focus:ring-indigo-500"
                    />
                  </div>
                </div>

                <div>
                  <label className="block text-xs text-gray-500 mb-1">Contact Email *</label>
                  <input
                    required
                    type="email"
                    value={form.contact_email}
                    onChange={e => setForm(f => ({ ...f, contact_email: e.target.value }))}
                    placeholder="jean.dupont@d4g.eu"
                    className="w-full border border-gray-300 rounded-lg px-3 py-1.5 text-sm focus:outline-none focus:ring-1 focus:ring-indigo-500"
                  />
                </div>

                {/* Flex capacity */}
                <div>
                  <label className="block text-xs text-gray-500 mb-1">
                    Flex Capacity to Offer (kW) *
                    <span className="ml-1 text-gray-400">— range: {registeringFor.min_flex_kw}–{registeringFor.max_flex_kw} kW</span>
                  </label>
                  <input
                    required
                    type="number"
                    min={registeringFor.min_flex_kw}
                    max={registeringFor.max_flex_kw}
                    value={form.flex_capacity_kw}
                    onChange={e => setForm(f => ({ ...f, flex_capacity_kw: e.target.value }))}
                    className="w-full border border-gray-300 rounded-lg px-3 py-1.5 text-sm focus:outline-none focus:ring-1 focus:ring-indigo-500"
                  />
                </div>

                {/* Assets */}
                <div>
                  <label className="block text-xs text-gray-500 mb-2">Assets to Commit (select all that apply)</label>
                  <div className="space-y-1.5 max-h-36 overflow-y-auto pr-1">
                    {AVAILABLE_ASSETS.map(asset => (
                      <label key={asset.id} className={clsx(
                        'flex items-center gap-3 px-3 py-2 rounded-lg border cursor-pointer transition-colors text-xs',
                        form.assets.includes(asset.id)
                          ? 'border-indigo-300 bg-indigo-50 text-indigo-800'
                          : 'border-gray-200 hover:border-gray-300 text-gray-700'
                      )}>
                        <input
                          type="checkbox"
                          checked={form.assets.includes(asset.id)}
                          onChange={() => toggleAsset(asset.id)}
                          className="accent-indigo-600"
                        />
                        <span className="flex-1 font-medium">{asset.label}</span>
                        <span className="text-[10px] text-gray-400 font-mono">{asset.dt} · {asset.capacity}</span>
                      </label>
                    ))}
                  </div>
                </div>

                <div className="flex gap-2 pt-1">
                  <button type="button" onClick={() => setRegisteringFor(null)} className="flex-1 btn-secondary text-sm">
                    Cancel
                  </button>
                  <button
                    type="submit"
                    disabled={saving || !form.company || !form.contact_email}
                    className="flex-1 btn-primary text-sm flex items-center justify-center gap-2"
                  >
                    {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Zap className="w-4 h-4" />}
                    {saving ? 'Registering…' : 'Submit Registration'}
                  </button>
                </div>
              </form>
            )}
          </div>
        </div>
      )}
    </div>
  )
}
