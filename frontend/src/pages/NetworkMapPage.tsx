import React, { useEffect, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import L from 'leaflet'
import 'leaflet/dist/leaflet.css'
import iconUrl from 'leaflet/dist/images/marker-icon.png'
import iconRetinaUrl from 'leaflet/dist/images/marker-icon-2x.png'
import shadowUrl from 'leaflet/dist/images/marker-shadow.png'
import {
  HV_SUBSTATION,
  HTA_CIRCUITS,
  DISTRIBUTION_TRANSFORMERS,
  DER_ASSETS,
  LV_FEEDERS,
  LV_CONNECTION_POINTS,
} from '../data/auzanceNetwork'
import type { DistributionTransformer, DERAsset } from '../data/auzanceNetwork'
import { X, ChevronRight } from 'lucide-react'
import clsx from 'clsx'

delete (L.Icon.Default.prototype as any)._getIconUrl
L.Icon.Default.mergeOptions({ iconUrl, iconRetinaUrl, shadowUrl })

// Layer names — keys used for both checkbox labels and group refs
const LN = {
  HV:  'HV Substation',
  MV:  'MV Circuits',
  DT:  'Dist. Transformers',
  DER: 'DER Assets',
  LV:  'LV Feeders',
  CP:  'Connection Points',
}
const ALL_LAYERS = Object.values(LN)

const DER_TYPE_COLORS: Record<string, string> = {
  SOLAR_PV:        '#eab308',
  WIND_TURBINE:    '#22d3ee',
  BESS:            '#a855f7',
  EV_CHARGER:      '#3b82f6',
  INDUSTRIAL_LOAD: '#f97316',
}
const DER_TYPE_LABELS: Record<string, string> = {
  SOLAR_PV: 'Solar PV', WIND_TURBINE: 'Wind', BESS: 'BESS',
  EV_CHARGER: 'EV Charger', INDUSTRIAL_LOAD: 'Flex Load',
}

function dtStatusColor(s: string) {
  return s === 'CRITICAL' ? '#ef4444' : s === 'WARNING' ? '#f59e0b' : '#22c55e'
}
function circuitColor(pct: number) {
  return pct >= 80 ? '#ef4444' : pct >= 60 ? '#f59e0b' : '#6b7280'
}
function statusBadge(s: string) {
  if (s === 'CRITICAL') return 'bg-red-100 text-red-700'
  if (s === 'WARNING')  return 'bg-amber-100 text-amber-700'
  return 'bg-green-100 text-green-700'
}

export default function NetworkMapPage() {
  const navigate = useNavigate()
  const mapContainerRef = useRef<HTMLDivElement>(null)
  const mapRef          = useRef<L.Map | null>(null)
  const groupsRef       = useRef<Record<string, L.LayerGroup>>({})
  const dtMarkersRef    = useRef<Record<string, L.CircleMarker>>({})

  const [selectedDT, setSelectedDT] = useState<DistributionTransformer | null>(null)

  const distressedDTs = DISTRIBUTION_TRANSFORMERS.filter(d => d.status !== 'NORMAL').length
  const dtDers = selectedDT ? DER_ASSETS.filter(a => a.dt_id === selectedDT.id) : []

  // ── Map init ──────────────────────────────────────────────────────────────
  useEffect(() => {
    if (!mapContainerRef.current || mapRef.current) return

    const map = L.map(mapContainerRef.current, { center: [46.033, 2.501], zoom: 12 })
    mapRef.current = map

    // Single OSM base layer
    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
      attribution: '© <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors',
      maxZoom: 19,
    }).addTo(map)

    const groups: Record<string, L.LayerGroup> = {}

    // ── HV Substation ──
    groups[LN.HV] = L.layerGroup()
    const hvIcon = L.divIcon({
      html: `<div style="width:18px;height:18px;background:#7c3aed;border:2px solid #fbbf24;border-radius:2px;transform:rotate(45deg)"></div>`,
      className: '', iconSize: [18, 18], iconAnchor: [9, 9],
    })
    L.marker([HV_SUBSTATION.lat, HV_SUBSTATION.lng], { icon: hvIcon })
      .bindPopup(`<b>${HV_SUBSTATION.name}</b><br/>${HV_SUBSTATION.voltage_kv} kV · ${HV_SUBSTATION.capacity_mva} MVA`)
      .addTo(groups[LN.HV])

    // ── MV Circuits ──
    groups[LN.MV] = L.layerGroup()
    HTA_CIRCUITS.forEach(c => {
      L.polyline(c.coordinates as L.LatLngExpression[], {
        color: circuitColor(c.loading_pct), weight: 3, opacity: 0.85,
      })
        .bindTooltip(`${c.name} — ${c.loading_pct}% loaded`, { sticky: true })
        .addTo(groups[LN.MV])
    })

    // ── Distribution Transformers ──
    groups[LN.DT] = L.layerGroup()
    DISTRIBUTION_TRANSFORMERS.forEach(dt => {
      const color = dtStatusColor(dt.status)
      const marker = L.circleMarker([dt.lat, dt.lng], {
        radius: 9, fillColor: color, color: '#fff', weight: 2, fillOpacity: 0.9,
      })
        .bindPopup(
          `<b>${dt.name}</b><br/>Loading: ${dt.loading_pct}% · ${dt.voltage_v} V<br/>` +
          `Capacity: ${dt.capacity_kva} kVA · Status: <span style="color:${color}">${dt.status}</span>`
        )
        .on('click', () => setSelectedDT(dt))
        .addTo(groups[LN.DT])
      dtMarkersRef.current[dt.id] = marker
    })

    // ── DER Assets ──
    groups[LN.DER] = L.layerGroup()
    DER_ASSETS.forEach(der => {
      const color = DER_TYPE_COLORS[der.type] || '#888'
      const isExport = der.current_kw < 0
      L.circleMarker([der.lat, der.lng], {
        radius: Math.max(5, Math.min(12, Math.sqrt(der.capacity_kw) / 2)),
        fillColor: color, color: '#fff', weight: 1.5, fillOpacity: 0.9,
      })
        .bindPopup(
          `<b>${der.name}</b><br/>${DER_TYPE_LABELS[der.type]}<br/>` +
          `${isExport ? 'Export' : 'Import'}: ${Math.abs(der.current_kw)} kW / ${der.capacity_kw} kW`
        )
        .addTo(groups[LN.DER])
    })

    // ── LV Feeders ──
    groups[LN.LV] = L.layerGroup()
    LV_FEEDERS.forEach(f => {
      const color = f.loading_pct >= 100 ? '#ef4444' : f.loading_pct >= 75 ? '#f59e0b' : '#9ca3af'
      L.polyline(f.coordinates as L.LatLngExpression[], {
        color, weight: 1.5, opacity: 0.7, dashArray: '4 3',
      })
        .bindTooltip(`${f.name} · ${f.loading_pct}%`, { sticky: true })
        .addTo(groups[LN.LV])
    })

    // ── Connection Points ──
    groups[LN.CP] = L.layerGroup()
    LV_CONNECTION_POINTS.forEach(cp => {
      const color = cp.type === 'DER_HOST' ? '#818cf8' : cp.type === 'COMMERCIAL' ? '#fbbf24' : '#9ca3af'
      L.circleMarker([cp.lat, cp.lng], {
        radius: 3, fillColor: color, color: '#fff', weight: 1, fillOpacity: 0.85,
      })
        .bindTooltip(`${cp.label || cp.id}`, { sticky: true })
        .addTo(groups[LN.CP])
    })

    // Add all to map initially
    Object.values(groups).forEach(g => g.addTo(map))
    groupsRef.current = groups

    return () => { map.remove(); mapRef.current = null }
  }, [])

  // ── Fly to selected DT ────────────────────────────────────────────────────
  useEffect(() => {
    if (!selectedDT || !mapRef.current) return
    mapRef.current.flyTo([selectedDT.lat, selectedDT.lng], 16, { duration: 1.2 })
    setTimeout(() => {
      dtMarkersRef.current[selectedDT.id]?.openPopup()
    }, 1300)
  }, [selectedDT])

  return (
    <div className="flex flex-col bg-gray-50" style={{ height: 'calc(100vh - 57px)' }}>

      {/* ── MAP SECTION (fixed height) ─────────────────────────────────── */}
      <div className="relative flex-shrink-0" style={{ height: '420px' }}>
        <div ref={mapContainerRef} className="absolute inset-0" />

        {/* Violation alert */}
        {distressedDTs > 0 && (
          <div className="absolute top-2 left-2 z-[1000] flex items-center gap-2 bg-red-600/90 text-white text-xs px-3 py-1.5 rounded-md shadow">
            <span className="w-1.5 h-1.5 rounded-full bg-white animate-pulse inline-block" />
            {distressedDTs} violation{distressedDTs > 1 ? 's' : ''} —{' '}
            {DISTRIBUTION_TRANSFORMERS.filter(d => d.status !== 'NORMAL').map(d => d.name).join(', ')}
          </div>
        )}

      </div>

      {/* ── DETAILS SECTION (scrollable below map) ─────────────────────── */}
      <div className="flex-1 overflow-y-auto bg-gray-50 border-t border-gray-200">
        {selectedDT ? (
          <DTDetailPanel
            dt={selectedDT}
            ders={dtDers}
            onClose={() => setSelectedDT(null)}
            onPowerFlow={() => {
              localStorage.setItem('lite_selected_dt', selectedDT.id)
              // Pass violation slot (37 = 18:30, EV surge window) and dtId so ForecastPage can pre-select
              navigate('/lookahead', { state: { slot: selectedDT.status !== 'NORMAL' ? 37 : undefined, dtId: selectedDT.id } })
            }}
            onOE={() => { localStorage.setItem('lite_selected_dt', selectedDT.id); navigate('/oe') }}
          />
        ) : (
          <NetworkSummaryPanel
            onSelectDT={setSelectedDT}
          />
        )}
      </div>
    </div>
  )
}

// ── Network Summary Panel ─────────────────────────────────────────────────────

function NetworkSummaryPanel({ onSelectDT }: { onSelectDT: (dt: DistributionTransformer) => void }) {
  const distressedDTList = DISTRIBUTION_TRANSFORMERS.filter(d => d.status !== 'NORMAL')
  return (
    <div className="p-4 max-w-5xl mx-auto">

      {/* Violations section */}
      {distressedDTList.length > 0 && (
        <div className="mb-4 border border-red-200 bg-red-50 rounded-lg p-3">
          <div className="flex items-center gap-2 mb-2">
            <span className="w-2 h-2 rounded-full bg-red-500 animate-pulse inline-block" />
            <span className="text-xs font-semibold text-red-600 uppercase tracking-wider">
              {distressedDTList.length} Transformer Violation{distressedDTList.length > 1 ? 's' : ''} — Action Required
            </span>
          </div>
          <div className="space-y-1.5">
            {distressedDTList.map(dt => (
              <div
                key={dt.id}
                onClick={() => onSelectDT(dt)}
                className="flex items-center justify-between cursor-pointer rounded px-3 py-2 bg-red-50 hover:bg-red-100 border border-red-200 transition-colors"
              >
                <div className="flex items-center gap-2">
                  <span className={clsx(
                    'text-[10px] font-bold px-1.5 py-0.5 rounded',
                    dt.status === 'CRITICAL' ? 'bg-red-600 text-white' : 'bg-amber-600 text-white'
                  )}>{dt.status}</span>
                  <span className="text-xs text-gray-800 font-medium">{dt.name}</span>
                  <span className="text-xs text-gray-500">{dt.loading_pct}% load · {dt.voltage_v} V</span>
                </div>
                <span className="text-[10px] text-red-500 italic">Click to inspect on map →</span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Top stats row */}
      <div className="grid grid-cols-4 gap-3 mb-4">
        {[
          { label: 'HV Substation',      value: HV_SUBSTATION.name,           sub: `${HV_SUBSTATION.voltage_kv} kV · ${HV_SUBSTATION.capacity_mva} MVA` },
          { label: 'Transformers',        value: DISTRIBUTION_TRANSFORMERS.length,  sub: `${DISTRIBUTION_TRANSFORMERS.filter(d => d.status !== 'NORMAL').length} in violation` },
          { label: 'DER Assets',          value: DER_ASSETS.length,            sub: `${DER_ASSETS.filter(a => a.current_kw < 0).length} generating` },
          { label: 'LV Feeders',          value: LV_FEEDERS.length,            sub: `${LV_FEEDERS.filter(f => f.loading_pct > 100).length} overloaded` },
        ].map(stat => (
          <div key={stat.label} className="bg-white border border-gray-200 rounded-lg p-3">
            <div className="text-xs text-gray-500 mb-0.5">{stat.label}</div>
            <div className="text-lg font-bold text-gray-900">{stat.value}</div>
            <div className="text-xs text-gray-500 mt-0.5">{stat.sub}</div>
          </div>
        ))}
      </div>

      <div className="grid grid-cols-2 gap-4">
        {/* Distribution Transformers table */}
        <div>
          <h4 className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-2">
            Distribution Transformers — click to inspect
          </h4>
          <table className="w-full text-xs">
            <thead>
              <tr className="text-gray-500 border-b border-gray-200">
                <th className="text-left pb-1.5 font-medium">Name</th>
                <th className="text-right pb-1.5 font-medium">Load%</th>
                <th className="text-right pb-1.5 font-medium">Voltage</th>
                <th className="text-right pb-1.5 font-medium">Status</th>
              </tr>
            </thead>
            <tbody>
              {DISTRIBUTION_TRANSFORMERS.map(dt => (
                <tr
                  key={dt.id}
                  onClick={() => onSelectDT(dt)}
                  className={clsx(
                    'border-b border-gray-200 hover:bg-gray-100 cursor-pointer transition-colors',
                    dt.status !== 'NORMAL' && 'bg-red-50'
                  )}
                >
                  <td className={clsx(
                    'py-1.5 text-gray-800',
                    dt.status !== 'NORMAL' && 'border-l-2 border-red-500 pl-2'
                  )}>{dt.name}</td>
                  <td className="py-1.5 text-right font-mono text-gray-700">{dt.loading_pct}%</td>
                  <td className="py-1.5 text-right font-mono text-gray-700">{dt.voltage_v} V</td>
                  <td className="py-1.5 text-right">
                    <span className={clsx('px-1.5 py-0.5 rounded text-[10px] font-medium', statusBadge(dt.status))}>
                      {dt.status}
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        {/* MV Circuits */}
        <div>
          <h4 className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-2">MV Circuits (20 kV)</h4>
          <table className="w-full text-xs">
            <thead>
              <tr className="text-gray-500 border-b border-gray-200">
                <th className="text-left pb-1.5 font-medium">Circuit</th>
                <th className="text-right pb-1.5 font-medium">Length</th>
                <th className="text-right pb-1.5 font-medium">Loading</th>
              </tr>
            </thead>
            <tbody>
              {HTA_CIRCUITS.map(c => (
                <tr key={c.id} className="border-b border-gray-200">
                  <td className="py-1.5 text-gray-800">{c.name}</td>
                  <td className="py-1.5 text-right text-gray-500">{c.length_km} km</td>
                  <td className="py-1.5 text-right">
                    <span className={clsx('px-1.5 py-0.5 rounded text-[10px] font-medium',
                      c.loading_pct >= 80 ? 'bg-red-100 text-red-700' : 'bg-amber-100 text-amber-700'
                    )}>
                      {c.loading_pct}%
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  )
}

// ── DT Detail Panel ───────────────────────────────────────────────────────────

function DTDetailPanel({
  dt, ders, onClose, onPowerFlow, onOE,
}: {
  dt: DistributionTransformer
  ders: DERAsset[]
  onClose: () => void
  onPowerFlow: () => void
  onOE: () => void
}) {
  return (
    <div className="p-4 max-w-3xl mx-auto">
      {/* Header */}
      <div className="flex items-start justify-between mb-4">
        <div>
          <h3 className="text-sm font-semibold text-gray-900">{dt.name}</h3>
          <p className="text-xs text-gray-500 mt-0.5">{dt.id} · {dt.circuit_id}</p>
        </div>
        <div className="flex items-center gap-2">
          <span className={clsx('px-2 py-0.5 rounded text-xs font-medium', statusBadge(dt.status))}>
            {dt.status}
          </span>
          <button onClick={onClose} className="text-gray-500 hover:text-gray-700">
            <X className="w-4 h-4" />
          </button>
        </div>
      </div>

      <div className="grid grid-cols-2 gap-4 mb-4">
        {/* DT Stats */}
        <div className="bg-white border border-gray-200 rounded-lg p-3 space-y-3">
          <div>
            <div className="flex justify-between text-xs mb-1">
              <span className="text-gray-500">Loading</span>
              <span className={clsx('font-semibold',
                dt.loading_pct > 100 ? 'text-red-400' : dt.loading_pct > 80 ? 'text-amber-400' : 'text-green-400'
              )}>{dt.loading_pct}%</span>
            </div>
            <div className="h-1.5 bg-gray-100 rounded-full overflow-hidden">
              <div className={clsx('h-full rounded-full',
                dt.loading_pct > 100 ? 'bg-red-500' : dt.loading_pct > 80 ? 'bg-amber-500' : 'bg-green-500'
              )} style={{ width: `${Math.min(dt.loading_pct, 100)}%` }} />
            </div>
          </div>
          <div className="grid grid-cols-2 gap-2 text-xs">
            <div>
              <div className="text-gray-500">Voltage</div>
              <div className="text-gray-900 font-medium">{dt.voltage_v} V</div>
            </div>
            <div>
              <div className="text-gray-500">Capacity</div>
              <div className="text-gray-900 font-medium">{dt.capacity_kva} kVA</div>
            </div>
          </div>
          <div className="flex gap-2 pt-1">
            <button onClick={onPowerFlow} className="flex-1 text-xs bg-indigo-600 hover:bg-indigo-500 text-white py-1.5 rounded font-medium flex items-center justify-center gap-1 transition-colors">
              Power Flow <ChevronRight className="w-3.5 h-3.5" />
            </button>
            <button onClick={onOE} className="flex-1 text-xs bg-gray-100 hover:bg-gray-200 text-gray-700 py-1.5 rounded font-medium flex items-center justify-center gap-1 transition-colors">
              OE Dispatch <ChevronRight className="w-3.5 h-3.5" />
            </button>
          </div>
        </div>

        {/* Connected DERs */}
        <div className="bg-white border border-gray-200 rounded-lg p-3">
          <div className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-2">
            Connected Assets ({ders.length})
          </div>
          {ders.length === 0 ? (
            <div className="text-xs text-gray-400">No DER assets registered</div>
          ) : (
            <div className="space-y-1.5">
              {ders.map(der => {
                const isExport = der.current_kw < 0
                const color = DER_TYPE_COLORS[der.type] || '#888'
                return (
                  <div key={der.id} className="flex items-center justify-between">
                    <div className="flex items-center gap-1.5">
                      <div className="w-2 h-2 rounded-full flex-shrink-0" style={{ background: color }} />
                      <div>
                        <div className="text-xs text-gray-800">{der.name}</div>
                        <div className="text-[10px] text-gray-500">{DER_TYPE_LABELS[der.type]} · {der.capacity_kw} kW</div>
                      </div>
                    </div>
                    <span className={clsx('text-xs font-mono font-medium', isExport ? 'text-green-400' : 'text-amber-400')}>
                      {isExport ? '−' : '+'}{Math.abs(der.current_kw)} kW
                    </span>
                  </div>
                )
              })}
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
