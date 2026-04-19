import React, { useState, useEffect } from 'react'
import { AlertOctagon, AlertTriangle, RefreshCw, CheckCircle } from 'lucide-react'
import clsx from 'clsx'

interface Alarm {
  id: string
  timestamp: string
  dt_id: string
  type: 'OVERVOLTAGE' | 'EMERGENCY_SPG' | 'THERMAL' | 'UNDERVOLTAGE'
  severity: 'CRITICAL' | 'WARNING' | 'INFO'
  detail: string
  value: string
  threshold: string
  status: 'ACTIVE' | 'ACKNOWLEDGED' | 'CLEARED'
}

// Timestamps set relative to now at module load so they look realistic
const makeAlarms = (): Alarm[] => {
  const now = Date.now()
  return [
    {
      id: 'ALM-001',
      timestamp: new Date(now - 3 * 60 * 1000).toISOString(),
      dt_id: 'DT-AUZ-005',
      type: 'OVERVOLTAGE',
      severity: 'CRITICAL',
      detail: 'Feeder B end-of-line voltage exceeds 1.05 pu limit',
      value: '1.087 pu',
      threshold: '1.05 pu',
      status: 'ACTIVE',
    },
    {
      id: 'ALM-002',
      timestamp: new Date(now - 7 * 60 * 1000).toISOString(),
      dt_id: 'DT-AUZ-001',
      type: 'EMERGENCY_SPG',
      severity: 'CRITICAL',
      detail: 'Community Solar A SPG measurement exceeds OE export limit',
      value: '142 kW',
      threshold: '90 kW (OE max export)',
      status: 'ACTIVE',
    },
    {
      id: 'ALM-003',
      timestamp: new Date(now - 18 * 60 * 1000).toISOString(),
      dt_id: 'DT-AUZ-003',
      type: 'THERMAL',
      severity: 'WARNING',
      detail: 'Branch loading approaching thermal limit',
      value: '94%',
      threshold: '90% nameplate',
      status: 'ACKNOWLEDGED',
    },
    {
      id: 'ALM-004',
      timestamp: new Date(now - 45 * 60 * 1000).toISOString(),
      dt_id: 'DT-AUZ-002',
      type: 'OVERVOLTAGE',
      severity: 'WARNING',
      detail: 'Feeder A voltage elevated during solar peak',
      value: '1.052 pu',
      threshold: '1.05 pu',
      status: 'CLEARED',
    },
    {
      id: 'ALM-005',
      timestamp: new Date(now - 62 * 60 * 1000).toISOString(),
      dt_id: 'DT-AUZ-005',
      type: 'EMERGENCY_SPG',
      severity: 'CRITICAL',
      detail: 'Bois-Rond Solar Farm SPG unresponsive — no ACK within 60s',
      value: 'No response',
      threshold: '60s timeout',
      status: 'ACKNOWLEDGED',
    },
  ]
}

const TYPE_LABELS: Record<string, string> = {
  OVERVOLTAGE: 'Overvoltage',
  EMERGENCY_SPG: 'Emergency SPG',
  THERMAL: 'Thermal',
  UNDERVOLTAGE: 'Undervoltage',
}

function fmtRelative(iso: string) {
  const diff = Math.floor((Date.now() - new Date(iso).getTime()) / 1000)
  if (diff < 60) return `${diff}s ago`
  if (diff < 3600) return `${Math.floor(diff / 60)}m ago`
  return `${Math.floor(diff / 3600)}h ${Math.floor((diff % 3600) / 60)}m ago`
}

export default function AlarmsPage() {
  const [alarms, setAlarms] = useState<Alarm[]>(makeAlarms)
  const [filter, setFilter] = useState<'ALL' | 'ACTIVE' | 'ACKNOWLEDGED' | 'CLEARED'>('ALL')
  const [, tick] = useState(0)

  // Re-render every 15s to update relative timestamps
  useEffect(() => {
    const id = setInterval(() => tick(t => t + 1), 15_000)
    return () => clearInterval(id)
  }, [])

  const acknowledge = (id: string) => {
    setAlarms(prev => prev.map(a => a.id === id ? { ...a, status: 'ACKNOWLEDGED' } : a))
    fetch(`${import.meta.env.VITE_API_URL || ''}/api/v1/lv-network/alarms/${id}/ack`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${localStorage.getItem('ng_token') || ''}` },
    }).catch(() => {})
  }

  const filtered = filter === 'ALL' ? alarms : alarms.filter(a => a.status === filter)
  const activeCount = alarms.filter(a => a.status === 'ACTIVE').length

  return (
    <div className="space-y-4 max-w-5xl mx-auto">
      <div className="flex items-start justify-between">
        <div>
          <div className="flex items-center gap-3">
            <h1 className="text-xl font-bold text-gray-900">Alarms</h1>
            {activeCount > 0 && (
              <span className="px-2 py-0.5 rounded-full text-xs font-bold bg-red-100 text-red-600 border border-red-200 animate-pulse">
                {activeCount} Active
              </span>
            )}
          </div>
          <p className="text-sm text-gray-500 mt-0.5">Overvoltage · Emergency SPG · Thermal violations</p>
        </div>
        <div className="flex items-center gap-2 text-xs text-gray-400">
          <RefreshCw className="w-3 h-3" />
          Live · 15s tick
        </div>
      </div>

      {/* Three-tier model banner */}
      <div className="bg-blue-50 border border-blue-200 rounded-lg px-4 py-2.5 flex items-center gap-4 text-xs">
        <span className="font-semibold text-blue-800">Three-tier resolution:</span>
        <span className="text-blue-600 font-medium">&lt;1s — Alarms</span>
        <span className="text-gray-400">→</span>
        <span className="text-indigo-600 font-medium">1min — SPG measurements + OE refresh</span>
        <span className="text-gray-400">→</span>
        <span className="text-gray-600 font-medium">PT30M — Settlement</span>
        <span className="ml-auto text-blue-500">DERIM v6</span>
      </div>

      {/* Filter tabs */}
      <div className="flex gap-1.5">
        {(['ALL', 'ACTIVE', 'ACKNOWLEDGED', 'CLEARED'] as const).map(f => (
          <button
            key={f}
            onClick={() => setFilter(f)}
            className={clsx(
              'px-3 py-1.5 rounded-lg text-xs font-medium transition-colors',
              filter === f
                ? 'bg-indigo-600 text-white'
                : 'bg-white border border-gray-200 text-gray-600 hover:bg-gray-50'
            )}
          >
            {f === 'ALL' ? `All (${alarms.length})`
              : f === 'ACTIVE' ? `Active (${activeCount})`
              : f === 'ACKNOWLEDGED' ? `Acknowledged (${alarms.filter(a => a.status === 'ACKNOWLEDGED').length})`
              : `Cleared (${alarms.filter(a => a.status === 'CLEARED').length})`}
          </button>
        ))}
      </div>

      {/* Alarms table */}
      <div className="card p-0 overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-gray-50 border-b border-gray-200">
            <tr>
              <th className="text-left text-xs text-gray-500 font-medium px-4 py-2.5">Time</th>
              <th className="text-left text-xs text-gray-500 font-medium px-4 py-2.5">DT</th>
              <th className="text-left text-xs text-gray-500 font-medium px-4 py-2.5">Type</th>
              <th className="text-left text-xs text-gray-500 font-medium px-4 py-2.5">Detail</th>
              <th className="text-right text-xs text-gray-500 font-medium px-4 py-2.5">Measured</th>
              <th className="text-right text-xs text-gray-500 font-medium px-4 py-2.5">Threshold</th>
              <th className="text-center text-xs text-gray-500 font-medium px-4 py-2.5">Status</th>
              <th className="px-4 py-2.5" />
            </tr>
          </thead>
          <tbody>
            {filtered.length === 0 && (
              <tr>
                <td colSpan={8} className="text-center py-12">
                  <CheckCircle className="w-6 h-6 text-green-300 mx-auto mb-2" />
                  <p className="text-sm text-gray-400">No alarms in this category</p>
                </td>
              </tr>
            )}
            {filtered.map(alarm => (
              <tr key={alarm.id} className={clsx(
                'border-t border-gray-100 hover:bg-gray-50',
                alarm.status === 'ACTIVE' && alarm.severity === 'CRITICAL' && 'bg-red-50 hover:bg-red-100',
                alarm.status === 'ACTIVE' && alarm.severity === 'WARNING' && 'bg-amber-50 hover:bg-amber-100',
              )}>
                <td className="px-4 py-3">
                  <div className="font-mono text-xs text-gray-700">{fmtRelative(alarm.timestamp)}</div>
                  <div className="text-[10px] text-gray-400 font-mono mt-0.5">{alarm.id}</div>
                </td>
                <td className="px-4 py-3 font-mono text-xs font-medium text-gray-700">{alarm.dt_id}</td>
                <td className="px-4 py-3">
                  <div className="flex items-center gap-1.5">
                    {alarm.severity === 'CRITICAL'
                      ? <AlertOctagon className="w-3.5 h-3.5 text-red-500 flex-shrink-0" />
                      : <AlertTriangle className="w-3.5 h-3.5 text-amber-500 flex-shrink-0" />}
                    <span className={clsx(
                      'text-[10px] font-semibold px-1.5 py-0.5 rounded border whitespace-nowrap',
                      alarm.type === 'OVERVOLTAGE' && 'bg-red-100 text-red-700 border-red-200',
                      alarm.type === 'EMERGENCY_SPG' && 'bg-orange-100 text-orange-700 border-orange-200',
                      alarm.type === 'THERMAL' && 'bg-amber-100 text-amber-700 border-amber-200',
                      alarm.type === 'UNDERVOLTAGE' && 'bg-blue-100 text-blue-700 border-blue-200',
                    )}>
                      {TYPE_LABELS[alarm.type]}
                    </span>
                  </div>
                </td>
                <td className="px-4 py-3 text-xs text-gray-600 max-w-xs">{alarm.detail}</td>
                <td className="px-4 py-3 text-right font-mono text-xs font-bold text-gray-800">{alarm.value}</td>
                <td className="px-4 py-3 text-right font-mono text-xs text-gray-500">{alarm.threshold}</td>
                <td className="px-4 py-3 text-center">
                  {alarm.status === 'ACTIVE' ? (
                    <span className="text-[10px] font-bold px-2 py-0.5 rounded border bg-red-100 text-red-600 border-red-200 animate-pulse">
                      ACTIVE
                    </span>
                  ) : alarm.status === 'ACKNOWLEDGED' ? (
                    <span className="text-[10px] font-semibold px-2 py-0.5 rounded border bg-amber-100 text-amber-700 border-amber-200">
                      ACK
                    </span>
                  ) : (
                    <span className="text-[10px] font-semibold px-2 py-0.5 rounded border bg-gray-100 text-gray-500 border-gray-200">
                      CLEARED
                    </span>
                  )}
                </td>
                <td className="px-4 py-3">
                  {alarm.status === 'ACTIVE' && (
                    <button
                      onClick={() => acknowledge(alarm.id)}
                      className="text-xs text-indigo-600 hover:text-indigo-800 font-medium whitespace-nowrap"
                    >
                      Acknowledge
                    </button>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <p className="text-[11px] text-gray-400 text-center">
        Critical alarms trigger Emergency SPG set-point recalculation within 60s per DERIM v6 §4.3.
        Acknowledged alarms are retained in audit log.
      </p>
    </div>
  )
}
