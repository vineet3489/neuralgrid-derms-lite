// Synthetic HV/MV/LV network around Auzances, Creuse, France
// HV Substation "Poste Source Auzance" at 46.020°N, 2.490°E
// HTA = Haute Tension A (20kV medium voltage circuits)

export interface HVSubstation {
  id: string; name: string; voltage_kv: number
  lat: number; lng: number; capacity_mva: number; status: string
}

export interface HTACircuit {
  id: string; name: string; voltage_kv: number
  length_km: number; loading_pct: number
  coordinates: [number, number][]
}

export interface DistributionTransformer {
  id: string; name: string; circuit_id: string
  lat: number; lng: number; capacity_kva: number
  loading_pct: number; voltage_v: number
  der_count: number; status: 'NORMAL' | 'WARNING' | 'CRITICAL'
}

export interface DERAsset {
  id: string; dt_id: string; name: string
  type: 'SOLAR_PV' | 'WIND_TURBINE' | 'BESS' | 'EV_CHARGER' | 'INDUSTRIAL_LOAD'
  lat: number; lng: number
  capacity_kw: number; current_kw: number
  soc_pct?: number; status: string
  doe_export_kw?: number; doe_import_kw?: number
}

export const HV_SUBSTATION: HVSubstation = {
  id: 'HV-AUZ-001', name: 'Poste Source Auzance',
  voltage_kv: 63, lat: 46.0205, lng: 2.4895,
  capacity_mva: 25, status: 'ONLINE',
}

export const HTA_CIRCUITS: HTACircuit[] = [
  {
    id: 'HTA-NORD', name: 'Circuit HTA Auzance-Nord',
    voltage_kv: 20, length_km: 8.2, loading_pct: 45,
    coordinates: [
      [46.0205, 2.4895], [46.028, 2.487], [46.035, 2.485],
      [46.042, 2.481], [46.048, 2.478], [46.052, 2.486], [46.055, 2.495],
    ],
  },
  {
    id: 'HTA-EST', name: 'Circuit HTA Auzance-Est',
    voltage_kv: 20, length_km: 5.6, loading_pct: 78,
    coordinates: [
      [46.0205, 2.4895], [46.019, 2.502], [46.022, 2.515],
      [46.019, 2.526], [46.018, 2.535],
    ],
  },
]

export const DISTRIBUTION_TRANSFORMERS: DistributionTransformer[] = [
  { id: 'DT-AUZ-001', name: 'Hameau des Fougères', circuit_id: 'HTA-NORD', lat: 46.035, lng: 2.485, capacity_kva: 160, loading_pct: 58, voltage_v: 228.4, der_count: 3, status: 'NORMAL' },
  { id: 'DT-AUZ-002', name: 'La Croix Blanche', circuit_id: 'HTA-NORD', lat: 46.048, lng: 2.478, capacity_kva: 250, loading_pct: 42, voltage_v: 231.2, der_count: 2, status: 'NORMAL' },
  { id: 'DT-AUZ-003', name: 'Moulin Neuf', circuit_id: 'HTA-NORD', lat: 46.055, lng: 2.495, capacity_kva: 400, loading_pct: 35, voltage_v: 232.8, der_count: 2, status: 'NORMAL' },
  { id: 'DT-AUZ-004', name: 'Zone Industrielle Est', circuit_id: 'HTA-EST', lat: 46.022, lng: 2.515, capacity_kva: 630, loading_pct: 91, voltage_v: 221.6, der_count: 1, status: 'WARNING' },
  { id: 'DT-AUZ-005', name: 'Ferme Solaire Bois-Rond', circuit_id: 'HTA-EST', lat: 46.018, lng: 2.535, capacity_kva: 500, loading_pct: 104, voltage_v: 218.3, der_count: 2, status: 'CRITICAL' },
]

export const DER_ASSETS: DERAsset[] = [
  { id: 'AST-AUZ-001', dt_id: 'DT-AUZ-001', name: 'Community Solar A', type: 'SOLAR_PV', lat: 46.0362, lng: 2.4868, capacity_kw: 50, current_kw: -38.2, status: 'ONLINE', doe_export_kw: 45 },
  { id: 'AST-AUZ-002', dt_id: 'DT-AUZ-001', name: 'Community Solar B', type: 'SOLAR_PV', lat: 46.0335, lng: 2.4835, capacity_kw: 50, current_kw: -35.8, status: 'ONLINE', doe_export_kw: 45 },
  { id: 'AST-AUZ-003', dt_id: 'DT-AUZ-001', name: 'Fougères BESS', type: 'BESS', lat: 46.0358, lng: 2.4842, capacity_kw: 30, current_kw: 12.5, soc_pct: 72, status: 'ONLINE', doe_export_kw: 28 },
  { id: 'AST-AUZ-004', dt_id: 'DT-AUZ-002', name: 'Croix Blanche Wind', type: 'WIND_TURBINE', lat: 46.0492, lng: 2.4768, capacity_kw: 100, current_kw: -62.4, status: 'ONLINE', doe_export_kw: 90 },
  { id: 'AST-AUZ-005', dt_id: 'DT-AUZ-002', name: 'EV Hub CB', type: 'EV_CHARGER', lat: 46.0475, lng: 2.4792, capacity_kw: 25, current_kw: 18.3, status: 'ONLINE', doe_export_kw: 20 },
  { id: 'AST-AUZ-006', dt_id: 'DT-AUZ-003', name: 'Moulin Farm Solar', type: 'SOLAR_PV', lat: 46.0558, lng: 2.4952, capacity_kw: 200, current_kw: -148.5, status: 'ONLINE', doe_export_kw: 180 },
  { id: 'AST-AUZ-007', dt_id: 'DT-AUZ-003', name: 'Moulin Agri DSR', type: 'INDUSTRIAL_LOAD', lat: 46.0545, lng: 2.4968, capacity_kw: 100, current_kw: 82.0, status: 'ONLINE', doe_import_kw: 100 },
  { id: 'AST-AUZ-008', dt_id: 'DT-AUZ-004', name: 'ZI Est Industrial DSR', type: 'INDUSTRIAL_LOAD', lat: 46.0225, lng: 2.5155, capacity_kw: 500, current_kw: 445.2, status: 'ONLINE', doe_import_kw: 480 },
  { id: 'AST-AUZ-009', dt_id: 'DT-AUZ-005', name: 'Bois-Rond Solar Farm', type: 'SOLAR_PV', lat: 46.0188, lng: 2.5362, capacity_kw: 300, current_kw: -285.6, status: 'ONLINE', doe_export_kw: 250 },
  { id: 'AST-AUZ-010', dt_id: 'DT-AUZ-005', name: 'Bois-Rond BESS', type: 'BESS', lat: 46.0172, lng: 2.5345, capacity_kw: 150, current_kw: -142.8, soc_pct: 89, status: 'ONLINE', doe_export_kw: 120 },
]
