/**
 * DB Schema browser — shows all PostgreSQL tables derived from SQLAlchemy models
 * in the NeuralGrid backend. Grouped by domain. Each table shows columns (name,
 * type, nullable, FK) and the cross-table relationships.
 */
import React, { useState } from 'react'
import { Database, ChevronDown, ChevronRight, Key, Link } from 'lucide-react'
import clsx from 'clsx'

// ── Type definitions ──────────────────────────────────────────────────────────

interface Column {
  name: string
  type: string
  nullable?: boolean
  pk?: boolean
  fk?: string        // "other_table.column"
  note?: string
}

interface TableDef {
  table: string
  description: string
  columns: Column[]
}

interface Domain {
  name: string
  color: string        // tailwind bg class for the domain badge
  tables: TableDef[]
}

// ── Schema data (derived from backend SQLAlchemy models) ──────────────────────

const SCHEMA: Domain[] = [
  {
    name: 'Auth & Access',
    color: 'bg-violet-600',
    tables: [
      {
        table: 'users',
        description: 'Platform user accounts. One user can have roles in multiple deployments.',
        columns: [
          { name: 'id',              type: 'VARCHAR(36)', pk: true },
          { name: 'email',           type: 'VARCHAR(255)', note: 'unique' },
          { name: 'hashed_password', type: 'VARCHAR(255)' },
          { name: 'full_name',       type: 'VARCHAR(255)' },
          { name: 'is_active',       type: 'BOOLEAN' },
          { name: 'is_superuser',    type: 'BOOLEAN', note: 'bypasses deployment role checks' },
          { name: 'created_at',      type: 'TIMESTAMPTZ' },
          { name: 'updated_at',      type: 'TIMESTAMPTZ' },
        ],
      },
      {
        table: 'user_deployment_roles',
        description: 'Junction table linking users to deployments with a specific role (VIEWER / GRID_OPS / CONTRACT_MGR / PROG_MGR / DEPLOY_ADMIN).',
        columns: [
          { name: 'id',            type: 'VARCHAR(36)', pk: true },
          { name: 'user_id',       type: 'VARCHAR(36)', fk: 'users.id' },
          { name: 'deployment_id', type: 'VARCHAR(64)', fk: 'deployments.id' },
          { name: 'role',          type: 'VARCHAR(64)', note: 'VIEWER | GRID_OPS | CONTRACT_MGR | PROG_MGR | DEPLOY_ADMIN' },
        ],
      },
      {
        table: 'deployments',
        description: 'One record per DNO deployment (e.g. SSEN South Scotland, EDF Réseau Auzances). All major tables are deployment-scoped.',
        columns: [
          { name: 'id',                    type: 'VARCHAR(36)', pk: true },
          { name: 'slug',                  type: 'VARCHAR(64)', note: 'unique, URL-safe' },
          { name: 'name',                  type: 'VARCHAR(255)' },
          { name: 'country',               type: 'VARCHAR(2)', note: 'ISO 3166-1 alpha-2' },
          { name: 'currency_code',         type: 'VARCHAR(3)', note: 'ISO 4217' },
          { name: 'timezone',              type: 'VARCHAR(64)' },
          { name: 'regulatory_framework',  type: 'VARCHAR(255)', note: 'e.g. ENA-CPP-2024' },
          { name: 'voltage_nominal',       type: 'FLOAT', note: 'default 230.0 V' },
          { name: 'frequency_hz',          type: 'FLOAT', note: 'default 50.0 Hz' },
          { name: 'settlement_cycle',      type: 'VARCHAR(32)', note: 'WEEKLY | MONTHLY | QUARTERLY' },
          { name: 'is_active',             type: 'BOOLEAN' },
          { name: 'config',                type: 'JSON', nullable: true },
          { name: 'created_at',            type: 'TIMESTAMPTZ' },
        ],
      },
    ],
  },
  {
    name: 'Grid Topology',
    color: 'bg-blue-600',
    tables: [
      {
        table: 'cmzs',
        description: 'Constraint Management Zones — the highest-level grid object. Each CMZ covers a sub-network (e.g. a 20 kV feeder zone). Programs and OE are issued at CMZ level.',
        columns: [
          { name: 'id',               type: 'VARCHAR(36)', pk: true },
          { name: 'deployment_id',    type: 'VARCHAR(64)' },
          { name: 'slug',             type: 'VARCHAR(128)', note: 'e.g. CMZ-AUZANCES' },
          { name: 'name',             type: 'VARCHAR(255)' },
          { name: 'topology_type',    type: 'VARCHAR(32)', note: 'ISLAND | RADIAL | MESHED' },
          { name: 'max_import_kw',    type: 'FLOAT' },
          { name: 'max_export_kw',    type: 'FLOAT' },
          { name: 'voltage_nominal_v',type: 'FLOAT' },
          { name: 'feeder_ids',       type: 'TEXT', note: 'JSON array of GridNode IDs' },
          { name: 'created_at',       type: 'TIMESTAMPTZ' },
        ],
      },
      {
        table: 'grid_nodes',
        description: 'Individual network nodes: HV substations, MV feeders, distribution transformers. The DT node is the parent of an LV feeder.',
        columns: [
          { name: 'id',                  type: 'VARCHAR(36)', pk: true },
          { name: 'deployment_id',       type: 'VARCHAR(64)' },
          { name: 'node_id',             type: 'VARCHAR(64)', note: 'e.g. DT-AUZ-001' },
          { name: 'cmz_id',              type: 'VARCHAR(128)', fk: 'cmzs.slug' },
          { name: 'node_type',           type: 'VARCHAR(32)', note: 'FEEDER | DISTRIBUTION_TRANSFORMER | SUBSTATION' },
          { name: 'name',                type: 'VARCHAR(255)' },
          { name: 'voltage_kv',          type: 'FLOAT', nullable: true },
          { name: 'rated_kva',           type: 'FLOAT', nullable: true },
          { name: 'current_loading_pct', type: 'FLOAT' },
          { name: 'voltage_l1_v',        type: 'FLOAT', nullable: true },
          { name: 'voltage_l2_v',        type: 'FLOAT', nullable: true },
          { name: 'voltage_l3_v',        type: 'FLOAT', nullable: true },
          { name: 'hosting_capacity_kw', type: 'FLOAT' },
          { name: 'lat',                 type: 'FLOAT', nullable: true },
          { name: 'lng',                 type: 'FLOAT', nullable: true },
          { name: 'cim_id',              type: 'VARCHAR(128)', nullable: true, note: 'IEC CIM EIC mRID' },
          { name: 'created_at',          type: 'TIMESTAMPTZ' },
        ],
      },
      {
        table: 'grid_alerts',
        description: 'Active and historical constraint alerts (thermal overload, voltage deviation, etc.) triggered by power flow or SCADA telemetry.',
        columns: [
          { name: 'id',              type: 'VARCHAR(36)', pk: true },
          { name: 'deployment_id',   type: 'VARCHAR(64)' },
          { name: 'node_id',         type: 'VARCHAR(64)', nullable: true, fk: 'grid_nodes.node_id' },
          { name: 'asset_id',        type: 'VARCHAR(36)', nullable: true, fk: 'der_assets.id' },
          { name: 'alert_type',      type: 'VARCHAR(64)', note: 'THERMAL_OVERLOAD | VOLTAGE_HIGH | VOLTAGE_LOW | ...' },
          { name: 'severity',        type: 'VARCHAR(16)', note: 'CRITICAL | WARNING | INFO' },
          { name: 'message',         type: 'TEXT' },
          { name: 'is_acknowledged', type: 'BOOLEAN' },
          { name: 'acknowledged_by', type: 'VARCHAR(255)', nullable: true },
          { name: 'acknowledged_at', type: 'TIMESTAMPTZ', nullable: true },
          { name: 'created_at',      type: 'TIMESTAMPTZ' },
          { name: 'resolved_at',     type: 'TIMESTAMPTZ', nullable: true },
          { name: 'meta',            type: 'TEXT', nullable: true, note: 'JSON payload' },
        ],
      },
    ],
  },
  {
    name: 'LV Network',
    color: 'bg-cyan-600',
    tables: [
      {
        table: 'lv_feeders',
        description: 'One LV feeder per distribution transformer. Built from OSM data (Overpass API) or synthetic generation. Stores the GeoJSON route for map display.',
        columns: [
          { name: 'id',            type: 'VARCHAR(36)', pk: true },
          { name: 'deployment_id', type: 'VARCHAR(64)' },
          { name: 'dt_node_id',    type: 'VARCHAR(64)', fk: 'grid_nodes.node_id' },
          { name: 'name',          type: 'VARCHAR(255)' },
          { name: 'voltage_v',     type: 'FLOAT', note: 'default 400V' },
          { name: 'length_m',      type: 'FLOAT', nullable: true },
          { name: 'route_geojson', type: 'TEXT', nullable: true, note: 'LineString GeoJSON' },
          { name: 'created_at',    type: 'TIMESTAMPTZ' },
        ],
      },
      {
        table: 'lv_buses',
        description: 'Bus nodes on the LV feeder (connection points, DT secondary bus, end-of-feeder). Stores power flow voltage results.',
        columns: [
          { name: 'id',           type: 'VARCHAR(36)', pk: true },
          { name: 'lv_feeder_id', type: 'VARCHAR(36)', fk: 'lv_feeders.id' },
          { name: 'bus_ref',      type: 'VARCHAR(64)', note: 'e.g. BUS-001' },
          { name: 'bus_type',     type: 'VARCHAR(32)', note: 'SLACK | PQ' },
          { name: 'phase',        type: 'VARCHAR(8)' },
          { name: 'lat',          type: 'FLOAT', nullable: true },
          { name: 'lng',          type: 'FLOAT', nullable: true },
          { name: 'v_pu',         type: 'FLOAT', nullable: true, note: 'Last power flow result' },
          { name: 'v_v',          type: 'FLOAT', nullable: true },
          { name: 'p_kw',         type: 'FLOAT', nullable: true },
          { name: 'voltage_status', type: 'VARCHAR(16)', nullable: true, note: 'NORMAL | LOW | HIGH | CRITICAL' },
        ],
      },
      {
        table: 'dynamic_oe_slots',
        description: '48 × 30-min Operating Envelope slots per CMZ computed by LinDistFlow or time-series DistFlow. Cached and refreshed daily.',
        columns: [
          { name: 'id',             type: 'VARCHAR(36)', pk: true },
          { name: 'deployment_id',  type: 'VARCHAR(64)' },
          { name: 'cmz_id',         type: 'VARCHAR(128)', fk: 'cmzs.slug' },
          { name: 'slot_start_utc', type: 'TIMESTAMPTZ' },
          { name: 'q_min_kw',       type: 'FLOAT', note: 'Max reverse export (negative)' },
          { name: 'q_max_kw',       type: 'FLOAT', note: 'Max additional consumption' },
          { name: 'quality_code',   type: 'VARCHAR(8)', note: 'A06 normal | A08 degraded' },
          { name: 'constraint',     type: 'VARCHAR(64)', nullable: true },
          { name: 'total_load_kw',  type: 'FLOAT', nullable: true },
          { name: 'min_v_end_pu',   type: 'FLOAT', nullable: true },
          { name: 'source',         type: 'VARCHAR(32)', note: 'LinDistFlow | DistFlow | Arithmetic' },
          { name: 'created_at',     type: 'TIMESTAMPTZ' },
        ],
      },
    ],
  },
  {
    name: 'Assets & Telemetry',
    color: 'bg-amber-600',
    tables: [
      {
        table: 'der_assets',
        description: 'DER assets enrolled by a counterparty: solar PV, BESS, EV chargers, heat pumps, flexible industrial loads. Each asset sits behind a specific DT on a specific branch (phase).',
        columns: [
          { name: 'id',               type: 'VARCHAR(36)', pk: true },
          { name: 'deployment_id',    type: 'VARCHAR(64)' },
          { name: 'counterparty_id',  type: 'VARCHAR(36)', fk: 'counterparties.id' },
          { name: 'asset_ref',        type: 'VARCHAR(32)', note: 'e.g. EVC-B01' },
          { name: 'name',             type: 'VARCHAR(255)' },
          { name: 'type',             type: 'VARCHAR(32)', note: 'SOLAR_PV | BESS | EV_CHARGER | HEAT_PUMP | FLEXIBLE_LOAD' },
          { name: 'status',           type: 'VARCHAR(32)', note: 'ONLINE | OFFLINE | CURTAILED' },
          { name: 'dt_id',            type: 'VARCHAR(32)', nullable: true, fk: 'grid_nodes.node_id' },
          { name: 'feeder_id',        type: 'VARCHAR(32)', nullable: true },
          { name: 'phase',            type: 'VARCHAR(16)', note: 'A | B | C | UNKNOWN' },
          { name: 'capacity_kw',      type: 'FLOAT' },
          { name: 'capacity_kwh',     type: 'FLOAT', nullable: true, note: 'BESS only' },
          { name: 'comm_capability',  type: 'VARCHAR(32)', note: 'MQTT_GATEWAY | IEC_61850 | MODBUS' },
          { name: 'comm_endpoint',    type: 'VARCHAR(512)', nullable: true },
          { name: 'meter_id',         type: 'VARCHAR(64)', nullable: true },
          { name: 'lat',              type: 'FLOAT', nullable: true },
          { name: 'lng',              type: 'FLOAT', nullable: true },
          { name: 'doe_import_max_kw',type: 'FLOAT', nullable: true },
          { name: 'doe_export_max_kw',type: 'FLOAT', nullable: true },
          { name: 'doe_last_updated', type: 'TIMESTAMPTZ', nullable: true },
        ],
      },
      {
        table: 'asset_telemetry',
        description: 'Time-series telemetry from DER assets (SCADA / IoT gateway / AMI). Used for baseline calculation and settlement.',
        columns: [
          { name: 'id',            type: 'VARCHAR(36)', pk: true },
          { name: 'asset_id',      type: 'VARCHAR(36)', fk: 'der_assets.id' },
          { name: 'deployment_id', type: 'VARCHAR(64)' },
          { name: 'timestamp',     type: 'TIMESTAMPTZ' },
          { name: 'p_kw',          type: 'FLOAT', note: 'Active power (negative = export)' },
          { name: 'q_kvar',        type: 'FLOAT', nullable: true },
          { name: 'v_pu',          type: 'FLOAT', nullable: true },
          { name: 'soc_pct',       type: 'FLOAT', nullable: true, note: 'BESS only' },
          { name: 'source',        type: 'VARCHAR(32)', note: 'SCADA | IOT | AMI | SIMULATED' },
        ],
      },
      {
        table: 'doe_history',
        description: 'Historical DOE (Dynamic Operating Envelope) limits issued to individual assets.',
        columns: [
          { name: 'id',              type: 'VARCHAR(36)', pk: true },
          { name: 'asset_id',        type: 'VARCHAR(36)', fk: 'der_assets.id' },
          { name: 'deployment_id',   type: 'VARCHAR(64)' },
          { name: 'issued_at',       type: 'TIMESTAMPTZ' },
          { name: 'export_limit_kw', type: 'FLOAT' },
          { name: 'import_limit_kw', type: 'FLOAT' },
          { name: 'reason',          type: 'VARCHAR(128)', nullable: true },
        ],
      },
    ],
  },
  {
    name: 'Flexibility Programs',
    color: 'bg-emerald-600',
    tables: [
      {
        table: 'counterparties',
        description: 'Flexibility aggregators (e.g. Digital4Grids) that enroll assets and respond to flex requests. Stores D4G API credentials for A32 Activation.',
        columns: [
          { name: 'id',                type: 'VARCHAR(36)', pk: true },
          { name: 'deployment_id',     type: 'VARCHAR(64)' },
          { name: 'name',              type: 'VARCHAR(255)' },
          { name: 'type',              type: 'VARCHAR(32)', note: 'AGGREGATOR | SUPPLIER | TSO' },
          { name: 'market_mrid',       type: 'VARCHAR(64)', note: '17-char IEC EIC code' },
          { name: 'api_base_url',      type: 'VARCHAR(512)', nullable: true },
          { name: 'api_key_enc',       type: 'TEXT', nullable: true, note: 'Encrypted X-API-Key for D4G' },
          { name: 'resource_group_id', type: 'VARCHAR(128)', nullable: true },
          { name: 'country',           type: 'VARCHAR(2)' },
          { name: 'status',            type: 'VARCHAR(32)', note: 'ACTIVE | INACTIVE | SUSPENDED' },
          { name: 'created_at',        type: 'TIMESTAMPTZ' },
        ],
      },
      {
        table: 'prequalification_checks',
        description: 'Pre-qualification audit trail for counterparties (asset verification, communication tests).',
        columns: [
          { name: 'id',              type: 'VARCHAR(36)', pk: true },
          { name: 'counterparty_id', type: 'VARCHAR(36)', fk: 'counterparties.id' },
          { name: 'check_type',      type: 'VARCHAR(64)' },
          { name: 'status',          type: 'VARCHAR(32)', note: 'PASS | FAIL | PENDING' },
          { name: 'notes',           type: 'TEXT', nullable: true },
          { name: 'checked_at',      type: 'TIMESTAMPTZ' },
        ],
      },
      {
        table: 'programs',
        description: 'Flex programs at DT/CMZ level. A program defines the service type, constraints, price, and lead time. Programs are DT-scoped — the binding branch constraint is discovered at dispatch time.',
        columns: [
          { name: 'id',                  type: 'VARCHAR(36)', pk: true },
          { name: 'deployment_id',       type: 'VARCHAR(64)' },
          { name: 'name',                type: 'VARCHAR(255)' },
          { name: 'type',                type: 'VARCHAR(32)', note: 'DEMAND_RESPONSE | PEAK_SHAVING | VOLTAGE_SUPPORT' },
          { name: 'status',              type: 'VARCHAR(32)', note: 'ACTIVE | SUSPENDED | EXPIRED' },
          { name: 'dt_node_id',          type: 'VARCHAR(64)', fk: 'grid_nodes.node_id' },
          { name: 'constraint_type',     type: 'VARCHAR(32)', note: 'THERMAL | VOLTAGE | BOTH' },
          { name: 'max_flex_kw',         type: 'FLOAT' },
          { name: 'min_flex_kw',         type: 'FLOAT' },
          { name: 'price_eur_per_mwh',   type: 'FLOAT' },
          { name: 'lead_time_min',       type: 'INTEGER', note: 'Activation lead time' },
          { name: 'validity_start',      type: 'DATE' },
          { name: 'validity_end',        type: 'DATE' },
          { name: 'created_at',          type: 'TIMESTAMPTZ' },
        ],
      },
      {
        table: 'contracts',
        description: 'Bilateral contract between DNO and a counterparty for a specific program. Specifies the baseline method and measurement source for settlement.',
        columns: [
          { name: 'id',                 type: 'VARCHAR(36)', pk: true },
          { name: 'deployment_id',      type: 'VARCHAR(64)' },
          { name: 'program_id',         type: 'VARCHAR(36)', fk: 'programs.id' },
          { name: 'counterparty_id',    type: 'VARCHAR(36)', fk: 'counterparties.id' },
          { name: 'type',               type: 'VARCHAR(32)', note: 'AVAILABILITY | DYNAMIC_CONTAINMENT' },
          { name: 'status',             type: 'VARCHAR(32)', note: 'DRAFT | ACTIVE | EXPIRED | TERMINATED' },
          { name: 'start_date',         type: 'DATE' },
          { name: 'end_date',           type: 'DATE' },
          { name: 'baseline_method',    type: 'VARCHAR(32)', note: 'D4G_ENROLLED | SYMMETRIC_8 | METER_BEFORE' },
          { name: 'measurement_source', type: 'VARCHAR(32)', note: 'SMART_METER | IOT_GATEWAY | SCADA' },
          { name: 'created_at',         type: 'TIMESTAMPTZ' },
        ],
      },
      {
        table: 'contract_amendments',
        description: 'Versioned amendments to contracts (price changes, capacity changes).',
        columns: [
          { name: 'id',          type: 'VARCHAR(36)', pk: true },
          { name: 'contract_id', type: 'VARCHAR(36)', fk: 'contracts.id' },
          { name: 'version',     type: 'INTEGER' },
          { name: 'changes',     type: 'TEXT', note: 'JSON diff' },
          { name: 'reason',      type: 'TEXT', nullable: true },
          { name: 'amended_at',  type: 'TIMESTAMPTZ' },
        ],
      },
    ],
  },
  {
    name: 'Dispatch & OE Messages',
    color: 'bg-orange-600',
    tables: [
      {
        table: 'flex_events',
        description: 'A flex dispatch event — triggered when the operator accepts a FlexOffer (A26) and sends an A32 Activation. Tracks the full lifecycle from OE generation to settlement.',
        columns: [
          { name: 'id',               type: 'VARCHAR(36)', pk: true },
          { name: 'deployment_id',    type: 'VARCHAR(64)' },
          { name: 'program_id',       type: 'VARCHAR(36)', fk: 'programs.id' },
          { name: 'contract_id',      type: 'VARCHAR(36)', nullable: true, fk: 'contracts.id' },
          { name: 'status',           type: 'VARCHAR(32)', note: 'PENDING | ACTIVE | COMPLETED | CANCELLED | FAILED' },
          { name: 'trigger_time',     type: 'TIMESTAMPTZ' },
          { name: 'dispatch_time',    type: 'TIMESTAMPTZ', nullable: true },
          { name: 'end_time',         type: 'TIMESTAMPTZ', nullable: true },
          { name: 'requested_kw',     type: 'FLOAT' },
          { name: 'delivered_kw',     type: 'FLOAT', nullable: true },
          { name: 'binding_branch',   type: 'VARCHAR(16)', nullable: true, note: 'BR-A | BR-B | BR-C' },
          { name: 'created_at',       type: 'TIMESTAMPTZ' },
        ],
      },
      {
        table: 'oe_messages',
        description: 'IEC 62746-4 message log for each flex event. Stores every A38/A26/A32/A16 document exchanged with the aggregator.',
        columns: [
          { name: 'id',              type: 'VARCHAR(36)', pk: true },
          { name: 'flex_event_id',   type: 'VARCHAR(36)', fk: 'flex_events.id' },
          { name: 'deployment_id',   type: 'VARCHAR(64)' },
          { name: 'message_type',    type: 'VARCHAR(8)', note: 'A38 | A26 | A32 | A16' },
          { name: 'direction',       type: 'VARCHAR(8)', note: 'SENT | RECEIVED' },
          { name: 'mrid',            type: 'VARCHAR(64)' },
          { name: 'payload_json',    type: 'TEXT', note: 'Full IEC JSON document' },
          { name: 'http_status',     type: 'INTEGER', nullable: true },
          { name: 'sent_at',         type: 'TIMESTAMPTZ' },
        ],
      },
    ],
  },
  {
    name: 'Settlement',
    color: 'bg-pink-600',
    tables: [
      {
        table: 'settlement_statements',
        description: 'Settlement statement for a completed flex event. Compares baseline to metered delivery, computes performance % and net payment.',
        columns: [
          { name: 'id',               type: 'VARCHAR(36)', pk: true },
          { name: 'deployment_id',    type: 'VARCHAR(64)' },
          { name: 'flex_event_id',    type: 'VARCHAR(36)', fk: 'flex_events.id' },
          { name: 'contract_id',      type: 'VARCHAR(36)', fk: 'contracts.id' },
          { name: 'period_start',     type: 'TIMESTAMPTZ' },
          { name: 'period_end',       type: 'TIMESTAMPTZ' },
          { name: 'committed_kwh',    type: 'FLOAT' },
          { name: 'delivered_kwh',    type: 'FLOAT' },
          { name: 'performance_pct',  type: 'FLOAT' },
          { name: 'price_eur_mwh',    type: 'FLOAT' },
          { name: 'gross_amount_eur', type: 'FLOAT' },
          { name: 'penalty_eur',      type: 'FLOAT', note: 'Applied if performance < threshold' },
          { name: 'net_amount_eur',   type: 'FLOAT' },
          { name: 'status',           type: 'VARCHAR(32)', note: 'DRAFT | APPROVED | DISPUTED | PAID' },
          { name: 'a16_mrid',         type: 'VARCHAR(64)', nullable: true, note: 'IEC A16 document mRID' },
          { name: 'created_at',       type: 'TIMESTAMPTZ' },
        ],
      },
    ],
  },
  {
    name: 'Forecasting',
    color: 'bg-teal-600',
    tables: [
      {
        table: 'forecast_records',
        description: 'Day-ahead load/generation forecasts per asset or feeder. Used as inputs to LinDistFlow OE computation and power flow validation.',
        columns: [
          { name: 'id',             type: 'VARCHAR(36)', pk: true },
          { name: 'deployment_id',  type: 'VARCHAR(64)' },
          { name: 'asset_id',       type: 'VARCHAR(36)', nullable: true, fk: 'der_assets.id' },
          { name: 'feeder_id',      type: 'VARCHAR(36)', nullable: true, fk: 'lv_feeders.id' },
          { name: 'slot_start_utc', type: 'TIMESTAMPTZ' },
          { name: 'p_kw',           type: 'FLOAT' },
          { name: 'q_kvar',         type: 'FLOAT', nullable: true },
          { name: 'source',         type: 'VARCHAR(32)', note: 'DIURNAL | WEATHER | ML_MODEL | MANUAL' },
          { name: 'confidence_pct', type: 'FLOAT', nullable: true },
          { name: 'created_at',     type: 'TIMESTAMPTZ' },
        ],
      },
    ],
  },
  {
    name: 'Integrations & SCADA',
    color: 'bg-gray-500',
    tables: [
      {
        table: 'integrations',
        description: 'External system integration configs (SCADA, AMI, DSO API, weather feeds). Each integration has live/sim mode.',
        columns: [
          { name: 'id',            type: 'VARCHAR(36)', pk: true },
          { name: 'deployment_id', type: 'VARCHAR(64)' },
          { name: 'name',          type: 'VARCHAR(255)' },
          { name: 'type',          type: 'VARCHAR(32)', note: 'SCADA | AMI | DSO_API | WEATHER' },
          { name: 'endpoint_url',  type: 'VARCHAR(512)' },
          { name: 'config_json',   type: 'TEXT', note: 'Auth params, topic mappings' },
          { name: 'mode',          type: 'VARCHAR(16)', note: 'LIVE | SIMULATED' },
          { name: 'status',        type: 'VARCHAR(32)', note: 'CONNECTED | DISCONNECTED | ERROR' },
          { name: 'last_ping_at',  type: 'TIMESTAMPTZ', nullable: true },
        ],
      },
      {
        table: 'scada_endpoints',
        description: 'SCADA gateway push endpoints that receive grid snapshots (voltages, loading, OE limits).',
        columns: [
          { name: 'id',            type: 'VARCHAR(36)', pk: true },
          { name: 'deployment_id', type: 'VARCHAR(64)' },
          { name: 'name',          type: 'VARCHAR(255)' },
          { name: 'protocol',      type: 'VARCHAR(32)', note: 'IEC_61968 | MODBUS_TCP | DNSP3 | REST_JSON' },
          { name: 'endpoint_url',  type: 'VARCHAR(512)' },
          { name: 'api_key_enc',   type: 'TEXT', nullable: true },
          { name: 'last_push_at',  type: 'TIMESTAMPTZ', nullable: true },
          { name: 'status',        type: 'VARCHAR(32)' },
        ],
      },
    ],
  },
]

// ── Relationship summary ──────────────────────────────────────────────────────

const RELATIONSHIPS = [
  { from: 'users', via: 'user_deployment_roles', to: 'deployments', label: 'M:N — one user can have roles in many deployments' },
  { from: 'deployments', to: 'cmzs',             label: '1:N — each deployment has many CMZs' },
  { from: 'cmzs', to: 'grid_nodes',              label: '1:N — each CMZ has many grid nodes (DTs, feeders)' },
  { from: 'grid_nodes (DT)', to: 'lv_feeders',   label: '1:1 — each DT has one LV feeder topology' },
  { from: 'lv_feeders', to: 'lv_buses',          label: '1:N — each feeder has many bus nodes' },
  { from: 'lv_feeders', to: 'dynamic_oe_slots',  label: '1:N — 48 OE slots generated per feeder per day' },
  { from: 'counterparties', to: 'der_assets',    label: '1:N — each counterparty owns many assets' },
  { from: 'der_assets', to: 'asset_telemetry',   label: '1:N — time-series telemetry per asset' },
  { from: 'grid_nodes (DT)', to: 'programs',     label: '1:N — a DT can have multiple flex programs' },
  { from: 'programs', to: 'contracts',           label: '1:N — a program can have multiple contracts (one per counterparty)' },
  { from: 'contracts', to: 'flex_events',        label: '1:N — each contract can have many dispatch events' },
  { from: 'flex_events', to: 'oe_messages',      label: '1:N — each event produces A38/A26/A32/A16 messages' },
  { from: 'flex_events', to: 'settlement_statements', label: '1:1 — each completed event has one settlement statement' },
]

// ── Component ─────────────────────────────────────────────────────────────────

function ColRow({ col }: { col: Column }) {
  return (
    <tr className="border-t border-gray-200 text-xs">
      <td className="py-1.5 pr-3 font-mono text-gray-800 flex items-center gap-1.5">
        {col.pk && <Key className="w-3 h-3 text-amber-400 flex-shrink-0" />}
        {col.fk && !col.pk && <Link className="w-3 h-3 text-blue-400 flex-shrink-0" />}
        {!col.pk && !col.fk && <span className="w-3 flex-shrink-0" />}
        {col.name}
      </td>
      <td className="py-1.5 pr-3 font-mono text-indigo-600">{col.type}</td>
      <td className="py-1.5 pr-3 text-gray-500">{col.nullable ? 'nullable' : ''}</td>
      <td className="py-1.5">
        {col.fk && <span className="text-blue-500">→ {col.fk}</span>}
        {col.note && <span className="text-gray-500 italic">{col.note}</span>}
      </td>
    </tr>
  )
}

function TableCard({ table: t, defaultOpen }: { table: TableDef; defaultOpen?: boolean }) {
  const [open, setOpen] = useState(defaultOpen ?? false)
  const fkCount = t.columns.filter(c => c.fk).length
  return (
    <div className="border border-gray-200 rounded-lg overflow-hidden">
      <button
        onClick={() => setOpen(o => !o)}
        className="w-full flex items-center gap-3 px-4 py-2.5 bg-white hover:bg-gray-50 transition-colors text-left"
      >
        <Database className="w-3.5 h-3.5 text-gray-500 flex-shrink-0" />
        <span className="font-mono text-sm font-semibold text-gray-900 flex-1">{t.table}</span>
        <span className="text-[10px] text-gray-500">{t.columns.length} cols</span>
        {fkCount > 0 && (
          <span className="text-[10px] text-blue-500">{fkCount} FK</span>
        )}
        {open ? <ChevronDown className="w-3.5 h-3.5 text-gray-500" /> : <ChevronRight className="w-3.5 h-3.5 text-gray-500" />}
      </button>

      {open && (
        <div className="px-4 pb-3 bg-gray-50">
          <p className="text-xs text-gray-500 italic py-2 border-b border-gray-200 mb-2">{t.description}</p>
          <table className="w-full">
            <thead>
              <tr className="text-[10px] text-gray-500 uppercase tracking-wider">
                <th className="text-left pb-1.5 pr-3 font-medium">Column</th>
                <th className="text-left pb-1.5 pr-3 font-medium">Type</th>
                <th className="text-left pb-1.5 pr-3 font-medium">Nullable</th>
                <th className="text-left pb-1.5 font-medium">FK / Notes</th>
              </tr>
            </thead>
            <tbody>
              {t.columns.map(col => <ColRow key={col.name} col={col} />)}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}

export default function DBSchemaPage() {
  const totalTables = SCHEMA.reduce((s, d) => s + d.tables.length, 0)
  const totalCols = SCHEMA.reduce((s, d) => s + d.tables.reduce((ss, t) => ss + t.columns.length, 0), 0)
  const [relOpen, setRelOpen] = useState(true)

  return (
    <div className="space-y-5 max-w-5xl mx-auto">
      {/* Header */}
      <div>
        <h1 className="text-xl font-bold text-gray-900">Database Schema</h1>
        <p className="text-sm text-gray-500 mt-0.5">
          PostgreSQL · SQLAlchemy ORM · {totalTables} tables · {totalCols} columns · all tables are deployment-scoped
        </p>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-4 gap-3">
        {SCHEMA.map(d => (
          <div key={d.name} className="bg-white border border-gray-200 rounded-lg p-3">
            <div className={clsx('w-2 h-2 rounded-full inline-block mr-2', d.color)} />
            <span className="text-xs text-gray-500">{d.name}</span>
            <div className="text-lg font-bold text-gray-900 mt-0.5">{d.tables.length}</div>
            <div className="text-[10px] text-gray-400">tables</div>
          </div>
        ))}
      </div>

      {/* Relationships */}
      <div className="border border-gray-200 rounded-lg overflow-hidden">
        <button
          onClick={() => setRelOpen(o => !o)}
          className="w-full flex items-center gap-3 px-4 py-3 bg-white hover:bg-gray-50 text-left"
        >
          <Link className="w-3.5 h-3.5 text-blue-500 flex-shrink-0" />
          <span className="text-sm font-semibold text-gray-900 flex-1">Foreign Key Relationships</span>
          <span className="text-[10px] text-gray-500">{RELATIONSHIPS.length} relationships</span>
          {relOpen ? <ChevronDown className="w-3.5 h-3.5 text-gray-500" /> : <ChevronRight className="w-3.5 h-3.5 text-gray-500" />}
        </button>
        {relOpen && (
          <div className="px-4 pb-3 bg-gray-50 space-y-1.5 pt-2">
            {RELATIONSHIPS.map((r, i) => (
              <div key={i} className="flex items-start gap-2 text-xs">
                <span className="font-mono text-indigo-600 w-48 flex-shrink-0">{r.from}</span>
                <span className="text-gray-400">→</span>
                <span className="font-mono text-indigo-600 w-48 flex-shrink-0">{r.to}</span>
                <span className="text-gray-500">{r.label}</span>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Tables by domain */}
      {SCHEMA.map(domain => (
        <div key={domain.name}>
          <div className="flex items-center gap-2 mb-2">
            <span className={clsx('w-2.5 h-2.5 rounded-sm flex-shrink-0', domain.color)} />
            <h2 className="text-sm font-semibold text-gray-700">{domain.name}</h2>
            <span className="text-xs text-gray-400">({domain.tables.length} tables)</span>
          </div>
          <div className="space-y-2">
            {domain.tables.map(t => <TableCard key={t.table} table={t} />)}
          </div>
        </div>
      ))}
    </div>
  )
}
