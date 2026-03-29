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
import type { DistributionTransformer, DERAsset, LVFeeder, LVConnectionPoint } from '../data/auzanceNetwork'
import { Upload, Layers, X } from 'lucide-react'
import clsx from 'clsx'

delete (L.Icon.Default.prototype as any)._getIconUrl
L.Icon.Default.mergeOptions({ iconUrl, iconRetinaUrl, shadowUrl })

const BASE_LAYERS: Record<string, L.TileLayer> = {}

function getBaseLayer(name: string): L.TileLayer {
  if (BASE_LAYERS[name]) return BASE_LAYERS[name]
  const urls: Record<string, string> = {
    OSM: 'https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png',
    'CartoDB Dark': 'https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png',
    'CartoDB Light': 'https://{s}.basemaps.cartocdn.com/light_all/{z}/{x}/{y}{r}.png',
    'ESRI Satellite': 'https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}',
  }
  const attributions: Record<string, string> = {
    OSM: '© OpenStreetMap contributors',
    'CartoDB Dark': '© CartoDB © OpenStreetMap',
    'CartoDB Light': '© CartoDB © OpenStreetMap',
    'ESRI Satellite': '© Esri',
  }
  BASE_LAYERS[name] = L.tileLayer(urls[name], { attribution: attributions[name], maxZoom: 19 })
  return BASE_LAYERS[name]
}

const DER_TYPE_COLORS: Record<string, string> = {
  SOLAR_PV: '#eab308',
  WIND_TURBINE: '#22d3ee',
  BESS: '#a855f7',
  EV_CHARGER: '#3b82f6',
  INDUSTRIAL_LOAD: '#f97316',
}

const DER_TYPE_LABELS: Record<string, string> = {
  SOLAR_PV: 'Solar PV',
  WIND_TURBINE: 'Wind Turbine',
  BESS: 'BESS',
  EV_CHARGER: 'EV Charger',
  INDUSTRIAL_LOAD: 'Industrial Load',
}

function dtStatusColor(status: string): string {
  if (status === 'CRITICAL') return '#ef4444'
  if (status === 'WARNING') return '#f59e0b'
  return '#22c55e'
}

function circuitColor(loading_pct: number): string {
  if (loading_pct >= 80) return '#ef4444'
  if (loading_pct >= 60) return '#f59e0b'
  return '#22c55e'
}

const ALL_LAYERS = ['HV Substation', 'HTA Circuits (MV)', 'LV Feeders (400V)', 'Distribution Transformers', 'DER Assets', 'Connection Points']

export default function NetworkMapPage() {
  const navigate = useNavigate()
  const mapContainerRef = useRef<HTMLDivElement>(null)
  const mapRef = useRef<L.Map | null>(null)
  const activeBaseLayerRef = useRef<L.TileLayer | null>(null)
  const uploadedLayerRef = useRef<L.GeoJSON | null>(null)

  const [selectedDT, setSelectedDT] = useState<DistributionTransformer | null>(null)
  const [activeLayers, setActiveLayers] = useState<Set<string>>(new Set(ALL_LAYERS))
  const [baseLayerName, setBaseLayerName] = useState<string>('CartoDB Dark')
  const [showUploadedGIS, setShowUploadedGIS] = useState(false)
  const [uploadedFileName, setUploadedFileName] = useState<string | null>(null)
  const fileInputRef = useRef<HTMLInputElement>(null)

  // Derived totals
  const totalGenKw = DER_ASSETS.filter((a) => a.current_kw < 0).reduce((s, a) => s + Math.abs(a.current_kw), 0)
  const totalLoadKw = DER_ASSETS.filter((a) => a.current_kw > 0).reduce((s, a) => s + a.current_kw, 0)
  const netBalance = totalLoadKw - totalGenKw
  const distressedDTs = DISTRIBUTION_TRANSFORMERS.filter((dt) => dt.status !== 'NORMAL').length

  const dtDers = selectedDT ? DER_ASSETS.filter((a) => a.dt_id === selectedDT.id) : []

  const [monitoringAge, setMonitoringAge] = useState(0)
  useEffect(() => {
    const id = setInterval(() => setMonitoringAge((a) => (a >= 30 ? 0 : a + 1)), 1000)
    return () => clearInterval(id)
  }, [])

  const DER_TYPE_LABELS_MAP: Record<string, string> = {
    SOLAR_PV: 'Solar PV', WIND_TURBINE: 'Wind Turbine', BESS: 'BESS',
    EV_CHARGER: 'EV Charger', INDUSTRIAL_LOAD: 'Industrial Load',
  }
  const fleetByType = Object.entries(DER_TYPE_COLORS).map(([type, color]) => {
    const assets = DER_ASSETS.filter((a) => a.type === type)
    const totalCap = assets.reduce((s, a) => s + a.capacity_kw, 0)
    const totalGen = assets.filter((a) => a.current_kw < 0).reduce((s, a) => s + Math.abs(a.current_kw), 0)
    return { type, label: DER_TYPE_LABELS_MAP[type] || type, color, totalCap, totalGen }
  }).filter((t) => t.totalCap > 0)

  // Map initialization
  useEffect(() => {
    if (!mapContainerRef.current || mapRef.current) return

    const map = L.map(mapContainerRef.current, {
      center: [46.0205, 2.4895],
      zoom: 13,
      zoomControl: true,
    })
    mapRef.current = map

    // Default base layer
    const baseLayer = getBaseLayer('CartoDB Dark')
    baseLayer.addTo(map)
    activeBaseLayerRef.current = baseLayer

    // HV Substation
    const hvIcon = L.divIcon({
      html: `<div style="width:22px;height:22px;background:#7c3aed;border:3px solid #fbbf24;border-radius:3px;transform:rotate(45deg);box-shadow:0 0 8px rgba(124,58,237,0.8)"></div>`,
      className: '',
      iconSize: [22, 22],
      iconAnchor: [11, 11],
    })
    L.marker([HV_SUBSTATION.lat, HV_SUBSTATION.lng], { icon: hvIcon })
      .bindPopup(`
        <div style="font-family:sans-serif;min-width:180px">
          <div style="font-weight:bold;color:#7c3aed;margin-bottom:4px">${HV_SUBSTATION.name}</div>
          <div>Voltage: ${HV_SUBSTATION.voltage_kv} kV</div>
          <div>Capacity: ${HV_SUBSTATION.capacity_mva} MVA</div>
          <div>Status: <span style="color:#22c55e">${HV_SUBSTATION.status}</span></div>
        </div>
      `)
      .addTo(map)

    // HTA Circuits
    HTA_CIRCUITS.forEach((circuit) => {
      const color = circuitColor(circuit.loading_pct)
      L.polyline(circuit.coordinates as L.LatLngExpression[], {
        color,
        weight: 4,
        opacity: 0.9,
      })
        .bindTooltip(`${circuit.name} — ${circuit.loading_pct}% loaded`, { sticky: true })
        .addTo(map)
    })

    // Distribution Transformers
    DISTRIBUTION_TRANSFORMERS.forEach((dt) => {
      const color = dtStatusColor(dt.status)
      const marker = L.circleMarker([dt.lat, dt.lng], {
        radius: 10,
        fillColor: color,
        color: '#fff',
        weight: 2,
        fillOpacity: 0.9,
      })
        .bindPopup(`
          <div style="font-family:sans-serif;min-width:200px">
            <div style="font-weight:bold;margin-bottom:4px">${dt.name}</div>
            <div>Loading: ${dt.loading_pct}%</div>
            <div>Voltage: ${dt.voltage_v} V</div>
            <div>Capacity: ${dt.capacity_kva} kVA</div>
            <div>DER Count: ${dt.der_count}</div>
            <div>Status: <span style="color:${color}">${dt.status}</span></div>
          </div>
        `)
        .addTo(map)

      marker.on('click', () => {
        setSelectedDT(dt)
      })
    })

    // DER Assets
    DER_ASSETS.forEach((der) => {
      const color = DER_TYPE_COLORS[der.type] || '#888'
      const isExporting = der.current_kw < 0
      L.circleMarker([der.lat, der.lng], {
        radius: Math.max(5, Math.min(14, Math.sqrt(der.capacity_kw) / 1.8)),
        fillColor: color,
        color: '#222',
        weight: 1.5,
        fillOpacity: 0.9,
      })
        .bindPopup(`
          <div style="font-family:sans-serif;min-width:180px">
            <div style="font-weight:bold;margin-bottom:4px">${der.name}</div>
            <div>Type: ${DER_TYPE_LABELS[der.type]}</div>
            <div>Current: <span style="color:${isExporting ? '#22c55e' : '#ef4444'}">${isExporting ? '' : '+'}${der.current_kw} kW</span></div>
            <div>Capacity: ${der.capacity_kw} kW</div>
            ${der.soc_pct !== undefined ? `<div>SoC: ${der.soc_pct}%</div>` : ''}
            ${der.doe_export_kw !== undefined ? `<div>DOE Export Limit: ${der.doe_export_kw} kW</div>` : ''}
            ${der.doe_import_kw !== undefined ? `<div>DOE Import Limit: ${der.doe_import_kw} kW</div>` : ''}
          </div>
        `)
        .addTo(map)
    })

    // LV Feeders (400V) — thin lines from DT to connection points
    LV_FEEDERS.forEach((feeder) => {
      const color = feeder.loading_pct >= 100 ? '#ef4444' : feeder.loading_pct >= 75 ? '#f59e0b' : '#6b7280'
      L.polyline(feeder.coordinates as L.LatLngExpression[], {
        color,
        weight: 1.5,
        opacity: 0.8,
        dashArray: '4 3',
      })
        .bindTooltip(`${feeder.name} · ${feeder.loading_pct}% loaded · 400V LV`, { sticky: true })
        .addTo(map)
    })

    // LV Connection Points
    LV_CONNECTION_POINTS.forEach((cp) => {
      const color = cp.type === 'DER_HOST' ? '#818cf8' : cp.type === 'COMMERCIAL' ? '#fbbf24' : '#6b7280'
      const radius = cp.type === 'DER_HOST' ? 4 : 3
      L.circleMarker([cp.lat, cp.lng], {
        radius,
        fillColor: color,
        color: '#1f2937',
        weight: 1,
        fillOpacity: 0.9,
      })
        .bindTooltip(`${cp.label || cp.id} · ${cp.type.replace('_', ' ')}`, { sticky: true })
        .addTo(map)
    })

    return () => {
      map.remove()
      mapRef.current = null
    }
  }, [])

  // Base layer switching
  useEffect(() => {
    if (!mapRef.current) return
    if (activeBaseLayerRef.current) {
      mapRef.current.removeLayer(activeBaseLayerRef.current)
    }
    const layer = getBaseLayer(baseLayerName)
    layer.addTo(mapRef.current)
    activeBaseLayerRef.current = layer
  }, [baseLayerName])

  // Uploaded GIS layer visibility
  useEffect(() => {
    if (!mapRef.current || !uploadedLayerRef.current) return
    if (showUploadedGIS) {
      uploadedLayerRef.current.addTo(mapRef.current)
    } else {
      mapRef.current.removeLayer(uploadedLayerRef.current)
    }
  }, [showUploadedGIS])

  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file || !mapRef.current) return
    const reader = new FileReader()
    reader.onload = (ev) => {
      try {
        const geojson = JSON.parse(ev.target?.result as string)
        if (uploadedLayerRef.current) {
          mapRef.current!.removeLayer(uploadedLayerRef.current)
        }
        uploadedLayerRef.current = L.geoJSON(geojson, {
          style: { color: '#818cf8', weight: 2, fillOpacity: 0.2 },
          onEachFeature: (feature, layer) => {
            if (feature.properties) {
              layer.bindPopup(
                Object.entries(feature.properties)
                  .map(([k, v]) => `<b>${k}:</b> ${v}`)
                  .join('<br/>')
              )
            }
          },
        })
        uploadedLayerRef.current.addTo(mapRef.current!)
        setUploadedFileName(file.name)
        setShowUploadedGIS(true)
      } catch {
        alert('Failed to parse GeoJSON file')
      }
    }
    reader.readAsText(file)
    e.target.value = ''
  }

  const handleNavigatePowerFlow = () => {
    if (selectedDT) localStorage.setItem('lite_selected_dt', selectedDT.id)
    navigate('/powerflow')
  }

  const handleNavigateEnvelope = () => {
    if (selectedDT) localStorage.setItem('lite_selected_dt', selectedDT.id)
    navigate('/envelope')
  }

  return (
    <div className="relative w-full h-full -m-6" style={{ height: 'calc(100vh - 57px)' }}>
      {/* Map container */}
      <div ref={mapContainerRef} className="absolute inset-0 z-0" />

      {/* Base layer switcher — top left */}
      <div className="absolute top-3 left-3 z-[1000] flex gap-1 bg-gray-900/90 p-1.5 rounded-lg border border-gray-700 backdrop-blur-sm">
        {['OSM', 'CartoDB Dark', 'CartoDB Light', 'ESRI Satellite'].map((name) => (
          <button
            key={name}
            onClick={() => setBaseLayerName(name)}
            className={clsx(
              'px-2.5 py-1 text-xs rounded font-medium transition-colors',
              baseLayerName === name
                ? 'bg-indigo-600 text-white'
                : 'text-gray-300 hover:bg-gray-700'
            )}
          >
            {name}
          </button>
        ))}
      </div>

      {/* Constraint alert banner */}
      {distressedDTs > 0 && (
        <div className="absolute top-14 left-3 z-[1000] flex items-center gap-2 bg-red-900/90 border border-red-700/60 rounded-lg px-3 py-2 backdrop-blur-sm">
          <div className="w-2 h-2 rounded-full bg-red-400 animate-pulse flex-shrink-0" />
          <span className="text-xs font-medium text-red-300">
            {distressedDTs} constraint violation{distressedDTs > 1 ? 's' : ''} detected —{' '}
            {DISTRIBUTION_TRANSFORMERS.filter((d) => d.status !== 'NORMAL').map((d) => d.name).join(', ')}
          </span>
        </div>
      )}

      {/* Layer toggles + Upload — top right (but left of side panel) */}
      <div className="absolute top-3 right-[348px] z-[1000] bg-gray-900/90 p-3 rounded-lg border border-gray-700 backdrop-blur-sm min-w-[200px]">
        <div className="flex items-center gap-2 mb-2">
          <Layers className="w-3.5 h-3.5 text-gray-400" />
          <span className="text-xs font-medium text-gray-300">Layers</span>
        </div>
        <div className="space-y-1.5">
          {ALL_LAYERS.map((layer) => (
            <label key={layer} className="flex items-center gap-2 cursor-pointer">
              <input
                type="checkbox"
                checked={activeLayers.has(layer)}
                onChange={(e) => {
                  const next = new Set(activeLayers)
                  if (e.target.checked) next.add(layer)
                  else next.delete(layer)
                  setActiveLayers(next)
                }}
                className="w-3.5 h-3.5 accent-indigo-500"
              />
              <span className="text-xs text-gray-300">{layer}</span>
            </label>
          ))}
          {uploadedFileName && (
            <label className="flex items-center gap-2 cursor-pointer">
              <input
                type="checkbox"
                checked={showUploadedGIS}
                onChange={(e) => setShowUploadedGIS(e.target.checked)}
                className="w-3.5 h-3.5 accent-indigo-500"
              />
              <span className="text-xs text-indigo-300 truncate max-w-[140px]">{uploadedFileName}</span>
            </label>
          )}
        </div>
        <button
          onClick={() => fileInputRef.current?.click()}
          className="mt-3 flex items-center gap-1.5 text-xs text-indigo-400 hover:text-indigo-300 transition-colors"
        >
          <Upload className="w-3.5 h-3.5" />
          Upload GIS (.geojson)
        </button>
        <input
          ref={fileInputRef}
          type="file"
          accept=".geojson,.json"
          className="hidden"
          onChange={handleFileUpload}
        />
      </div>

      {/* Right side panel */}
      <div className="absolute right-0 top-0 h-full w-80 bg-gray-900/95 border-l border-gray-800 overflow-y-auto z-[1000] flex flex-col">
        {selectedDT ? (
          /* DT Detail Panel */
          <div className="flex-1 flex flex-col">
            <div className="p-4 border-b border-gray-800 flex items-start justify-between">
              <div className="flex-1">
                <h3 className="text-sm font-semibold text-white leading-tight">{selectedDT.name}</h3>
                <p className="text-xs text-gray-500 mt-0.5">{selectedDT.id} · {selectedDT.circuit_id}</p>
              </div>
              <button onClick={() => setSelectedDT(null)} className="text-gray-500 hover:text-gray-300 ml-2 flex-shrink-0">
                <X className="w-4 h-4" />
              </button>
            </div>

            {/* Status badge */}
            <div className="px-4 pt-3">
              <span className={clsx(
                'inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium',
                selectedDT.status === 'CRITICAL' ? 'bg-red-900/60 text-red-400 border border-red-700/50'
                  : selectedDT.status === 'WARNING' ? 'bg-amber-900/60 text-amber-400 border border-amber-700/50'
                  : 'bg-green-900/60 text-green-400 border border-green-700/50'
              )}>
                {selectedDT.status}
              </span>
            </div>

            {/* Stats */}
            <div className="px-4 pt-3 space-y-2">
              <div>
                <div className="flex justify-between text-xs mb-1">
                  <span className="text-gray-400">Loading</span>
                  <span className={clsx(
                    'font-medium',
                    selectedDT.loading_pct > 100 ? 'text-red-400'
                      : selectedDT.loading_pct > 80 ? 'text-amber-400'
                      : 'text-green-400'
                  )}>{selectedDT.loading_pct}%</span>
                </div>
                <div className="h-2 bg-gray-700 rounded-full overflow-hidden">
                  <div
                    className={clsx(
                      'h-full rounded-full transition-all',
                      selectedDT.loading_pct > 100 ? 'bg-red-500'
                        : selectedDT.loading_pct > 80 ? 'bg-amber-500'
                        : 'bg-green-500'
                    )}
                    style={{ width: `${Math.min(selectedDT.loading_pct, 100)}%` }}
                  />
                </div>
              </div>
              <div className="grid grid-cols-2 gap-2">
                <div className="bg-gray-800 rounded-lg p-2">
                  <div className="text-xs text-gray-500">Voltage</div>
                  <div className="text-sm font-semibold text-white">{selectedDT.voltage_v} V</div>
                </div>
                <div className="bg-gray-800 rounded-lg p-2">
                  <div className="text-xs text-gray-500">Capacity</div>
                  <div className="text-sm font-semibold text-white">{selectedDT.capacity_kva} kVA</div>
                </div>
              </div>
            </div>

            {/* Connected DERs */}
            <div className="px-4 pt-4">
              <h4 className="text-xs font-semibold text-gray-400 uppercase tracking-wider mb-2">
                Connected DERs ({dtDers.length})
              </h4>
              <div className="space-y-2">
                {dtDers.map((der) => (
                  <DERRow key={der.id} der={der} />
                ))}
              </div>
            </div>

            {/* Action buttons */}
            <div className="mt-auto p-4 border-t border-gray-800 space-y-2">
              <button
                onClick={handleNavigatePowerFlow}
                className="w-full btn-primary text-xs py-2"
              >
                Run Power Flow →
              </button>
              <button
                onClick={handleNavigateEnvelope}
                className="w-full btn-secondary text-xs py-2"
              >
                Generate OE →
              </button>
            </div>
          </div>
        ) : (
          /* Network Summary Panel */
          <div className="p-4 flex-1">
            <h3 className="text-sm font-semibold text-white mb-4">Network Summary</h3>

            {/* HV Substation */}
            <div className="bg-gray-800 rounded-lg p-3 mb-3 border-l-4 border-purple-500">
              <div className="text-xs text-gray-400 mb-1">HV Substation</div>
              <div className="text-sm font-semibold text-white">{HV_SUBSTATION.name}</div>
              <div className="text-xs text-gray-400 mt-1">{HV_SUBSTATION.voltage_kv} kV · {HV_SUBSTATION.capacity_mva} MVA · <span className="text-green-400">{HV_SUBSTATION.status}</span></div>
            </div>

            {/* Stats grid */}
            <div className="grid grid-cols-2 gap-2 mb-3">
              <div className="bg-gray-800 rounded-lg p-2.5">
                <div className="text-xs text-gray-500">Distribution Transformers</div>
                <div className="text-xl font-bold text-white mt-0.5">{DISTRIBUTION_TRANSFORMERS.length}</div>
              </div>
              <div className="bg-gray-800 rounded-lg p-2.5">
                <div className="text-xs text-gray-500">DER Assets</div>
                <div className="text-xl font-bold text-white mt-0.5">{DER_ASSETS.length}</div>
              </div>
              <div className="bg-gray-800 rounded-lg p-2.5">
                <div className="text-xs text-gray-500">Total Generation</div>
                <div className="text-lg font-bold text-green-400 mt-0.5">{totalGenKw.toFixed(1)} kW</div>
              </div>
              <div className="bg-gray-800 rounded-lg p-2.5">
                <div className="text-xs text-gray-500">Distressed DTs</div>
                <div className={clsx('text-xl font-bold mt-0.5', distressedDTs > 0 ? 'text-red-400' : 'text-green-400')}>
                  {distressedDTs}
                </div>
              </div>
            </div>

            {/* Generation fleet by type */}
            <div className="mb-3">
              <div className="text-xs font-semibold text-gray-400 uppercase tracking-wider mb-2">DER Fleet by Type</div>
              <div className="space-y-1.5">
                {fleetByType.map(({ type, label, color, totalCap, totalGen }) => (
                  <div key={type}>
                    <div className="flex items-center justify-between mb-0.5">
                      <div className="flex items-center gap-1.5">
                        <div className="w-2 h-2 rounded-full flex-shrink-0" style={{ background: color }} />
                        <span className="text-xs text-gray-300">{label}</span>
                      </div>
                      <span className="text-xs text-gray-400 font-mono">{totalGen.toFixed(0)} / {totalCap} kW</span>
                    </div>
                    <div className="h-1 bg-gray-700 rounded-full overflow-hidden">
                      <div
                        className="h-full rounded-full"
                        style={{ width: `${Math.min(100, (totalGen / totalCap) * 100)}%`, background: color }}
                      />
                    </div>
                  </div>
                ))}
              </div>
            </div>

            {/* HTA Circuits */}
            <div className="mb-3">
              <div className="text-xs font-semibold text-gray-400 uppercase tracking-wider mb-2">HTA Circuits</div>
              {HTA_CIRCUITS.map((c) => (
                <div key={c.id} className="flex items-center justify-between py-1.5 border-b border-gray-800">
                  <div>
                    <div className="text-xs text-gray-200">{c.name}</div>
                    <div className="text-xs text-gray-500">{c.length_km} km · {c.voltage_kv} kV</div>
                  </div>
                  <span className={clsx('text-xs font-medium px-2 py-0.5 rounded-full',
                    c.loading_pct >= 80 ? 'bg-red-900/50 text-red-400' : 'bg-amber-900/50 text-amber-400'
                  )}>
                    {c.loading_pct}%
                  </span>
                </div>
              ))}
            </div>

            {/* DTs list */}
            <div>
              <div className="text-xs font-semibold text-gray-400 uppercase tracking-wider mb-2">Distribution Transformers</div>
              {DISTRIBUTION_TRANSFORMERS.map((dt) => (
                <button
                  key={dt.id}
                  onClick={() => setSelectedDT(dt)}
                  className="w-full flex items-center justify-between py-1.5 border-b border-gray-800 hover:bg-gray-800/50 px-1 rounded transition-colors"
                >
                  <div className="text-left">
                    <div className="text-xs text-gray-200">{dt.name}</div>
                    <div className="text-xs text-gray-500">{dt.capacity_kva} kVA · {dt.der_count} DERs</div>
                  </div>
                  <span className={clsx('text-xs font-medium px-1.5 py-0.5 rounded-full flex-shrink-0',
                    dt.status === 'CRITICAL' ? 'bg-red-900/50 text-red-400'
                      : dt.status === 'WARNING' ? 'bg-amber-900/50 text-amber-400'
                      : 'bg-green-900/50 text-green-400'
                  )}>
                    {dt.loading_pct}%
                  </span>
                </button>
              ))}
            </div>
          </div>
        )}
      </div>

      {/* Bottom status bar */}
      <div className="absolute bottom-3 left-3 right-[348px] z-[1000] bg-gray-900/90 backdrop-blur-sm border border-gray-700 rounded-lg px-4 py-2 flex items-center gap-6">
        <div className="flex items-center gap-2">
          <div className="w-2 h-2 rounded-full bg-green-400" />
          <span className="text-xs text-gray-400">Generation:</span>
          <span className="text-xs font-semibold text-green-400">{totalGenKw.toFixed(1)} kW</span>
        </div>
        <div className="flex items-center gap-2">
          <div className="w-2 h-2 rounded-full bg-red-400" />
          <span className="text-xs text-gray-400">Load:</span>
          <span className="text-xs font-semibold text-red-400">{totalLoadKw.toFixed(1)} kW</span>
        </div>
        <div className="flex items-center gap-2">
          <span className="text-xs text-gray-400">Net:</span>
          <span className={clsx('text-xs font-semibold', netBalance > 0 ? 'text-red-400' : 'text-green-400')}>
            {netBalance > 0 ? '+' : ''}{netBalance.toFixed(1)} kW
          </span>
        </div>
        <div className="flex items-center gap-2 ml-auto">
          <span className="text-xs text-gray-400">Violations:</span>
          <span className={clsx('text-xs font-semibold', distressedDTs > 0 ? 'text-red-400' : 'text-green-400')}>
            {distressedDTs} DT{distressedDTs !== 1 ? 's' : ''}
          </span>
        </div>
        <div className="flex items-center gap-2">
          <span className="text-xs text-gray-400">LV Feeders:</span>
          <span className={clsx('text-xs font-semibold',
            LV_FEEDERS.filter(f => f.loading_pct > 100).length > 0 ? 'text-red-400' : 'text-gray-300'
          )}>
            {LV_FEEDERS.length} · {LV_FEEDERS.filter(f => f.loading_pct > 100).length} overloaded
          </span>
        </div>
        <div className="flex items-center gap-1.5 ml-2">
          <div className="w-1.5 h-1.5 rounded-full bg-indigo-400 animate-pulse" />
          <span className="text-xs text-gray-500">Monitoring active · updated {monitoringAge}s ago</span>
        </div>
      </div>
    </div>
  )
}

function DERRow({ der }: { der: DERAsset }) {
  const isExporting = der.current_kw < 0
  const color = DER_TYPE_COLORS[der.type] || '#888'
  return (
    <div className="bg-gray-800 rounded-lg p-2.5">
      <div className="flex items-start justify-between">
        <div className="flex items-center gap-2">
          <div className="w-2.5 h-2.5 rounded-full flex-shrink-0" style={{ background: color }} />
          <div>
            <div className="text-xs font-medium text-gray-200">{der.name}</div>
            <div className="text-xs text-gray-500">{DER_TYPE_LABELS[der.type]}</div>
          </div>
        </div>
        <div className="text-right">
          <div className={clsx('text-xs font-semibold', isExporting ? 'text-green-400' : 'text-red-400')}>
            {isExporting ? '' : '+'}{der.current_kw} kW
          </div>
          {der.soc_pct !== undefined && (
            <div className="text-xs text-gray-500">SoC: {der.soc_pct}%</div>
          )}
        </div>
      </div>
      {der.doe_export_kw !== undefined && (
        <div className="text-xs text-gray-500 mt-1">DOE Export: {der.doe_export_kw} kW</div>
      )}
      {der.doe_import_kw !== undefined && (
        <div className="text-xs text-gray-500 mt-1">DOE Import: {der.doe_import_kw} kW</div>
      )}
    </div>
  )
}
