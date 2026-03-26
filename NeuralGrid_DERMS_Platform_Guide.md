# Neural Grid DERMS — Platform Screen Guide

**L&T Digital Energy Solutions**
Version 1.0 · March 2026

---

## What is Neural Grid DERMS?

Neural Grid DERMS (Distributed Energy Resource Management System) is a platform for Distribution System Operators (DSOs) and grid operators to:

- **See** what is happening on the LV distribution network in real time
- **Control** distributed energy resources (solar, batteries, EVs, industrial loads) within network limits
- **Contract** with aggregators for flexibility services
- **Settle** payments for those services
- **Communicate** operating envelopes and dispatch signals to aggregators using standard protocols (IEC 62746-4, IEEE 2030.5, OpenADR 2.0b)

The platform supports multiple regulatory contexts simultaneously — currently **SSEN (Scotland/Northern Isles)** under ENA-CPP-2024 / RIIO-ED2 and **PUVVNL (Varanasi, India)** under UPERC-DR-2025. Each is called a **Deployment**.

---

## Login

### What it shows
The entry point to the platform. Before authenticating, it tells you:

- **Which deployment you are connecting to** — select from the dropdown (e.g. SSEN — Scotland & Northern Isles, or PUVVNL — Varanasi Division). Each deployment has its own regulatory framework, currency, and timezone.
- **Backend status** — a green "Server is online" badge if the API is healthy, or an amber "Server is waking up" warning if the backend is cold-starting (common on free-tier cloud deployments after idle periods).
- **Demo credentials** — three accounts for demonstration:
  - **Super Admin** — full platform access across all deployments
  - **SSEN Grid Operator** — scoped to SSEN deployment, day-to-day operational access
  - **PUVVNL Grid Operator** — scoped to PUVVNL deployment

### What the operator does here
Select the deployment → enter credentials → sign in. On slow starts, progressive status messages keep the user informed rather than leaving them with a blank spinner.

---

## 1. Dashboard

**Navigation:** Dashboard

### What it shows
The **real-time operational picture** of the selected grid deployment. This is the first screen an operator sees after login — designed to answer "what is happening right now?" in under 10 seconds.

### KPI Cards (top row)
| Card | What it means |
|------|--------------|
| **Total Generation** | Combined output of all online DERs in kW, with solar penetration % |
| **Assets Online** | Count of active assets vs. curtailed vs. offline — quick view of fleet health |
| **Active Alerts** | Unacknowledged system alerts; red if any are CRITICAL |
| **Total Load** | Demand being served across the deployment |
| **Net Export / Import** | Whether the deployment is net exporting to the grid (positive) or drawing from it (negative) |

### Grid Health Panel
Shows the **top 6 network nodes** (feeders and distribution transformers) as mini loading bars:
- **Green** = loading below 75% — healthy
- **Amber** = 75–90% — approaching limit
- **Red** = above 90% — thermal risk

Below the bars, a **Constraint Violations table** lists any nodes or assets breaching their operating limits right now — feeder overloads, DOE export exceedances, etc. If the table is empty, a green "No constraint violations" tick is shown.

### Active Alerts Panel
Chronological list of unacknowledged alerts. Each alert has a severity badge (CRITICAL / WARNING / INFO) and an Acknowledge button. Acknowledging removes it from this panel and records the action in the audit log.

### What this screen is NOT for
Deep analysis, historical data, or dispatch — those have dedicated screens. The dashboard is a **status at a glance** screen.

---

## 2. Grid & Assets

**Navigation:** Grid & Assets

### Purpose
The **network and asset management** hub. Everything related to the physical network topology, the DERs connected to it, and the hosting capacity available for new connections.

This screen has five tabs:

---

### Tab 1 — GIS View
An interactive map showing the actual geographic location of:
- **Feeders** — the 11kV/33kV primary distribution lines
- **Distribution Transformers (DTs)** — the 11kV/400V step-down points
- **DER assets** — solar PV, battery systems, EV chargers, industrial loads

Clicking any map element opens a popup with real-time data (voltage, loading %, asset count, current kW). At zoom level 12+, clicking a DT shows a mini LV network diagram for that transformer.

The map uses OpenStreetMap data to position network elements geographically. This is what makes the platform "GIS-aware" — an operator can visually understand which assets are clustered together and how network topology relates to geography.

---

### Tab 2 — Asset Fleet
A tabular view of all registered DER assets. For each asset:
- Asset Ref, Name, Type (BESS, EV_CHARGER, SOLAR_PV, WIND_TURBINE, INDUSTRIAL_LOAD, etc.)
- Current kW (live telemetry) — positive = generating/exporting, negative = consuming/importing
- Capacity (kW / kWh for batteries)
- State of Charge % (for BESS)
- DOE export and import limits (the current operating envelope limits set by the DSO)
- Feeder and DT assignment (which part of the network this asset is connected to)
- Status: ONLINE / CURTAILED / OFFLINE

Operators use this to answer: "Which assets are curtailed and why? What is the real-time export from the Orkney wind fleet?"

---

### Tab 3 — LV Network & DERs
The **LV visibility layer** — the 400V network between a distribution transformer and the customer connection points. This is the part of the network that was historically invisible to DSOs.

**Left panel — DT list:**
All distribution transformers in the deployment, each showing:
- Loading % with colour-coded bar
- Number of DERs connected behind it
- Secondary voltage (nominal 230V)

Click any DT to load its detail.

**Centre panel — Selected DT:**
- Connected DERs table: lists every asset behind this DT with live output, capacity, type, status, SoC bar
- LV Power Flow results: after running DistFlow analysis — bus voltages, total loss kW, voltage violations

**Right slide-out — SSEN OE Messages:**
- Any Operating Envelope messages generated for this DT's control zone
- The full IEC 62746-4 `OperatingEnvelope_MarketDocument` JSON, ready to copy and forward to the aggregator
- Network topology rebuild controls (fetch fresh LV feeder geometry from OpenStreetMap)

**Why this matters:** Traditional DERMS stops at the 11kV level. This tab gives the operator visibility into the 400V feeder hosting the actual DERs — essential for identifying voltage violations that a feeder-level view would miss.

---

### Tab 4 — Hosting Capacity
Shows the **available headroom** on each feeder for new DER connections:

- Hosting capacity kW per feeder (how much more generation can be connected without constraint)
- Current loading vs. thermal limit
- A bar chart ranking feeders by available capacity

Used by planning teams to answer: "Where can we connect a new 500kW community battery?"

---

### Tab 5 — Grid Nodes
A table of all network nodes (feeders and DTs) with their raw technical parameters:
- Node ID, type (FEEDER / DISTRIBUTION_TRANSFORMER), name
- Current loading %, thermal limit kW
- Voltage magnitude
- Connected asset count

This is the raw data view — useful for engineers who need the numbers without the visualisation.

---

## 3. Flex Dispatch

**Navigation:** Flex Dispatch

### Purpose
The **day-to-day dispatch operations** screen. This is where an operator creates, monitors, and manages flex events — the instructions sent to aggregators to either curtail or increase DER output.

### What a Flex Event is
A Flex Event is a time-bounded instruction to a Control Management Zone (CMZ) to deliver a specific kW of flexibility. For example: "Between 16:00–17:30 today, reduce net export in the Lerwick South zone by 800 kW."

### Screen layout

**Active Events cards (top):**
Live cards for every currently dispatched or in-progress event showing:
- Event reference (e.g. `EVT-SSEN-0001`)
- Target kW vs. dispatched kW vs. delivered kW (with progress bars)
- Time elapsed / remaining
- CMZ (which geographic zone)

**All Events table (middle):**
Full history and queue — every event in every status:
- SCHEDULED → DISPATCHED → IN_PROGRESS → COMPLETED / CANCELLED

**Event Detail panel (right):**
Click any event to open:
- Key metrics (target, dispatched, delivered, delivery %)
- Timeline view
- AI-generated recommendation ("Based on current SoC levels, prioritise BESS dispatch before V2G…")
- Dispatch / Cancel buttons

### Creating an event
"+ New Event" opens a form:
- Event type (EMERGENCY / ECONOMIC / SCHEDULED / TEST)
- Target kW
- Start time, duration in minutes
- CMZ
- Notes

Once scheduled, the event appears in the table. The operator clicks "Dispatch" to send the signal, which triggers the OE message generation in the backend and publishes to Kafka.

---

## 4. Operator Console

**Navigation:** Operator Console

### Purpose
A **guided 5-step workflow** for the structured ADMS fault response and operating envelope generation process. This is the formal protocol an operator follows when the ADMS raises a fault or constraint, requiring an OE to be sent to aggregators.

Think of it as a checklist that turns a network event into a standardised communication.

### The 5 Steps

**Step 1 — Review ADMS Faults**
Current grid alerts (CRITICAL / WARNING) are displayed alongside a grid summary (total generation, load, curtailed assets). The operator reviews what triggered the workflow — e.g. a feeder overload alarm from the ADMS.

**Step 2 — Select CMZ and Time Window**
Choose which Control Management Zone is affected, set the start/end time for the OE. The CMZ defines which aggregators will receive the message.

**Step 3 — Run Power Flow**
Execute a DistFlow power flow analysis for the affected zone. Results show:
- Whether the flow converged
- Voltage at each bus (normal: 0.95–1.05 pu)
- Any voltage violations
- Total losses

This gives the operator the technical evidence to justify the OE constraints they're about to set.

**Step 4 — Generate Operating Envelope**
The platform generates the `ReferenceEnergyCurveOperatingEnvelope_MarketDocument` — a half-hourly table of:
- Import limit kW per slot
- Export limit kW per slot
- Quality code (A04 = measured, A06 = DistFlow calculated, A03 = estimated)

The operator sees this as both a human-readable table with colour bars and the raw IEC 62746-4 JSON. A Copy button allows manual forwarding.

**Step 5 — Send to Aggregator**
Dispatches the OE via:
- Kafka topic (`dso_operating_envelope`) — for aggregators with streaming integration
- REST endpoint — for aggregators polling via IEEE 2030.5 or OpenADR

The operator sees a confirmation and the event moves to DISPATCHED status.

---

## 5. Programs

**Navigation:** Programs

### Purpose
**Flexibility programs** are the commercial/regulatory frameworks under which flex services are procured. A program defines the rules of engagement — what type of service, what payment structure, what regulatory basis.

### What it shows

**Summary cards:**
- Total programs, enrolled MW, target MW (how close the operator is to their procurement target)

**Program cards:**
- Name (e.g. "SSEN Winter Flexibility 2025–26")
- Type: CAPACITY (firm capacity reservation), DEMAND_RESPONSE (dispatch-based), PEAK_SHAVING, VOLTAGE_SUPPORT, P2P_TRADING
- Status: ACTIVE / DRAFT / EXPIRED
- Enrolled vs. target capacity bar
- Start and end dates
- Regulatory basis (e.g. ENA-CPP-2024 Clause 7.3)

**Program detail modal:**
Click any program for KPIs:
- Events dispatched, total flex delivered (MWh), avg delivery %, cost per MWh, estimated savings
- List of enrolled assets/contracts

### Relationship to other screens
Programs → Contracts → Settlement forms a chain. A program sets the rules, contracts bind specific aggregators to those rules, and settlement calculates payments against those contracts.

---

## 6. Contracts

**Navigation:** Contracts

### Purpose
The **commercial agreements** between the DSO and each counterparty (aggregator). A contract specifies exactly what was agreed: which CMZ, what capacity, what payment rates, for how long.

### Contract types
| Type | What it means |
|------|--------------|
| AVAILABILITY | Aggregator is paid just to be ready — whether dispatched or not |
| UTILISATION | Aggregator is paid only for energy actually delivered |
| COMBINED | Availability payment + utilisation top-up |
| FLOOR | Minimum guaranteed payment regardless of dispatch |

### What the table shows
- Contract ref (e.g. `CTR-SSEN-001`)
- Associated program and counterparty
- CMZ (which zone this contract covers)
- Contracted capacity (kW)
- Availability rate (£/hour or ₹/hour in minor units)
- Utilisation rate (£/MWh or ₹/MWh)
- Contract period (start → end)
- Status: DRAFT → PENDING\_SIGNATURE → ACTIVE → EXPIRED

### Contract detail / settlement simulation
Expand any contract to see:
- Full rate schedule
- Run a "Simulate Settlement" — enter a date range and see estimated payments before the actual billing period closes

### Why contracts matter technically
The contract's payment rates and CMZ assignment drive the settlement calculation. When an event is dispatched in a CMZ, the platform looks up which contract covers that CMZ and uses its rates for the settlement statement.

---

## 7. Counterparties

**Navigation:** Counterparties

### Purpose
The **registry of all external entities** the DSO interacts with commercially — primarily aggregators, but also industrial flexibility providers, residential aggregators, generators, and storage operators.

### What it shows

**Counterparty cards:**
- Name and type badge (AGGREGATOR / INDUSTRIAL / GENERATOR / STORAGE / RESIDENTIAL)
- Portfolio capacity (kW) — total DER capacity this counterparty controls
- Communication capability: which protocols they support (IEC 62746-4, IEEE 2030.5, OpenADR 2.0b)
- Prequalification status: PREQUALIFIED / PENDING / NOT\_STARTED

**Prequalification checklist (detail modal):**
Six criteria a counterparty must pass before being awarded a contract:
1. Grid connection certificate
2. Insurance and indemnity documents
3. Technical specifications verified
4. Communication system tested
5. Site inspection completed
6. Regulatory compliance confirmed

Only PREQUALIFIED counterparties can be assigned to an active contract.

---

## 8. Settlement

**Navigation:** Settlement

### Purpose
The **financial closing** of the flex service cycle. After events are dispatched and completed, settlement calculates what each aggregator is owed (or penalised) for the billing period.

### Summary cards
- Pending approvals (DRAFT / PENDING\_APPROVAL statements awaiting sign-off)
- Total paid this year (across all PAID statements)
- Average delivery % (fleet-wide performance)

### Payment trend chart
A monthly bar chart showing net payments over the last 4–6 months alongside average delivery %. Gives a quick visual of spend trend and performance trend.

### Settlement statements table
One row per contract per billing period:
- Period (e.g. Nov 2025, Dec 2025)
- Contract ref and counterparty
- Status: DRAFT → PENDING\_APPROVAL → APPROVED → PAID
- Events count (how many flex events occurred in this period)
- Avg delivery % (how well the aggregator performed)
- Availability payment (£/₹)
- Utilisation payment (£/₹)
- Penalty (£/₹) — for events delivered below 80% of target
- **Net payment** = availability + utilisation − penalty

### Approval workflow
PROG\_MGR role or higher can click Approve on a DRAFT or PENDING\_APPROVAL statement, which:
- Stamps it with approver email and timestamp
- Logs to audit trail
- Moves it to APPROVED (ready for finance to action payment)

### Calculate Settlement
"+ Calculate" opens a form: select contract, billing period start/end → platform runs the settlement algorithm → creates a new DRAFT statement.

---

## 9. Forecasting

**Navigation:** Forecasting

### Purpose
**48-hour ahead forecasts** for the three key variables that determine how much flex headroom is available: solar generation, load demand, and flex availability.

### Forecast model selector
Choose from:
- **Bell Curve** (default — parametric model based on time-of-day, season, weather)
- **DMS/ADMS passthrough** — import forecast directly from the connected ADMS
- **ARIMA** — statistical time-series model
- **LSTM** — neural network model (higher accuracy, slower)

### Three forecast panels
Each panel shows a 48-hour area chart with:
- **Central forecast line** (expected value)
- **Confidence band** (shaded area — 90% confidence interval)
- Peak value and time
- Average confidence %

| Panel | What it means operationally |
|-------|-----------------------------|
| **Solar Generation** | How much PV output to expect — drives when export limits need to be tightened |
| **Load Demand** | Expected consumption — drives when import support may be needed |
| **Flex Availability** | How much controllable capacity is likely available for dispatch — drives how ambitious the operator can be with event targets |

### AI Forecast Narrative
A natural language summary generated from the forecast data: "Peak solar forecast of 1,240 kW expected at 13:30. Load demand peaks at 18:00 with 89% confidence. Flex availability is constrained in the afternoon window — recommend scheduling events before 15:00."

---

## 10. Optimization

**Navigation:** Optimization

### Purpose
**AI-assisted decision support** for three optimization problems: dispatch planning, operating envelope recalculation, and peer-to-peer market clearing.

### DR Dispatch Optimizer
Input: target kW, duration, event type, CMZ
Output:
- Achieved kW (what the optimizer can actually deliver from available assets)
- Asset dispatch table — which specific assets to dispatch, in what order, at what kW
- AI recommendation explaining the strategy

This helps the operator answer: "If I need 600 kW from the Lerwick South zone for 90 minutes, which assets do I use?"

### AI Recommendations panel
The platform continuously analyses the grid state and generates HIGH / MEDIUM / LOW priority recommendations:
- "Dispatch BESS fleet now — SoC is at 87%, forecast shows overnight load will be low"
- "Curtail rooftop solar in DT-SHET-002 zone — voltage rising above 1.04 pu"

### P2P Market Clearing
For deployments with peer-to-peer energy trading (relevant for PUVVNL):
- Input: run market clearing algorithm
- Output: cleared volume (kW), clearing price (₹/kWh), matched buyer-seller pairs visualised as a bar chart

### Operating Envelopes (DOEs)
Shows the current Dynamic Operating Envelope for each asset:
- DOE export max kW (how much this asset can export)
- DOE import max kW (how much this asset can import)
- Current kW (where it actually is right now)
- A "Recalculate DOEs" button reruns the DistFlow-based constraint calculation across the whole network

---

## 11. Reports

**Navigation:** Reports

### Purpose
**Regulatory reporting and performance analytics**. This screen is for management and compliance teams, not day-to-day operators.

### KPI cards
- Events dispatched this month
- Flex delivered (MWh) this month
- Average delivery %
- Settlement pending (£/₹)

### Monthly flex delivery chart
A 12-month bar chart of MWh delivered and event count — tracks whether the DSO is meeting its flexibility procurement targets.

### Top Performers chart
Horizontal bar chart ranking assets by delivery %. Identifies which aggregators are reliably delivering and which are underperforming.

### Regulatory Reports
A grid of regulatory report templates:

**SSEN (ENA-CPP-2024):**
- Annual DER Flexibility Report
- Constraint Management Zone Performance
- OE Protocol Compliance Summary
- Settlement Reconciliation Statement
- Network Constraint Events Log
- Carbon Reduction Impact Assessment

**PUVVNL (UPERC-DR-2025):**
- DR Programme Performance Report
- Distribution Network Constraint Report
- P2P Energy Trading Settlement Report
- Consumer Flexibility Participation Report
- Regulatory Compliance Certificate

Each report shows status (READY to export, PENDING data, or DRAFT). Click Download to get a PDF/CSV.

### Compliance Checklist
A visual checklist of regulatory compliance items for the active framework — green tick if satisfied, amber warning if action needed.

---

## 12. Integrations & OE

**Navigation:** Integrations & OE

### Purpose
Configuration and monitoring of all **external system integrations** — the connections between the DERMS and the wider ecosystem (ADMS, SCADA, metering, weather, aggregator protocols).

This screen has five tabs:

---

### Tab 1 — Integration Connections
All configured external system integrations:
- **ADMS** — the Advanced Distribution Management System that provides real-time network model and alerts
- **DER Aggregator** — the aggregator's platform (receives OE documents, sends telemetry back)
- **SCADA** — Supervisory Control and Data Acquisition system
- **MDMS** — Meter Data Management System (historical consumption data)
- **Weather** — weather feed for solar/wind forecast inputs
- **GIS Provider** — map data source (OpenStreetMap or utility's own GIS)

Each shows:
- Mode: **SIMULATION** (platform generates synthetic data) vs **LIVE** (connects to real endpoint)
- Last test status (OK / FAILED) and when last tested
- Test button (pings the endpoint to check connectivity)
- Toggle mode button (switch between SIM and LIVE)
- Configure button (set URL, auth type, API key)

**SIMULATION mode** is key for demonstrations and testing — the platform generates realistic synthetic data without needing real external connections. Flip to LIVE when real infrastructure is available.

---

### Tab 2 — OE Message Inspector
Inspect the exact message that will be (or was) sent to an aggregator for a specific dispatch event, in their protocol:

- Select a dispatched event from the dropdown
- Choose the protocol: **IEEE 2030.5**, **OpenADR 2.0b**, **IEC 62746-4**, or **Raw JSON**
- The platform generates and displays the correctly formatted message for that protocol
- A per-asset table shows each asset's export and import limits in the message

This is the DSO's view of the **outbound communication** — exactly what the aggregator will receive.

---

### Tab 3 — Connected Aggregators
Registry of aggregator devices that have registered with the platform via the aggregator API:
- Aggregator reference (e.g. `AGG-SSEN-001`)
- Protocol (IEEE 2030.5 / OpenADR 2.0b / IEC 62746-4)
- Status (ACTIVE / INACTIVE)
- Assets linked (how many DERs this aggregator manages)
- Last seen timestamp
- Endpoint URL

Register New Aggregator button opens a form to onboard a new aggregator device.

---

### Tab 4 — Message Log
**Inbound and outbound protocol event log** — the chronological record of all communications.

**Aggregator status cards** (top): Live contact status per aggregator — green pulse if seen within 5 minutes.

**Protocol Event Log** (below): Every recorded action with:
- Direction arrow — ↙ inbound (aggregator → DERMS) or ↗ outbound (DERMS → aggregator)
- Action badge (CREATE, DISPATCH, APPROVE, UPDATE, etc.)
- Resource type (flex event, aggregator device, settlement statement, contract)
- Timestamp (relative)
- Expandable payload JSON (click to reveal diff/detail)

Filter by resource type: All / Aggregator / Flex Event / Settlement / Contract.

---

### Tab 5 — Simulation Parameters
When integrations are in SIMULATION mode, these parameters control what synthetic data the platform generates:
- ADMS: fault rate, load variability %, voltage noise level
- DER Aggregator: delivery reliability %, telemetry frequency
- MDMS: data latency, meter reading accuracy

This allows demonstrating realistic edge cases (high fault rate, poor aggregator delivery) without needing a real grid in stress.

---

## 13. SCADA Gateway

**Navigation:** SCADA Gateway

### Purpose
The **data export hub** — pushes real-time DERMS data to external SCADA systems and provides a Data-as-a-Service (DaaS) API for third-party consumers.

### Tab 1 — Push Endpoints
Configure outbound data feeds to SCADA / EMS / third-party systems:
- Endpoint name and URL
- Protocol: Modbus TCP, DNP3, IEC 60870-5-104, REST/JSON
- Push interval (seconds)
- Data flags — which data to include: grid state, LV network, DER assets, OE limits
- Last push status and timestamp
- Manual "Push Now" button for ad-hoc sync

### Tab 2 — DaaS API Keys
Issue and manage API keys for third parties who want to pull data programmatically:
- Key name and client name
- Rate limit (calls/minute)
- Permissions (which data endpoints this key can access)
- Total calls to date, last used
- Revoke button

Use case: a research institution wants live OE and telemetry data → issue a DaaS key scoped to `oe_limits` and `asset_telemetry`.

### Tab 3 — Live Snapshot
Preview the exact JSON payloads that SCADA endpoints receive:
- Grid state snapshot
- LV network snapshot
- DER assets snapshot
- OE limits snapshot

Useful for verifying data format before connecting a SCADA system.

---

## 14. Admin

**Navigation:** Admin

### Who uses this
Super Admin and Deployment Admin roles only. Day-to-day operators do not need this screen.

### Tab 1 — System Health
Real-time status of all platform components:
- **Database** — PostgreSQL connection health
- **Simulation Engine** — background grid state generation
- **API Server** — FastAPI health check
- **WebSocket** — real-time push connection
- Platform uptime
- Auto-refreshes every 30 seconds

### Tab 2 — Users
Full roster of users with access to this deployment:
- Name, email, role (SUPER\_ADMIN / DEPLOY\_ADMIN / PROG\_MGR / GRID\_OPERATOR / ANALYST / VIEWER)
- Status (ACTIVE / INACTIVE)
- Deployments they have access to

**Invite User** button sends an onboarding email to a new user and assigns role and deployment.

### Tab 3 — Configuration
Deployment-level configuration as key-value pairs:
- Regulatory framework (ENA-CPP-2024 / UPERC-DR-2025)
- Settlement cycle (HALF\_HOURLY / FIFTEEN\_MIN)
- Default OE protocol
- Grid operating thresholds
- Editable inline — changes apply immediately

### Tab 4 — Audit Log
Complete tamper-evident log of all actions taken in the platform:
- Timestamp, user email, role
- Action (CREATE / UPDATE / DELETE / DISPATCH / APPROVE / ACKNOWLEDGE)
- Resource type and ID
- IP address
- Expandable diff (what changed)

Regulatory frameworks (ENA-CPP-2024, UPERC-DR-2025) require DSOs to maintain an audit trail of all dispatch and settlement decisions. This log satisfies that requirement.

---

## 15. Glossary & Docs

**Navigation:** Glossary & Docs

### Purpose
Inline technical reference for operators and developers — no need to open a separate document.

### Sections

**Platform Overview:** Six summary cards explaining the key capabilities: multi-deployment, LV modelling, flex dispatch, SCADA gateway, forecasting, and GIS integration.

**Terminology:** Alphabetical glossary of ~38 terms: ADMS, BESS, CMZ, DER, DERMS, DNO, DOE, DistFlow, ENA-CPP, Flex Event, Hosting Capacity, IEC 62746-4, IEEE 2030.5, LV Network, OpenADR, Prequalification, Settlement, VEN/VTN, etc.

**Architecture:** Backend stack (FastAPI, PostgreSQL, SQLAlchemy async), Frontend stack (React, TypeScript, Zustand, Recharts, Leaflet), Backend module map showing which Python packages handle which domain.

**API Reference:** ~90 API endpoints organised by category — useful for developers integrating with the DaaS layer or building custom dashboards.

**Data Flow Diagrams:** Textual descriptions of:
- Flex dispatch flow (operator → DERMS → Kafka → aggregator → DER → telemetry back)
- LV power flow (DT selection → OSM data → DistFlow → voltage profile → OE)
- DaaS pull flow (third-party → API key → DERMS → live snapshot)

---

## How the Screens Connect — The Operational Workflow

```
SETUP (one time)
    Admin           → Create users, configure deployment
    Counterparties  → Register and prequalify aggregators
    Programs        → Define flexibility programme rules
    Contracts       → Sign contracts with aggregators (linked to programme)
    Grid & Assets   → Register DER assets, assign to feeders and DTs

DAILY OPERATIONS
    Dashboard       → Review overnight alerts, check grid health
    Forecasting     → Review 48h solar/load/flex forecast
    Optimization    → Get AI recommendations for the day
    Flex Dispatch   → Schedule events based on forecast and recommendations
    Operator Console→ Structured workflow when ADMS raises a fault

REAL-TIME OPERATIONS (during a flex event)
    Flex Dispatch   → Monitor live delivery vs. target
    Grid & Assets   → Watch LV voltages and node loading
    Dashboard       → Check constraint violations

END OF PERIOD
    Settlement      → Calculate settlement for closed billing period
    Settlement      → Programme manager approves statements
    Reports         → Generate regulatory reports
    Admin           → Review audit log

INTEGRATION / IT
    Integrations    → Configure ADMS/SCADA/aggregator connections
    SCADA Gateway   → Set up data push to SCADA / issue DaaS keys
```

---

## Role-Based Access Summary

| Role | Primary Screens |
|------|----------------|
| **SUPER\_ADMIN** | All screens + Admin |
| **DEPLOY\_ADMIN** | All screens + Admin (scoped to deployment) |
| **PROG\_MGR** | Dashboard, Programs, Contracts, Counterparties, Settlement (can approve) |
| **GRID\_OPERATOR** | Dashboard, Grid & Assets, Flex Dispatch, Operator Console, Forecasting, Optimization |
| **ANALYST** | Dashboard, Forecasting, Optimization, Reports, Settlement (read-only) |
| **VIEWER** | Dashboard, Grid & Assets, Reports (read-only) |

---

## Multi-Deployment Context

The platform runs **two separate deployments** simultaneously, each fully isolated:

| | SSEN | PUVVNL |
|-|------|--------|
| Geography | Scotland & Northern Isles | Varanasi Division, UP, India |
| Regulatory | ENA-CPP-2024 / RIIO-ED2 | UPERC-DR-2025 |
| Currency | GBP (pence) | INR (paise) |
| Settlement cycle | 30-minute half-hourly | 15-minute |
| Timezone | Europe/London | Asia/Kolkata |
| Network scale | Island grids (Orkney/Shetland) | Urban distribution |
| Key assets | BESS, wind turbines, V2G, DSR | Community solar, BESS, industrial DSR, P2P trading |

The operator selects their deployment at login and all screens, data, and regulatory reports are scoped to that deployment.

---

*Neural Grid DERMS v1.0 · L&T Digital Energy Solutions · © 2026*
