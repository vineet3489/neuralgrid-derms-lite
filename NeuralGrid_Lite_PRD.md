# NeuralGrid DERMS Lite — Product Requirements Document

**Version:** 1.0
**Date:** March 2026
**Prepared by:** L&T Smart Grid Division
**Status:** Demo / MVP

---

## 1. Executive Summary

NeuralGrid DERMS Lite is a focused demonstration platform for L&T's DER Integration Middleware (DERIM) product. It models a real 400V LV distribution network in the Auzance region of France (EDF Réseau territory) and demonstrates the end-to-end workflow an operator follows to manage distributed energy resources: from detecting a network constraint on the GIS map, through running a physics-based power flow, generating an IEC-standard operating envelope, exchanging protocol messages with a DER aggregator, and monitoring the resulting curtailment performance.

The lite version is purpose-built for **client demonstrations and proof-of-concept engagements**. It strips away the full platform's multi-deployment, multi-role complexity and focuses on the five operator actions that matter most in a DSO constraint-management scenario.

---

## 2. Background and Context

### 2.1 Problem Statement

Distribution System Operators (DSOs) face a growing challenge: solar panels, batteries, and EV chargers are being connected to low-voltage (400V) networks that were designed for one-way power flow. At peak solar generation, reverse power flow raises bus voltages above statutory limits (>1.05 pu under ESQCR 2002 / French equivalents). DSOs lack real-time visibility below the distribution transformer — the LV network is a blind spot for existing SCADA/ADMS systems.

DER aggregators (Service Providing Groups / SPGs) manage portfolios of these assets but receive no physics-based guidance on how much each asset can safely export. Without operating envelopes, aggregators either over-curtail (wasting renewable generation) or under-curtail (causing voltage violations).

### 2.2 Solution

DERIM (DER Integration Middleware) extends DSO visibility below the DT, runs a DistFlow power flow solver on the 400V network, and automatically generates per-asset, per-30-minute-slot Operating Envelopes in the IEC 62746-4 CIM format. These are published to aggregators via a standardised protocol. Aggregator responses (baseline nominations, flex offers, telemetry, performance reports) flow back through the same protocol and are recorded for settlement.

### 2.3 Target Audience for this Demo

| Audience | Primary Interest |
|---|---|
| DSO planning / operations teams | LV visibility, voltage management, operator workflow |
| DER aggregators / SPGs | How OE limits are computed, message format, settlement evidence |
| Utility CIOs / innovation teams | Platform architecture, standards compliance, integration footprint |
| Regulators / Ofgem / CRE | Audit trail, settlement evidence, performance measurement |

---

## 3. Demo Scope

### 3.1 In Scope

- LV network visualisation on a live map (GIS layer with real OpenStreetMap / CartoDB / ESRI base layers)
- DistFlow power flow solver for the 400V network below each distribution transformer
- Dynamic Operating Envelope generation (IEC 62746-4 CIM format, 48-slot rolling window)
- D4G protocol message exchange simulation (full 8-message lifecycle)
- 48-hour forecast with original vs OE-adjusted comparison
- Net DT loading chart (before vs after dispatch — key decision-support view)
- DER availability and opt-out history

### 3.2 Out of Scope (Lite)

- Multi-aggregator merit-order dispatch
- Real-time WebSocket connections to physical SCADA
- Alembic database migrations (demo uses shared PostgreSQL or SQLite fallback)
- User role management and deployment configuration

---

## 4. Network Model — Auzance Synthetic Network

The demo uses a synthetic but geographically anchored French HV/MV/LV network centred on the Auzance region (Vendée, France).

### 4.1 Network Hierarchy

```
HV Substation — Poste Source Auzance (63 kV, 25 MVA)
    │
    ├── HTA-NORD circuit (20 kV, 45% loading)
    │       └── DT-AUZ-001  Bois Blanc   (250 kVA, NORMAL 58%)
    │           DT-AUZ-002  La Croix Blanche (315 kVA, NORMAL 42%)
    │           DT-AUZ-003  Moulin du Vent   (200 kVA, NORMAL 35%)
    │
    └── HTA-EST circuit (20 kV, 78% loading)
            └── DT-AUZ-004  Fougères       (500 kVA, WARNING 91%)
                DT-AUZ-005  Bois-Rond      (400 kVA, CRITICAL 104%)
```

### 4.2 DER Fleet

| Asset | Type | DT | Capacity | Current Output |
|---|---|---|---|---|
| Community Solar A | Solar PV | DT-AUZ-001 | 80 kWp | −72 kW |
| Community Solar B | Solar PV | DT-AUZ-001 | 60 kWp | −54 kW |
| Croix Blanche Wind | Wind | DT-AUZ-002 | 150 kW | −38 kW |
| EV Hub CB | EV Charger | DT-AUZ-002 | 120 kW | +45 kW |
| Moulin Farm Solar | Solar PV | DT-AUZ-003 | 45 kWp | −28 kW |
| Moulin Agri DSR | Industrial DSR | DT-AUZ-003 | 200 kW | +85 kW |
| Fougères BESS | Battery | DT-AUZ-004 | 120 kW | −95 kW |
| ZI Est Industrial | Industrial DSR | DT-AUZ-004 | 500 kW | +310 kW |
| Bois-Rond Solar Farm | Solar PV | DT-AUZ-005 | 250 kWp | −285.6 kW |
| Bois-Rond BESS | Battery | DT-AUZ-005 | 120 kW | −142.8 kW |

**DT-AUZ-005 is the constraint DT** — combined solar + BESS reverse flow of 428.4 kW on a 400 kVA transformer running at 104% loading. This is the primary scenario the demo walks through.

### 4.3 LV Network

- 11 LV feeders (400V, dashed polylines on map, colour-coded by loading)
- 15 LV connection points (DER_HOST, RESIDENTIAL, COMMERCIAL)
- Feeder loading: red ≥100%, amber ≥75%, grey otherwise

---

## 5. Feature Requirements

### 5.1 Screen 1 — Grid Network (GIS Map)

**Purpose:** Operator's first-look view. Identifies where the stress is without navigating away.

| Requirement | Detail |
|---|---|
| Base layer switcher | OSM Humanitarian, CartoDB Dark (default), CartoDB Light, ESRI Satellite |
| Layer toggles | HV Substation, HTA Circuits (MV), LV Feeders (400V), Distribution Transformers, DER Assets, Connection Points, Uploaded GIS |
| DT markers | Circle, colour-coded: green=NORMAL, amber=WARNING, red=CRITICAL |
| DER markers | Circle, radius scales with capacity (√capacity / 1.8, clamped 5–14px) |
| LV feeders | Dashed polylines, red/amber/grey by loading |
| LV connection points | Small circles: indigo=DER_HOST, amber=COMMERCIAL, grey=RESIDENTIAL |
| GIS upload | GeoJSON file upload, rendered as additional overlay layer |
| Right panel — fleet | DER fleet by type (progress bars), HTA circuit loading, DT summary list |
| Right panel — DT detail | On DT click: loading bar, voltage, connected DERs, action buttons (Run Power Flow, Generate OE) |
| Constraint alert banner | Floating banner when any DT is CRITICAL or WARNING |
| Status bar | Generation kW, load kW, net balance, violations count, LV feeder overloaded count |
| DT selection persistence | Selected DT written to `localStorage['lite_selected_dt']`, pre-loaded on Power Flow and OE pages |

### 5.2 Screen 2 — LV Power Flow

**Purpose:** Physics-based diagnosis of a constrained DT. Computes bus voltages and identifies violations.

| Requirement | Detail |
|---|---|
| DT selector | Dropdown pre-loaded from localStorage selection |
| Run Power Flow | Calls `POST /api/lv-network/{dtId}/power-flow`; falls back to synthetic data in 1.5s if API unavailable |
| Solver | DistFlow backward-forward sweep (Baran & Wu 1989), O(n) for radial LV networks |
| Results — summary cards | Converged status, Generation kW, Load kW, Losses kW, Loss % |
| Results — voltage profile | Bar chart, one bar per bus, colour: green=0.95–1.05 pu, amber=±5–10%, red=outside ±10% |
| Results — violations table | Bus name, voltage (pu), status badge (HIGH_VOLTAGE / LOW_VOLTAGE) |
| Results — network topology | SVG tree: HV SS → HTA Circuit → DT → LV Buses (voltage coloured) → DER nodes |
| DT-AUZ-005 scenario | Hardcoded CRITICAL result: 3 buses all >1.08 pu, 428.4 kW reverse flow |
| Other DTs | Synthetic clean result: voltages 0.972–1.03 pu, no violations |
| Navigate to OE | Saves selected DT to localStorage; operator uses nav to proceed to Operating Envelope |

### 5.3 Screen 3 — Operating Envelope

**Purpose:** Generate and publish the IEC 62746-4 CIM Operating Envelope document. Central workflow screen.

| Requirement | Detail |
|---|---|
| DT selector | Pre-loaded from localStorage |
| Date/time range | Date picker + start/end time for OE window (default: today, 00:00–23:30) |
| Generate OE | Produces 48 half-hourly slots using DistFlow results (or conservative DOE limits if no power flow) |
| OE document format | `ReferenceEnergyCurveOperatingEnvelope_MarketDocument`, type A44, process Z01, IEC 62746-4 |
| Per-slot fields | position, quantity_Minimum (import cap kW), quantity_Maximum (export cap kW), qualityCode A06 |
| DT-AUZ-005 limits | Export cap 100–120 kW (constrained, below DOE limit), import cap 30–50 kW |
| Rolling OE timeline chart | ComposedChart: past 6h actuals (orange line) overlaid on export cap (green area) and import cap (blue area), "Now" reference line, updates every 30-min cycle |
| 48-slot table | Scrollable, import/export values with inline bar visualisation |
| Copy / View JSON | Copy to clipboard + raw JSON viewer (collapsible) |
| D4G endpoint config | URL input + protocol selector (IEC 62746-4 / IEEE 2030.5 / OpenADR 2.0b) |
| Send to D4G | POST simulation: 1.5s loading animation → D4G response panel |
| D4G response | DER availability table: asset name, available capacity, current generation, committed curtailment |
| Response summary | Available flex kW, current gen kW, committed curtailment kW |

**OE Cycle (continuous, production behaviour):**

Every 30 minutes the scheduler triggers automatically:
- T+0: DistFlow runs for all 96 slots (48h horizon)
- T+11s: DOE limits computed per DER per slot
- T+14s: OE document published to all enrolled aggregators (Kafka or REST POST)
- T+20–90s: Aggregators send ACK + FlexOffer
- T+90s: DERIM validates; exceedances flagged
- T+30min: New cycle — horizon shifts forward one slot

### 5.4 Screen 4 — D4G Messages

**Purpose:** Full audit trail and lifecycle visibility of the DSO ↔ aggregator message exchange.

#### 5.4.1 Thread Tab (static reference)

| Message | Direction | Type | Summary |
|---|---|---|---|
| 1. Operating Envelope | DSO → D4G | OperatingEnvelope_MarketDocument | OE sent · 48 slots · export cap 120 kW |
| 2. Baseline Report | D4G → DSO | BaselineNotification_MarketDocument | Solar 285.6 kW · BESS 142.8 kW |
| 3. Flex Availability | D4G → DSO | FlexOffer_MarketDocument (IEC 62325-301) | 240 kW available · Solar curtail 165 kW · BESS 75 kW |
| 4. Acknowledgement | D4G → DSO | DERGroupStatus_MarketDocument | All assets notified · Curtailment starts 11:00 |
| 5. Telemetry 11:00 | D4G → DSO | Telemetry_15min | Solar 118.4 kW ✓ · Voltage 1.091→1.052 pu |
| 6. Telemetry 11:15 | D4G → DSO | Telemetry_15min | Solar 121.8 kW (marginally over by 1.8 kW) |
| 7. Performance Report | D4G → DSO | PerformanceReport_MarketDocument | 96.4% delivery · 144.2 kWh curtailed |
| 8. Settlement ACK | DSO → D4G | SettlementAck_MarketDocument | Payment confirmed · No penalty |

- All messages expandable to full JSON payload (syntax-highlighted)
- Lifecycle progress indicator (colour-coded dots: OE → Baseline → Flex → ACK → Telemetry → Performance → Settlement)
- Message colour coding: indigo = DSO outbound, teal = aggregator inbound, grey = telemetry

#### 5.4.2 Live Sim Tab

| Requirement | Detail |
|---|---|
| Start Simulation | Plays through all 8 messages with realistic per-message delays |
| Per-message delays | OE sent: 400ms · Baseline: 1.2s · FlexOffer: 800ms · ACK: 600ms · Telemetry ×2: 2s, 1.5s · Performance: 2.5s · Settlement ACK: 800ms |
| In-flight indicator | "Sending…" / "Awaiting…" spinner with message name between arrivals |
| Live timestamps | Each message stamped with actual clock time it appeared |
| SENT / RECEIVED badge | Green badge on each arrived message |
| Expandable payloads | Same JSON viewer as Thread tab |
| Completion banner | "Lifecycle complete — all 8 messages exchanged" |
| Reset / Replay | Clear feed and restart from MSG-001 |

#### 5.4.3 Performance Tab

| Requirement | Detail |
|---|---|
| KPI cards | Delivery % (96.4%), Curtailed kWh (144.2), Committed kWh (149.6), Penalty (None) |
| Half-hourly delivery chart | Bar chart: committed vs delivered per 30-min slot (11:00–17:00) |
| Voltage recovery chart | DT-AUZ-005 secondary voltage (pu) per slot — target 0.95–1.05 pu |
| Per-asset table | Bois-Rond Solar + BESS: committed kWh, delivered kWh, delivery %, status |

**Performance Ratio thresholds (per DERIM settlement rules):**
- ≥ 95%: Full payment
- 75–95%: Pro-rata payment
- < 75%: Penalty clause triggered

### 5.5 Screen 5 — Forecasting

**Purpose:** 48-hour forward view with original vs OE-adjusted comparison. Decision support for the operator before approving a dispatch.

| Requirement | Detail |
|---|---|
| Summary cards | Curtailment Applied (kW + %), OE Active Window (11:00–17:00, voltage improvement), BESS Grid Draw Shift (+18 kW during OE window) |
| **Net DT Loading chart** | 48h ComposedChart · Red dashed line = net feeder load before flex (Load − Solar) · Green area = net after OE dispatch · Red shaded bands = thermal/reverse-flow danger zones · DT forward limit 360 kW · DT reverse limit −130 kW · "Now" reference line |
| Violation summary | Count of slots in breach before/after dispatch, peak reverse flow values |
| 14-day historical chart | Daily peak solar, load, flex dispatched (bar + line ComposedChart) |
| Solar forecast | AreaChart: original (blue dashed) vs OE-constrained (amber), 48 slots |
| Load forecast | AreaChart: original vs adjusted (adjusted +18 kW during OE window due to BESS shift from local solar to grid import) |
| Flex forecast | AreaChart: original vs post-OE available flex |
| DER opt-out heatmap | 10 DERs × 14 days, colour-coded: green=AVAILABLE, red=OPT_OUT, amber=CURTAILED, grey=OFFLINE |
| Refresh / Recalculate | Triggers new synthetic data generation |

**BESS Load Shift Explanation:** When solar is curtailed under the OE, the BESS can no longer charge from local excess solar generation. It must draw from the grid instead. This increases net feeder import by ~18 kW during the OE window — visible as the "Adjusted Load" line running above the "Original Load" line.

---

## 6. Technical Architecture

### 6.1 Frontend

| Component | Technology |
|---|---|
| Framework | React 18 + TypeScript |
| Build tool | Vite (port 5174 for lite, 5173 for full version) |
| Styling | Tailwind CSS (dark theme, gray-950 base) |
| Charts | Recharts (AreaChart, ComposedChart, BarChart) |
| Map | Leaflet + react-leaflet |
| State | Zustand (auth, grid alerts) + localStorage (DT selection persistence) |
| HTTP client | Axios (custom `api` client with fallback synthetic data) |

### 6.2 Backend

| Component | Technology |
|---|---|
| Framework | FastAPI (Python 3.12) |
| ORM | SQLAlchemy 2.0 async + asyncpg |
| Database | PostgreSQL (shared with full NeuralGrid instance on Render) |
| Auth | JWT (python-jose) + bcrypt |
| Container | Docker (Dockerfile in repo root) |

### 6.3 Deployment

| Service | Platform | URL |
|---|---|---|
| Frontend | Render Static Site | `neuralgrid-lite-frontend.onrender.com` |
| Backend | Render Web Service (Docker, Starter plan) | `neuralgrid-lite-backend.onrender.com` |
| Database | Shared — existing `neuralgrid-db` PostgreSQL | Internal URL set manually via Render dashboard |

**Render Blueprint:** `render.yaml` — Blueprint-managed, deploys both services from `vineet3489/neuralgrid-derms-lite` main branch on every push.

**Environment variables:**

| Variable | Service | Value |
|---|---|---|
| `DATABASE_URL` | Backend | Paste Internal DB URL from `neuralgrid-db` — `sync: false` |
| `SECRET_KEY` | Backend | Auto-generated by Render |
| `ALLOWED_ORIGINS` | Backend | `https://neuralgrid-lite-frontend.onrender.com` |
| `VITE_API_URL` | Frontend | `https://neuralgrid-lite-backend.onrender.com` |

---

## 7. Standards and Protocol Compliance

| Standard | Usage in Platform |
|---|---|
| IEC 62746-4 | `ReferenceEnergyCurveOperatingEnvelope_MarketDocument` (type A44) — OE published to aggregator |
| IEC 62325-301 | `ReserveBidMarketDocument` (type A26) — FlexOffer from aggregator to DSO |
| IEC 62325-301 | `PerformanceReport_MarketDocument` — settlement evidence |
| IEC 62325-301 | `SettlementAck_MarketDocument` — DSO confirms payment |
| DistFlow (Baran & Wu 1989) | Backward-forward sweep power flow solver for radial LV networks |
| ESQCR 2002 (UK) / French equivalent | Statutory voltage limits: 0.95–1.05 pu (230V nominal at LV) |

### 7.1 IEC 62746-4 Document Structure

```json
{
  "ReferenceEnergyCurveOperatingEnvelope_MarketDocument": {
    "mRID": "OE-DT-AUZ-005-{timestamp}",
    "type": "A44",
    "process.processType": "Z01",
    "sender_MarketParticipant.mRID": "neuralgrid-derms",
    "receiver_MarketParticipant.mRID": "d4g-aggregator-001",
    "Series": [{
      "businessType": "A96",
      "Period": {
        "resolution": "PT30M",
        "Point": [
          { "position": 1, "quantity_Minimum": -50.0, "quantity_Maximum": 120.0, "qualityCode": "A06" },
          ...
        ]
      }
    }]
  }
}
```

---

## 8. Key Operator Workflow (Demo Script)

The following is the primary demo flow — from constraint detection to performance verification.

### Step 1 — Detect the Constraint (Grid Network)
1. Operator opens the GIS map. DT-AUZ-005 (Bois-Rond) appears **red** — CRITICAL, 104% loading.
2. HTA-EST circuit shows amber (78% loading).
3. Operator clicks DT-AUZ-005 — right panel shows 2 DERs (428.4 kW combined reverse flow), voltage rising.
4. Operator presses **Run Power Flow** from the DT detail panel.

### Step 2 — Diagnose the Voltage (Power Flow)
1. DistFlow solves for DT-AUZ-005: 3 buses above 1.08 pu (statutory limit 1.05 pu).
2. Voltage profile chart shows all three DER buses in red.
3. Violation table lists BUS-001 (1.082), BUS-002 (1.091), BUS-003 (1.088).
4. Network topology SVG confirms the reverse-flow path.
5. Operator navigates to **Operating Envelope**.

### Step 3 — Generate and Send OE (Operating Envelope)
1. DT-AUZ-005 is pre-selected. Operator clicks **Generate OE Document**.
2. 48-slot schedule generates: export cap ~120 kW (was 250 kWp capacity), import cap ~50 kW.
3. Rolling OE timeline chart shows the constraint window (11:00–17:00) clearly.
4. Operator reviews JSON → clicks **Send to D4G →**.
5. D4G responds with DER status: Solar will curtail to 120 kW (−165.6 kW), BESS to 120 kW (−22.8 kW).

### Step 4 — Watch the Message Exchange (D4G Messages → Live Sim)
1. Operator clicks **Live Sim** tab → **Start Simulation**.
2. Messages appear in sequence: OE Sent → Baseline Report → Flex Offer → ACK → Telemetry → Performance → Settlement.
3. Each message arrives with real timestamp and expandable JSON payload.
4. Telemetry at 11:15 shows Solar marginally over by 1.8 kW — flagged in summary.
5. Performance report: 96.4% delivery, 144.2 kWh curtailed, no penalty.

### Step 5 — Verify the Outcome (Forecasting)
1. **Net DT Loading chart**: red dashed line (before dispatch) dips below −130 kW reverse-flow limit during midday. Green area (after OE) stays within bounds.
2. Operator can see how many violation slots were resolved.
3. Solar forecast shows curtailment window visible (OE constrained, 11:00–17:00).
4. BESS shift: load increases +18 kW during window (draws from grid as local solar is curtailed).
5. DER opt-out heatmap shows Bois-Rond Solar and BESS were CURTAILED on days with high solar irradiance.

---

## 9. Glossary

| Term | Definition |
|---|---|
| OE (Operating Envelope) | Time-varying MW limit (import and export) per DER per 30-min slot, computed from DistFlow |
| DOE (Dynamic OE) | OE recalculated every 30 min from physics-based DistFlow (vs static asset limits) |
| DT (Distribution Transformer) | 20kV/400V transformer; boundary of ADMS visibility. DERIM's domain is below the DT |
| HTA | Haute Tension A — French designation for 20kV MV circuits |
| DistFlow | Baran & Wu 1989 backward-forward sweep power flow algorithm for radial LV networks |
| D4G | DER Aggregator (Service Providing Group / SPG) — manages a portfolio of DERs |
| CMZ | Constraint Management Zone — geographic cluster of DTs managed together for OE purposes |
| IEC 62746-4 | CIM standard for Reference Energy Curve Operating Envelope Market Documents |
| IEC 62325-301 | CIM standard for electricity market documents (FlexOffer, PerformanceReport, Settlement) |
| p.u. (per unit) | Voltage as fraction of nominal (1.0 pu = 230V at LV). Limits: 0.95–1.05 pu |
| BaselineNomination | Message from aggregator 24h ahead stating expected DER output per slot |
| FlexOffer | Aggregator's response to OE — how much MW it can curtail and at what price |
| Performance Ratio | actual_MW_delivered / requested_MW. ≥0.95 = full payment; <0.75 = penalty |
| BESS | Battery Energy Storage System |
| DSR | Demand Side Response — industrial load that reduces consumption on request |

---

## 10. Roadmap — From Demo to Production

| Phase | Capability | Timeline |
|---|---|---|
| **Demo (current)** | Synthetic Auzance network, DistFlow simulation, IEC message simulation, static OE | Done |
| **Phase 1 — Real data** | GIS import from Enedis OpenData or SSEN GIS, real AMI meter reads via MDM, live NWP weather API | Q2 2026 |
| **Phase 2 — Live protocol** | Real D4G endpoint connections (Kafka or REST), live ACK/FlexOffer processing, OE scheduler automation | Q3 2026 |
| **Phase 3 — Multi-aggregator** | Pro-rata and merit-order dispatch across 3–4 aggregators per CMZ, contract management, flex market integration | Q4 2026 |
| **Phase 4 — Settlement** | MDM actuals reconciliation, performance ratio calculation, invoice generation, Ofgem/CRE reporting | Q1 2027 |
| **Phase 5 — DaaS** | LV voltage telemetry API sold back to DSO SCADA/ADMS; OE headroom forecast as market product | Q2 2027 |

---

*Document prepared by L&T Smart Grid Division. Platform hosted at `neuralgrid-lite-frontend.onrender.com`. Source: `github.com/vineet3489/neuralgrid-derms-lite`.*
