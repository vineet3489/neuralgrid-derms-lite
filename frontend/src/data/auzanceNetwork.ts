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

// ─── LV Network (400V) ───────────────────────────────────────────────────────

export interface LVFeeder {
  id: string
  dt_id: string
  name: string
  loading_pct: number
  coordinates: [number, number][]   // cable route [lat, lng]
}

export interface LVConnectionPoint {
  id: string
  feeder_id: string
  dt_id: string
  lat: number
  lng: number
  type: 'RESIDENTIAL' | 'COMMERCIAL' | 'DER_HOST'
  der_id?: string
  label?: string
}

// LV feeders: 400V cables radiating from each DT to customer connection points
export const LV_FEEDERS: LVFeeder[] = [
  // DT-AUZ-001 "Hameau des Fougères" — 3 feeders
  { id: 'LV-001-A', dt_id: 'DT-AUZ-001', name: 'Fougères Rue A', loading_pct: 62, coordinates: [[46.035, 2.485],[46.0358, 2.4862],[46.0362, 2.4868],[46.0368, 2.4874]] },
  { id: 'LV-001-B', dt_id: 'DT-AUZ-001', name: 'Fougères Rue B', loading_pct: 48, coordinates: [[46.035, 2.485],[46.0342, 2.4845],[46.0335, 2.4835],[46.033, 2.4828]] },
  { id: 'LV-001-C', dt_id: 'DT-AUZ-001', name: 'Fougères Impasse', loading_pct: 35, coordinates: [[46.035, 2.485],[46.0356, 2.4838],[46.0358, 2.4842]] },
  // DT-AUZ-002 "La Croix Blanche" — 2 feeders
  { id: 'LV-002-A', dt_id: 'DT-AUZ-002', name: 'Croix Blanche Rd', loading_pct: 55, coordinates: [[46.048, 2.478],[46.0488, 2.477],[46.0492, 2.4768],[46.0496, 2.4762]] },
  { id: 'LV-002-B', dt_id: 'DT-AUZ-002', name: 'Croix Blanche Lane', loading_pct: 40, coordinates: [[46.048, 2.478],[46.0474, 2.4788],[46.0475, 2.4792]] },
  // DT-AUZ-003 "Moulin Neuf" — 2 feeders
  { id: 'LV-003-A', dt_id: 'DT-AUZ-003', name: 'Moulin Farm Rd', loading_pct: 42, coordinates: [[46.055, 2.495],[46.0556, 2.4952],[46.0558, 2.4952],[46.056, 2.4958]] },
  { id: 'LV-003-B', dt_id: 'DT-AUZ-003', name: 'Moulin Village', loading_pct: 28, coordinates: [[46.055, 2.495],[46.0546, 2.4964],[46.0545, 2.4968]] },
  // DT-AUZ-004 "Zone Industrielle Est" — 1 feeder (industrial)
  { id: 'LV-004-A', dt_id: 'DT-AUZ-004', name: 'ZI Est Service', loading_pct: 91, coordinates: [[46.022, 2.515],[46.0222, 2.5152],[46.0225, 2.5155],[46.0228, 2.5158]] },
  // DT-AUZ-005 "Ferme Solaire Bois-Rond" — 2 feeders (CRITICAL overloaded)
  { id: 'LV-005-A', dt_id: 'DT-AUZ-005', name: 'Bois-Rond Farm Rd', loading_pct: 112, coordinates: [[46.018, 2.535],[46.0185, 2.5358],[46.0188, 2.5362],[46.019, 2.5368]] },
  { id: 'LV-005-B', dt_id: 'DT-AUZ-005', name: 'Bois-Rond BESS Spur', loading_pct: 98, coordinates: [[46.018, 2.535],[46.0174, 2.5344],[46.0172, 2.5345]] },
]

// ─── Demo Network: 250 kVA 3-Branch Reference LV Grid ────────────────────────
// 3 branches (A, B, C), 65 households, EV stress scenario on Branch B

export interface DERDevice {
  type: 'SOLAR_PV' | 'BESS' | 'EV_CHARGER' | 'HEAT_PUMP'
  capacity_kw: number
  current_kw: number   // negative = generating
  soc_pct?: number
}

export interface ProsumerHome {
  id: string
  label: string
  ders: DERDevice[]
  net_kw: number       // net at meter (negative = net export)
}

export interface LVBranchDef {
  id: string
  phase: 'A' | 'B' | 'C'
  households: number
  length_m: number
  base_load_kw: number
  ev_load_kw: number   // extra EV demand in surge scenario (0 = normal)
  r_ohm: number
  x_ohm: number
  ampacity_a: number
}

export interface SPGGroup {
  id: string
  name: string
  branch_id: string
  prosumer_homes: ProsumerHome[]
  consumer_count: number
  consumer_aggregate_kw: number
}

export interface EVChargerDef {
  id: string
  label: string
  branch_id: string
  kw: number
}

export const DEMO_DT = {
  id: 'DT-AUZ-001',
  name: 'Auzances LV Substation',
  capacity_kva: 250,
  thermal_limit_kw: 225,  // 250 kVA × 0.9 pf
  hv_voltage_kv: 20,
  lv_voltage_v: 400,
  lv_phase_v: 220,
  lat: 46.0205,
  lng: 2.4895,
}

export const LV_BRANCHES_DEMO: LVBranchDef[] = [
  {
    id: 'BR-A', phase: 'A', households: 21, length_m: 461,
    base_load_kw: 98, ev_load_kw: 0,
    r_ohm: 0.461 * 0.25, x_ohm: 0.461 * 0.08, ampacity_a: 300,
  },
  {
    id: 'BR-B', phase: 'B', households: 34, length_m: 715,
    base_load_kw: 129, ev_load_kw: 350,  // 3 EVs: 120+110+120 kW
    r_ohm: 0.715 * 0.25, x_ohm: 0.715 * 0.08, ampacity_a: 300,
  },
  {
    id: 'BR-C', phase: 'C', households: 10, length_m: 185,
    base_load_kw: 68, ev_load_kw: 0,
    r_ohm: 0.185 * 0.25, x_ohm: 0.185 * 0.08, ampacity_a: 200,
  },
]

export const EV_CHARGERS_DEMO: EVChargerDef[] = [
  { id: 'EVC-B01', label: 'Chemin des Acacias 1', branch_id: 'BR-B', kw: 120 },
  { id: 'EVC-B02', label: 'Rue de Bellevue 2',    branch_id: 'BR-B', kw: 110 },
  { id: 'EVC-B03', label: 'Hameau du Gué 8',      branch_id: 'BR-B', kw: 120 },
]

export const SPG_GROUPS: SPGGroup[] = [
  {
    id: 'SPG-A', name: 'Vendée Flex — Phase A', branch_id: 'BR-A',
    consumer_count: 13, consumer_aggregate_kw: 60,
    prosumer_homes: [
      { id: 'H-A01', label: 'Rue des Lilas 12',      net_kw: -1.8, ders: [{ type: 'SOLAR_PV', capacity_kw: 3, current_kw: -3.2 }, { type: 'BESS', capacity_kw: 5, current_kw: 1.4, soc_pct: 48 }] },
      { id: 'H-A02', label: 'Rue des Lilas 14',      net_kw: -2.4, ders: [{ type: 'SOLAR_PV', capacity_kw: 4, current_kw: -2.4 }] },
      { id: 'H-A03', label: 'Impasse du Moulin 3',   net_kw: -0.8, ders: [{ type: 'SOLAR_PV', capacity_kw: 3.6, current_kw: -2.0 }, { type: 'HEAT_PUMP', capacity_kw: 2, current_kw: 1.2 }] },
      { id: 'H-A04', label: 'Route de Genouillé 7',  net_kw: -1.2, ders: [{ type: 'SOLAR_PV', capacity_kw: 3, current_kw: -1.2 }] },
      { id: 'H-A05', label: 'Route de Genouillé 9',  net_kw: -2.1, ders: [{ type: 'SOLAR_PV', capacity_kw: 3.5, current_kw: -3.5 }, { type: 'BESS', capacity_kw: 5, current_kw: 1.4, soc_pct: 62 }] },
      { id: 'H-A06', label: 'Les Fougères 2',        net_kw: -2.8, ders: [{ type: 'SOLAR_PV', capacity_kw: 4.2, current_kw: -2.8 }] },
      { id: 'H-A07', label: 'Les Fougères 4',        net_kw:  1.6, ders: [{ type: 'SOLAR_PV', capacity_kw: 3, current_kw: -1.8 }, { type: 'HEAT_PUMP', capacity_kw: 2, current_kw: 1.8 }, { type: 'EV_CHARGER', capacity_kw: 7.4, current_kw: 1.6 }] },
      { id: 'H-A08', label: 'Les Fougères 6',        net_kw: -2.2, ders: [{ type: 'SOLAR_PV', capacity_kw: 3.8, current_kw: -2.2 }] },
    ],
  },
  {
    id: 'SPG-B', name: 'Vendée Flex — Phase B', branch_id: 'BR-B',
    consumer_count: 22, consumer_aggregate_kw: 79,
    prosumer_homes: [
      { id: 'H-B01', label: 'Avenue de la Gare 4',  net_kw: -1.6, ders: [{ type: 'SOLAR_PV', capacity_kw: 3.5, current_kw: -3.5 }, { type: 'BESS', capacity_kw: 10, current_kw: 1.9, soc_pct: 32 }] },
      { id: 'H-B02', label: 'Avenue de la Gare 6',  net_kw: -2.0, ders: [{ type: 'SOLAR_PV', capacity_kw: 4, current_kw: -4.0 }, { type: 'BESS', capacity_kw: 5, current_kw: 2.0, soc_pct: 55 }] },
      { id: 'H-B03', label: 'Avenue de la Gare 8',  net_kw: -1.8, ders: [{ type: 'SOLAR_PV', capacity_kw: 3.2, current_kw: -1.8 }] },
      { id: 'H-B04', label: 'Chemin des Acacias 1', net_kw: 96.5, ders: [{ type: 'SOLAR_PV', capacity_kw: 3.5, current_kw: -3.5 }, { type: 'EV_CHARGER', capacity_kw: 150, current_kw: 100 }] },
      { id: 'H-B05', label: 'Chemin des Acacias 3', net_kw: -1.2, ders: [{ type: 'SOLAR_PV', capacity_kw: 3.0, current_kw: -1.2 }] },
      { id: 'H-B06', label: 'Chemin des Acacias 5', net_kw: -2.4, ders: [{ type: 'SOLAR_PV', capacity_kw: 4.0, current_kw: -2.4 }, { type: 'HEAT_PUMP', capacity_kw: 2, current_kw: 0 }] },
      { id: 'H-B07', label: 'Rue de Bellevue 2',    net_kw: 108.0,ders: [{ type: 'SOLAR_PV', capacity_kw: 2, current_kw: -2 }, { type: 'EV_CHARGER', capacity_kw: 150, current_kw: 110 }] },
      { id: 'H-B08', label: 'Rue de Bellevue 4',    net_kw: -1.8, ders: [{ type: 'SOLAR_PV', capacity_kw: 3.5, current_kw: -3.5 }, { type: 'BESS', capacity_kw: 10, current_kw: 1.7, soc_pct: 28 }] },
      { id: 'H-B09', label: 'Rue de Bellevue 6',    net_kw: -1.4, ders: [{ type: 'SOLAR_PV', capacity_kw: 3.0, current_kw: -1.4 }] },
      { id: 'H-B10', label: 'Hameau du Gué 8',      net_kw: 116.0,ders: [{ type: 'SOLAR_PV', capacity_kw: 4, current_kw: -4 }, { type: 'EV_CHARGER', capacity_kw: 150, current_kw: 120 }] },
      { id: 'H-B11', label: 'Hameau du Gué 10',     net_kw: -3.0, ders: [{ type: 'SOLAR_PV', capacity_kw: 4.5, current_kw: -4.5 }, { type: 'BESS', capacity_kw: 10, current_kw: 1.5, soc_pct: 41 }] },
      { id: 'H-B12', label: 'Hameau du Gué 12',     net_kw: -2.6, ders: [{ type: 'SOLAR_PV', capacity_kw: 3.8, current_kw: -2.6 }] },
    ],
  },
  {
    id: 'SPG-C', name: 'Vendée Flex — Phase C', branch_id: 'BR-C',
    consumer_count: 6, consumer_aggregate_kw: 40,
    prosumer_homes: [
      { id: 'H-C01', label: 'Route de Bourganeuf 3', net_kw: -1.8, ders: [{ type: 'SOLAR_PV', capacity_kw: 3, current_kw: -1.8 }] },
      { id: 'H-C02', label: 'Route de Bourganeuf 5', net_kw: -2.6, ders: [{ type: 'SOLAR_PV', capacity_kw: 3.5, current_kw: -3.5 }, { type: 'BESS', capacity_kw: 5, current_kw: 0.9, soc_pct: 71 }] },
      { id: 'H-C03', label: 'Route de Bourganeuf 7', net_kw: -0.6, ders: [{ type: 'SOLAR_PV', capacity_kw: 2.8, current_kw: -1.8 }, { type: 'HEAT_PUMP', capacity_kw: 2, current_kw: 1.2 }] },
      { id: 'H-C04', label: 'Rue du Château 1',      net_kw: -2.2, ders: [{ type: 'SOLAR_PV', capacity_kw: 4, current_kw: -2.2 }] },
    ],
  },
]

// LV connection points: customer terminals and DER host points on each feeder
export const LV_CONNECTION_POINTS: LVConnectionPoint[] = [
  // DT-AUZ-001 connections
  { id: 'CP-001-01', feeder_id: 'LV-001-A', dt_id: 'DT-AUZ-001', lat: 46.0362, lng: 2.4868, type: 'DER_HOST', der_id: 'AST-AUZ-001', label: 'Solar A' },
  { id: 'CP-001-02', feeder_id: 'LV-001-A', dt_id: 'DT-AUZ-001', lat: 46.0368, lng: 2.4874, type: 'RESIDENTIAL', label: 'House 1' },
  { id: 'CP-001-03', feeder_id: 'LV-001-B', dt_id: 'DT-AUZ-001', lat: 46.0335, lng: 2.4835, type: 'DER_HOST', der_id: 'AST-AUZ-002', label: 'Solar B' },
  { id: 'CP-001-04', feeder_id: 'LV-001-B', dt_id: 'DT-AUZ-001', lat: 46.033, lng: 2.4828, type: 'RESIDENTIAL', label: 'House 2' },
  { id: 'CP-001-05', feeder_id: 'LV-001-C', dt_id: 'DT-AUZ-001', lat: 46.0358, lng: 2.4842, type: 'DER_HOST', der_id: 'AST-AUZ-003', label: 'BESS' },
  // DT-AUZ-002 connections
  { id: 'CP-002-01', feeder_id: 'LV-002-A', dt_id: 'DT-AUZ-002', lat: 46.0492, lng: 2.4768, type: 'DER_HOST', der_id: 'AST-AUZ-004', label: 'Wind' },
  { id: 'CP-002-02', feeder_id: 'LV-002-A', dt_id: 'DT-AUZ-002', lat: 46.0496, lng: 2.4762, type: 'RESIDENTIAL', label: 'House 3' },
  { id: 'CP-002-03', feeder_id: 'LV-002-B', dt_id: 'DT-AUZ-002', lat: 46.0475, lng: 2.4792, type: 'DER_HOST', der_id: 'AST-AUZ-005', label: 'EV Hub' },
  // DT-AUZ-003 connections
  { id: 'CP-003-01', feeder_id: 'LV-003-A', dt_id: 'DT-AUZ-003', lat: 46.0558, lng: 2.4952, type: 'DER_HOST', der_id: 'AST-AUZ-006', label: 'Farm Solar' },
  { id: 'CP-003-02', feeder_id: 'LV-003-B', dt_id: 'DT-AUZ-003', lat: 46.0545, lng: 2.4968, type: 'DER_HOST', der_id: 'AST-AUZ-007', label: 'Agri DSR' },
  // DT-AUZ-004 connections
  { id: 'CP-004-01', feeder_id: 'LV-004-A', dt_id: 'DT-AUZ-004', lat: 46.0225, lng: 2.5155, type: 'DER_HOST', der_id: 'AST-AUZ-008', label: 'ZI Industrial' },
  { id: 'CP-004-02', feeder_id: 'LV-004-A', dt_id: 'DT-AUZ-004', lat: 46.0228, lng: 2.5158, type: 'COMMERCIAL', label: 'Office A' },
  // DT-AUZ-005 connections
  { id: 'CP-005-01', feeder_id: 'LV-005-A', dt_id: 'DT-AUZ-005', lat: 46.0188, lng: 2.5362, type: 'DER_HOST', der_id: 'AST-AUZ-009', label: 'Solar Farm' },
  { id: 'CP-005-02', feeder_id: 'LV-005-B', dt_id: 'DT-AUZ-005', lat: 46.0172, lng: 2.5345, type: 'DER_HOST', der_id: 'AST-AUZ-010', label: 'BESS' },
]
