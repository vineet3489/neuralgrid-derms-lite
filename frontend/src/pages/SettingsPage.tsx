import React, { useState, useEffect } from 'react'
import { CheckCircle, Loader2 } from 'lucide-react'
import clsx from 'clsx'

const DEMO_D4G_URL = 'https://demo.d4g.local/oe'

interface IECEndpoint {
  label: string
  direction: 'inbound' | 'outbound'
  url: string
  key: string
  key_hint?: string
}

export default function SettingsPage() {
  // ── D4G Connection ─────────────────────────────────────────────────────────
  const [d4gUrl, setD4gUrl] = useState(DEMO_D4G_URL)
  const [d4gKey, setD4gKey] = useState('d4g-demo-api-key-2026')
  const [d4gSaving, setD4gSaving] = useState(false)
  const [d4gMsg, setD4gMsg] = useState<{ text: string; ok: boolean } | null>(null)
  const [d4gIsDemo, setD4gIsDemo] = useState(true)

  // ── IEC Message Endpoints ──────────────────────────────────────────────────
  const [iecEndpoints, setIecEndpoints] = useState<Record<string, IECEndpoint>>({
    A38: { label: 'Operating Envelope', direction: 'outbound', url: '', key: '' },
    A44: { label: 'Performance / Settlement', direction: 'inbound', url: '', key: '' },
    A28: { label: 'Activation Instruction', direction: 'inbound', url: '', key: '' },
  })
  const [iecSaving, setIecSaving] = useState(false)
  const [iecMsg, setIecMsg] = useState<{ text: string; ok: boolean } | null>(null)

  const authHeader = { Authorization: `Bearer ${localStorage.getItem('ng_token') || ''}` }
  const apiBase = import.meta.env.VITE_API_URL || ''

  useEffect(() => {
    // Load D4G config
    fetch(`${apiBase}/api/v1/lv-network/d4g-config`, { headers: authHeader })
      .then(r => r.json())
      .then(cfg => {
        if (cfg.d4g_api_url) setD4gUrl(cfg.d4g_api_url)
        if (cfg.is_demo !== undefined) setD4gIsDemo(cfg.is_demo)
      })
      .catch(() => {})

    // Load IEC endpoints
    fetch(`${apiBase}/api/v1/lv-network/iec-endpoints`, { headers: authHeader })
      .then(r => r.json())
      .then(data => {
        setIecEndpoints(prev => {
          const next = { ...prev }
          for (const [k, v] of Object.entries(data as Record<string, any>)) {
            if (next[k]) next[k] = { ...next[k], ...v, key: next[k].key }
          }
          return next
        })
      })
      .catch(() => {})
  }, [])

  const handleSaveD4G = async () => {
    setD4gSaving(true)
    setD4gMsg(null)
    try {
      const r = await fetch(`${apiBase}/api/v1/lv-network/d4g-config`, {
        method: 'PUT',
        headers: { ...authHeader, 'Content-Type': 'application/json' },
        body: JSON.stringify({ d4g_api_url: d4gUrl, d4g_api_key: d4gKey }),
      })
      const result = await r.json()
      const isDemo = d4gUrl === DEMO_D4G_URL
      setD4gIsDemo(isDemo)
      setD4gMsg({ text: isDemo ? 'Demo mode active' : 'Live endpoint saved', ok: true })
    } catch {
      setD4gMsg({ text: 'Save failed — check backend connection', ok: false })
    } finally {
      setD4gSaving(false)
    }
  }

  const handleSaveIEC = async () => {
    setIecSaving(true)
    setIecMsg(null)
    const payload: Record<string, { url: string; key: string }> = {}
    for (const [k, v] of Object.entries(iecEndpoints)) {
      payload[k] = { url: v.url, key: v.key }
    }
    try {
      await fetch(`${apiBase}/api/v1/lv-network/iec-endpoints`, {
        method: 'PUT',
        headers: { ...authHeader, 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      })
      setIecMsg({ text: 'Endpoints saved', ok: true })
    } catch {
      setIecMsg({ text: 'Save failed — check backend connection', ok: false })
    } finally {
      setIecSaving(false)
    }
  }

  return (
    <div className="space-y-6 max-w-3xl mx-auto">
      <div>
        <h1 className="text-xl font-bold text-gray-900">Settings</h1>
        <p className="text-sm text-gray-500 mt-0.5">Integration configuration for D4G and IEC message endpoints</p>
      </div>

      {/* ── D4G Connection ─────────────────────────────────────────────────── */}
      <div className="card">
        <div className="flex items-center justify-between mb-4">
          <div>
            <h2 className="text-sm font-semibold text-gray-900">D4G Connection</h2>
            <p className="text-xs text-gray-500 mt-0.5">
              A38 Operating Envelopes are POSTed to this endpoint with Bearer auth.
              Demo mode simulates D4G acceptance without an external call.
            </p>
          </div>
          <span className={clsx(
            'text-[10px] font-bold px-2 py-1 rounded border flex-shrink-0',
            d4gIsDemo ? 'bg-amber-100 text-amber-700 border-amber-200' : 'bg-green-100 text-green-700 border-green-200'
          )}>
            {d4gIsDemo ? 'DEMO' : 'LIVE'}
          </span>
        </div>

        <div className="grid grid-cols-2 gap-3 mb-4">
          <div>
            <label className="block text-xs text-gray-500 mb-1">Endpoint URL</label>
            <input
              type="text"
              value={d4gUrl}
              onChange={e => setD4gUrl(e.target.value)}
              className="w-full bg-white border border-gray-300 text-gray-900 px-3 py-1.5 rounded text-xs focus:outline-none focus:ring-1 focus:ring-indigo-500 font-mono"
              placeholder="https://api.digital4grids.eu/oe/submit"
            />
          </div>
          <div>
            <label className="block text-xs text-gray-500 mb-1">Bearer API Key</label>
            <input
              type="password"
              value={d4gKey}
              onChange={e => setD4gKey(e.target.value)}
              className="w-full bg-white border border-gray-300 text-gray-900 px-3 py-1.5 rounded text-xs focus:outline-none focus:ring-1 focus:ring-indigo-500 font-mono"
              placeholder="your-d4g-api-key"
            />
          </div>
        </div>

        <div className="flex items-center gap-3">
          <button
            onClick={handleSaveD4G}
            disabled={d4gSaving}
            className="flex items-center gap-1.5 btn-primary text-xs py-1.5 px-4"
          >
            {d4gSaving ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <CheckCircle className="w-3.5 h-3.5" />}
            Save & Activate
          </button>
          <button
            onClick={() => { setD4gUrl(DEMO_D4G_URL); setD4gKey('d4g-demo-api-key-2026') }}
            className="text-xs text-gray-500 hover:text-gray-700 underline"
          >
            Reset to demo
          </button>
          {d4gMsg && (
            <span className={clsx('text-xs', d4gMsg.ok ? 'text-green-600' : 'text-red-500')}>
              {d4gMsg.text}
            </span>
          )}
        </div>
      </div>

      {/* ── IEC Message Endpoints ──────────────────────────────────────────── */}
      <div className="card">
        <div className="mb-4">
          <h2 className="text-sm font-semibold text-gray-900">IEC Message Endpoints</h2>
          <p className="text-xs text-gray-500 mt-0.5">
            Configure send and receive URLs for each IEC document type.
            Leave blank to use the D4G connection above (for outbound) or to disable (for inbound).
          </p>
        </div>

        <div className="space-y-4">
          {Object.entries(iecEndpoints).map(([docType, ep]) => (
            <div key={docType} className="border border-gray-200 rounded-lg p-3">
              <div className="flex items-center gap-2 mb-3">
                <span className="text-xs font-bold font-mono bg-indigo-100 text-indigo-600 border border-indigo-200 px-2 py-0.5 rounded">
                  {docType}
                </span>
                <span className="text-xs text-gray-700 font-medium">{ep.label}</span>
                <span className={clsx(
                  'text-[10px] px-1.5 py-0.5 rounded border ml-auto',
                  ep.direction === 'outbound'
                    ? 'bg-blue-50 text-blue-600 border-blue-200'
                    : 'bg-purple-50 text-purple-600 border-purple-200'
                )}>
                  {ep.direction === 'outbound' ? '↑ Send' : '↓ Receive'}
                </span>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs text-gray-500 mb-1">
                    {ep.direction === 'outbound' ? 'Send Endpoint URL' : 'Receive Webhook URL'}
                  </label>
                  <input
                    type="text"
                    value={ep.url}
                    onChange={e => setIecEndpoints(prev => ({
                      ...prev,
                      [docType]: { ...prev[docType], url: e.target.value },
                    }))}
                    className="w-full bg-white border border-gray-300 text-gray-900 px-3 py-1.5 rounded text-xs focus:outline-none focus:ring-1 focus:ring-indigo-500 font-mono"
                    placeholder={ep.direction === 'outbound' ? 'https://…' : 'https://your-system/webhook'}
                  />
                </div>
                <div>
                  <label className="block text-xs text-gray-500 mb-1">Bearer API Key</label>
                  <input
                    type="password"
                    value={ep.key}
                    onChange={e => setIecEndpoints(prev => ({
                      ...prev,
                      [docType]: { ...prev[docType], key: e.target.value },
                    }))}
                    className="w-full bg-white border border-gray-300 text-gray-900 px-3 py-1.5 rounded text-xs focus:outline-none focus:ring-1 focus:ring-indigo-500 font-mono"
                    placeholder="optional bearer key"
                  />
                </div>
              </div>
            </div>
          ))}
        </div>

        <div className="flex items-center gap-3 mt-4 pt-4 border-t border-gray-100">
          <button
            onClick={handleSaveIEC}
            disabled={iecSaving}
            className="flex items-center gap-1.5 btn-primary text-xs py-1.5 px-4"
          >
            {iecSaving ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <CheckCircle className="w-3.5 h-3.5" />}
            Save Endpoints
          </button>
          {iecMsg && (
            <span className={clsx('text-xs', iecMsg.ok ? 'text-green-600' : 'text-red-500')}>
              {iecMsg.text}
            </span>
          )}
        </div>
      </div>
    </div>
  )
}
