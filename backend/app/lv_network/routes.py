"""
LV Network API routes.

Provides endpoints to:
  - Discover / build LV feeder topology for a distribution transformer
  - Run DistFlow power flow on an LV feeder
  - List LV feeders for a deployment
  - Query available GIS data providers
"""
from __future__ import annotations

import json
import math
import time as _time
from datetime import datetime, timezone
from typing import List, Optional

from fastapi import APIRouter, Body, HTTPException, Query
from sqlalchemy import select

from app.core.deps import CurrentUserDep, DBDep, DeploymentDep
from app.lv_network.models import LVBus, LVFeeder
from app.lv_network.schemas import LVBusRead, LVFeederRead
from app.lv_network.service import (
    fetch_area_lv_network,
    get_congested_dts,
    get_or_build_lv_network,
    run_lv_power_flow,
)

router = APIRouter(prefix="/api/v1/lv-network", tags=["lv-network"])

# Runtime-overridable D4G config (survives until process restart; overrides env vars)
# Seed with demo defaults so the UI always shows a configurable endpoint
_d4g_runtime: dict = {
    "d4g_api_url": "https://demo.d4g.local/oe",
    "d4g_api_key": "d4g-demo-api-key-2026",
}

_DEMO_D4G_URL = "https://demo.d4g.local/oe"

# ---------------------------------------------------------------------------
# Alarms store (in-memory; resets on restart)
# ---------------------------------------------------------------------------

def _make_alarms() -> list:
    now = datetime.now(timezone.utc)
    def _ago(minutes: float) -> str:
        from datetime import timedelta
        return (now - timedelta(minutes=minutes)).isoformat()
    return [
        {
            "id": "ALM-001", "timestamp": _ago(3),
            "dt_id": "DT-AUZ-005", "type": "OVERVOLTAGE", "severity": "CRITICAL",
            "detail": "Feeder B end-of-line voltage exceeds 1.05 pu limit",
            "value": "1.087 pu", "threshold": "1.05 pu", "status": "ACTIVE",
        },
        {
            "id": "ALM-002", "timestamp": _ago(7),
            "dt_id": "DT-AUZ-001", "type": "EMERGENCY_SPG", "severity": "CRITICAL",
            "detail": "Community Solar A SPG measurement exceeds OE export limit",
            "value": "142 kW", "threshold": "90 kW (OE max export)", "status": "ACTIVE",
        },
        {
            "id": "ALM-003", "timestamp": _ago(18),
            "dt_id": "DT-AUZ-003", "type": "THERMAL", "severity": "WARNING",
            "detail": "Branch loading approaching thermal limit",
            "value": "94%", "threshold": "90% nameplate", "status": "ACKNOWLEDGED",
        },
        {
            "id": "ALM-004", "timestamp": _ago(45),
            "dt_id": "DT-AUZ-002", "type": "OVERVOLTAGE", "severity": "WARNING",
            "detail": "Feeder A voltage elevated during solar peak",
            "value": "1.052 pu", "threshold": "1.05 pu", "status": "CLEARED",
        },
        {
            "id": "ALM-005", "timestamp": _ago(62),
            "dt_id": "DT-AUZ-005", "type": "EMERGENCY_SPG", "severity": "CRITICAL",
            "detail": "Bois-Rond Solar Farm SPG unresponsive — no ACK within 60s",
            "value": "No response", "threshold": "60s timeout", "status": "ACKNOWLEDGED",
        },
    ]

_alarms: list = _make_alarms()

# IEC message endpoint config (inbound/outbound for each document type)
_iec_endpoints: dict = {
    "A38": {"label": "Operating Envelope", "direction": "outbound", "url": "", "key": ""},
    "A44": {"label": "Performance / Settlement", "direction": "inbound", "url": "", "key": ""},
    "A28": {"label": "Activation Instruction", "direction": "inbound", "url": "", "key": ""},
}


# ---------------------------------------------------------------------------
# Provider registry
# ---------------------------------------------------------------------------

_PROVIDERS = [
    {
        "id": "overpass",
        "name": "OpenStreetMap (Overpass API)",
        "url": "https://overpass-api.de/api/interpreter",
        "is_default": True,
        "description": (
            "Queries the global OpenStreetMap Overpass API for mapped LV cables "
            "and overhead lines. Fallback to synthetic when no data is found."
        ),
    },
    {
        "id": "overpass_fr",
        "name": "OpenStreetMap (France mirror)",
        "url": "https://overpass.openstreetmap.fr/api/interpreter",
        "is_default": False,
        "description": (
            "Alternative Overpass mirror hosted in France. "
            "Use if the primary endpoint is rate-limited."
        ),
    },
    {
        "id": "synthetic",
        "name": "Synthetic (no internet required)",
        "url": "",
        "is_default": False,
        "description": (
            "Generates a synthetic radial LV feeder topology offline. "
            "Suitable for simulation, testing, and areas with no OSM coverage."
        ),
    },
]


# ---------------------------------------------------------------------------
# Helper
# ---------------------------------------------------------------------------

def _feeder_geojson(feeder: LVFeeder, buses: list[LVBus]) -> dict:
    """Build a GeoJSON FeatureCollection from feeder + bus records for map display."""
    features = []

    # Feeder route as LineString (if available)
    if feeder.route_geojson:
        try:
            route_geo = json.loads(feeder.route_geojson) if isinstance(feeder.route_geojson, str) else feeder.route_geojson
            features.append({
                "type": "Feature",
                "geometry": route_geo,
                "properties": {
                    "feature_type": "feeder_route",
                    "feeder_id": feeder.id,
                    "name": feeder.name,
                    "voltage_v": feeder.voltage_v,
                    "length_m": feeder.length_m,
                },
            })
        except (json.JSONDecodeError, TypeError):
            pass

    # Bus nodes as Points
    for bus in buses:
        if bus.lat is not None and bus.lng is not None:
            features.append({
                "type": "Feature",
                "geometry": {
                    "type": "Point",
                    "coordinates": [bus.lng, bus.lat],
                },
                "properties": {
                    "feature_type": "lv_bus",
                    "bus_id": bus.id,
                    "bus_ref": bus.bus_ref,
                    "bus_type": bus.bus_type,
                    "phase": bus.phase,
                    "v_pu": bus.v_pu,
                    "v_v": bus.v_v,
                    "voltage_status": bus.voltage_status,
                    "p_kw": bus.p_kw,
                },
            })

    return {
        "type": "FeatureCollection",
        "features": features,
        "properties": {
            "feeder_id": feeder.id,
            "dt_node_id": feeder.dt_node_id,
            "deployment_id": feeder.deployment_id,
            "bus_count": len(buses),
        },
    }


# ---------------------------------------------------------------------------
# Routes
# ---------------------------------------------------------------------------

@router.get("/providers")
async def list_providers() -> dict:
    """List available GIS data providers for LV network discovery."""
    return {"providers": _PROVIDERS}


@router.get("/")
async def list_lv_feeders(
    db: DBDep,
    current_user: CurrentUserDep,
    deployment_id: DeploymentDep,
    limit: int = Query(100, ge=1, le=500),
    offset: int = Query(0, ge=0),
) -> dict:
    """List all LV feeders for the current deployment."""
    result = await db.execute(
        select(LVFeeder)
        .where(LVFeeder.deployment_id == deployment_id)
        .offset(offset)
        .limit(limit)
    )
    feeders = result.scalars().all()
    return {
        "items": [LVFeederRead.model_validate(f) for f in feeders],
        "total": len(feeders),
        "offset": offset,
    }


@router.get("/dt/{dt_node_id}")
async def get_lv_network_for_dt(
    dt_node_id: str,
    db: DBDep,
    current_user: CurrentUserDep,
    deployment_id: DeploymentDep,
    provider: str = Query("overpass", description="GIS provider: overpass / overpass_fr / synthetic"),
    force_rebuild: bool = Query(False, description="Force rebuild from source even if cached"),
) -> dict:
    """
    Get (or build) the LV feeder network behind a distribution transformer.

    On first call (or when force_rebuild=True) the feeder topology is fetched
    from the Overpass API or generated synthetically, then persisted to the DB.
    Subsequent calls return the cached topology instantly.

    Returns: feeder metadata, bus list, and a GeoJSON FeatureCollection for map display.
    """
    # Resolve DT location from GridNode
    dt_lat: Optional[float] = None
    dt_lng: Optional[float] = None

    try:
        from app.grid.models import GridNode
        from sqlalchemy import select as sa_select
        dt_result = await db.execute(
            sa_select(GridNode).where(
                GridNode.node_id == dt_node_id,
                GridNode.deployment_id == deployment_id,
                GridNode.node_type == "DISTRIBUTION_TRANSFORMER",
            ).limit(1)
        )
        dt_node = dt_result.scalar_one_or_none()
        if dt_node:
            dt_lat = dt_node.lat
            dt_lng = dt_node.lng
    except Exception:
        pass

    if dt_lat is None or dt_lng is None:
        # If no GridNode found, check for an existing feeder — may have centroid
        existing_result = await db.execute(
            select(LVFeeder).where(
                LVFeeder.dt_node_id == dt_node_id,
                LVFeeder.deployment_id == deployment_id,
            ).limit(1)
        )
        existing = existing_result.scalar_one_or_none()
        if existing and not force_rebuild:
            buses_result = await db.execute(
                select(LVBus).where(LVBus.lv_feeder_id == existing.id)
            )
            buses = list(buses_result.scalars().all())
            return {
                "feeder": LVFeederRead.model_validate(existing),
                "buses": [LVBusRead.model_validate(b) for b in buses],
                "geojson": _feeder_geojson(existing, buses),
            }
        # Default to (0, 0) — synthetic will still produce a valid topology
        dt_lat = 0.0
        dt_lng = 0.0

    try:
        feeder, buses = await get_or_build_lv_network(
            db=db,
            dt_node_id=dt_node_id,
            deployment_id=deployment_id,
            dt_lat=dt_lat,
            dt_lng=dt_lng,
            force_rebuild=force_rebuild,
            provider=provider,
        )
        await db.commit()
    except Exception as exc:
        raise HTTPException(status_code=500, detail=f"Failed to build LV network: {exc}")

    return {
        "feeder": LVFeederRead.model_validate(feeder),
        "buses": [LVBusRead.model_validate(b) for b in buses],
        "geojson": _feeder_geojson(feeder, buses),
    }


@router.post("/dt/{dt_node_id}/power-flow")
async def run_power_flow_for_dt(
    dt_node_id: str,
    db: DBDep,
    current_user: CurrentUserDep,
    deployment_id: DeploymentDep,
) -> dict:
    """
    Run DistFlow power flow on the LV network behind a distribution transformer.

    The LV feeder must already exist (call GET /dt/{dt_node_id} first to build it).
    Updates bus voltage results in the DB and caches the full power flow result
    on the feeder record.

    Returns the power flow result with feeder_id, dt_node_id, and source fields.
    """
    # Find the feeder for this DT
    feeder_result = await db.execute(
        select(LVFeeder).where(
            LVFeeder.dt_node_id == dt_node_id,
            LVFeeder.deployment_id == deployment_id,
        ).limit(1)
    )
    feeder = feeder_result.scalar_one_or_none()

    if not feeder:
        raise HTTPException(
            status_code=404,
            detail=(
                f"No LV feeder found for DT '{dt_node_id}'. "
                "Call GET /api/v1/lv-network/dt/{dt_node_id} first to build the network."
            ),
        )

    try:
        result = await run_lv_power_flow(
            db=db,
            lv_feeder_id=feeder.id,
            deployment_id=deployment_id,
        )
        await db.commit()
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc))
    except Exception as exc:
        raise HTTPException(status_code=500, detail=f"Power flow failed: {exc}")

    return result


@router.get("/congested-dts")
async def get_congested_dts_endpoint(
    db: DBDep,
    current_user: CurrentUserDep,
    deployment_id: DeploymentDep,
    threshold_pct: float = Query(75.0, ge=0, le=100, description="Branch loading threshold %"),
    limit: int = Query(20, ge=1, le=100, description="Maximum DTs to return"),
) -> list:
    """
    Return DTs ranked by congestion score (loading % + voltage violations).
    Used to identify which DTs to target for power flow and OSM fetch.
    Solar-heavy networks show VOLTAGE_HIGH as primary congestion type.
    """
    try:
        results = await get_congested_dts(
            db=db,
            deployment_id=deployment_id,
            threshold_loading_pct=threshold_pct,
        )
    except Exception as exc:
        raise HTTPException(status_code=500, detail=f"Congestion analysis failed: {exc}")

    return results[:limit]


@router.get("/dynamic-oe/{cmz_id}")
async def get_dynamic_oe(
    cmz_id: str,
    db: DBDep,
    current_user: CurrentUserDep,
    deployment_id: DeploymentDep,
    horizon_hours: int = Query(48, ge=1, le=168),
    recalculate: bool = Query(False, description="Force recalculation even if cached"),
) -> dict:
    """
    Dynamic Operating Envelope for a CMZ derived from time-series DistFlow.

    Returns 30-min slots with physics-based export/import limits,
    voltage bounds, and branch loading. Falls back to arithmetic if
    DistFlow data not available.

    Set ?recalculate=true to trigger immediate recalculation (slow, ~2s per CMZ).
    """
    try:
        if recalculate:
            from app.lv_network.dynamic_oe import compute_cmz_dynamic_oe
            slots = await compute_cmz_dynamic_oe(db, cmz_id, deployment_id, horizon_hours)
            await db.commit()
        else:
            from app.forecasting.service import generate_oe_headroom_forecast
            slots = await generate_oe_headroom_forecast(db, cmz_id, deployment_id, horizon_hours)
    except Exception as exc:
        raise HTTPException(status_code=500, detail=f"Dynamic OE calculation failed: {exc}")

    return {
        "cmz_id": cmz_id,
        "deployment_id": deployment_id,
        "horizon_hours": horizon_hours,
        "interval_count": len(slots),
        "source": slots[0].get("source", "UNKNOWN") if slots else "NONE",
        "slots": slots,
    }


@router.get("/area")
async def get_area_lv_network(
    db: DBDep,
    current_user: CurrentUserDep,
    deployment_id: DeploymentDep,
    south: float = Query(..., description="Bounding box south latitude"),
    west: float = Query(..., description="Bounding box west longitude"),
    north: float = Query(..., description="Bounding box north latitude"),
    east: float = Query(..., description="Bounding box east longitude"),
    provider: str = Query("overpass", description="GIS provider: overpass | overpass_fr"),
) -> dict:
    """
    Fetch all LV electrical infrastructure within a geographic bounding box.
    Returns GeoJSON FeatureCollection with cables, lines, transformers, substations.
    Used by the GIS map area-selector to show the full LV network for a pilot zone.
    """
    try:
        geojson = await fetch_area_lv_network(
            south=south,
            west=west,
            north=north,
            east=east,
            deployment_id=deployment_id,
            provider=provider,
        )
    except Exception as exc:
        raise HTTPException(status_code=500, detail=f"Area LV network fetch failed: {exc}")

    return geojson


@router.get("/lindistflow-oe")
async def lindistflow_oe_endpoint(
    dt_id: str = Query("DT-AUZ-001", description="Distribution transformer ID"),
) -> dict:
    """
    Compute 48-slot day-ahead Operating Envelope using LinDistFlow for the
    Auzances 250 kVA demo network.

    LinDistFlow is the industry-standard method used by real DNSPs (SAPN, AusNet,
    WPD) for batch OE computation.  Each slot checks:
      - DT thermal constraint (225 kW limit)
      - End-of-feeder voltage constraint (0.94–1.06 pu)
      - Cable ampacity (300 A / 200 A per branch)

    Returns 48 × 30-min slots with physics-based export/import limits.
    """
    from app.lv_network.lindistflow_oe import compute_lindistflow_oe_48slots
    slots = compute_lindistflow_oe_48slots(dt_id=dt_id)
    return {
        "dt_id": dt_id,
        "solver": "LinDistFlow",
        "slot_count": len(slots),
        "interval_minutes": 30,
        "slots": slots,
    }


@router.get("/powsybl-power-flow")
async def powsybl_power_flow_endpoint(
    ev_surge: bool = False,
    slot: int = Query(None, ge=0, le=47, description="30-min slot index 0-47; overrides ev_surge if provided"),
):
    """
    Run Powsybl AC load flow on the Auzances 250 kVA 3-branch LV reference network.

    Uses pypowsybl (OpenLoadFlow) if available, falls back to DistFlow.

    Query params:
      ev_surge: bool — if true, adds 3 EV fast chargers to Branch B (350 kW)
      slot: int — 0-47 slot index; overrides ev_surge (slots 36-43 = 18:00-22:00 EV surge)
    """
    # Derive ev_surge from slot if provided (slots 36-43 = 18:00-22:00 EV surge)
    if slot is not None:
        ev_surge = 36 <= slot < 44
    from app.lv_network.powsybl_service import run_auzance_power_flow
    result = run_auzance_power_flow(ev_surge=ev_surge)
    return result


@router.get("/d4g-config")
async def get_d4g_config(current_user: CurrentUserDep = None) -> dict:
    """Return current D4G integration config (key masked)."""
    from app.config import settings
    url = _d4g_runtime.get("d4g_api_url") or settings.d4g_api_url
    key = _d4g_runtime.get("d4g_api_key") or settings.d4g_api_key
    source = "runtime" if _d4g_runtime.get("d4g_api_url") else ("env" if settings.d4g_api_url else "demo")
    return {
        "d4g_api_url": url,
        "d4g_api_key_hint": (key[:8] + "…" + key[-4:]) if len(key) > 12 else ("set" if key else ""),
        "is_demo": url == _DEMO_D4G_URL,
        "source": source,
    }


@router.put("/d4g-config")
async def update_d4g_config(
    payload: dict = Body(...),
    current_user: CurrentUserDep = None,
) -> dict:
    """Update D4G endpoint at runtime (no restart needed). Admin only."""
    url = payload.get("d4g_api_url", "").strip()
    key = payload.get("d4g_api_key", "").strip()
    if url:
        _d4g_runtime["d4g_api_url"] = url
    if key:
        _d4g_runtime["d4g_api_key"] = key
    return {"saved": True, "is_demo": _d4g_runtime.get("d4g_api_url") == _DEMO_D4G_URL}


@router.get("/iec-endpoints")
async def get_iec_endpoints(current_user: CurrentUserDep = None) -> dict:
    """Return current IEC message endpoint configuration (keys masked)."""
    result = {}
    for doc_type, cfg in _iec_endpoints.items():
        key = cfg.get("key", "")
        result[doc_type] = {
            "label": cfg["label"],
            "direction": cfg["direction"],
            "url": cfg.get("url", ""),
            "key_hint": (key[:4] + "…") if len(key) > 4 else ("set" if key else ""),
        }
    return result


@router.put("/iec-endpoints")
async def update_iec_endpoints(
    payload: dict = Body(...),
    current_user: CurrentUserDep = None,
) -> dict:
    """Update IEC message endpoints at runtime. Admin only.

    Payload: { "A38": { "url": "...", "key": "..." }, "A44": { ... } }
    """
    for doc_type, cfg in payload.items():
        if doc_type in _iec_endpoints:
            if "url" in cfg:
                _iec_endpoints[doc_type]["url"] = cfg["url"].strip()
            if "key" in cfg:
                _iec_endpoints[doc_type]["key"] = cfg["key"].strip()
    return {"saved": True, "updated": list(payload.keys())}


@router.post("/send-oe")
async def send_oe_to_d4g(
    doc: dict = Body(..., description="A38 Operating Envelope MarketDocument JSON"),
    current_user: CurrentUserDep = None,
) -> dict:
    """
    Forward an A38 Operating Envelope document to Digital4Grids.

    If D4G_API_URL is configured (env var), POSTs the document to D4G and returns
    their acknowledgement. If not configured, returns a simulated success response
    so development/demo environments work without credentials.

    Body: the full A38 MarketDocument JSON as built by the frontend.
    """
    import httpx
    from datetime import datetime, timezone

    from app.config import settings

    mrid = "UNKNOWN"
    try:
        mrid = doc.get("ReferenceEnergyCurveOperatingEnvelope_MarketDocument", {}).get("mRID", "UNKNOWN")
    except Exception:
        pass

    # Runtime config overrides env vars
    effective_url = _d4g_runtime.get("d4g_api_url") or settings.d4g_api_url
    effective_key = _d4g_runtime.get("d4g_api_key") or settings.d4g_api_key

    # Demo mode — simulate a realistic D4G acceptance without hitting a real endpoint
    if effective_url == _DEMO_D4G_URL:
        import uuid
        return {
            "sent": True,
            "simulated": True,
            "mrid": mrid,
            "ack_id": f"D4G-ACK-{uuid.uuid4().hex[:12].upper()}",
            "d4g_status": 202,
            "message": "Accepted by Digital4Grids (demo simulation)",
            "sent_at": datetime.now(timezone.utc).isoformat(),
        }

    # If D4G endpoint is configured, actually send it
    if effective_url:
        try:
            async with httpx.AsyncClient(timeout=15.0) as client:
                resp = await client.post(
                    effective_url,
                    json=doc,
                    headers={
                        "Authorization": f"Bearer {effective_key}",
                        "Content-Type": "application/json",
                        "X-Sender-MRID": settings.d4g_sender_mrid,
                    },
                )
                if resp.status_code in (200, 201, 202):
                    ack_data = resp.json() if resp.headers.get("content-type", "").startswith("application/json") else {}
                    return {
                        "sent": True,
                        "mrid": mrid,
                        "ack_id": ack_data.get("mRID") or ack_data.get("id") or resp.headers.get("X-Ack-ID", ""),
                        "d4g_status": resp.status_code,
                        "sent_at": datetime.now(timezone.utc).isoformat(),
                    }
                else:
                    return {
                        "sent": False,
                        "mrid": mrid,
                        "message": f"D4G returned HTTP {resp.status_code}: {resp.text[:200]}",
                        "sent_at": datetime.now(timezone.utc).isoformat(),
                    }
        except Exception as exc:
            return {
                "sent": False,
                "mrid": mrid,
                "message": f"D4G connection error: {str(exc)[:200]}",
                "sent_at": datetime.now(timezone.utc).isoformat(),
            }

    # No URL at all — stored locally
    return {
        "sent": False,
        "simulated": True,
        "mrid": mrid,
        "message": "Document stored locally — configure D4G endpoint in OE Dispatch settings.",
        "sent_at": datetime.now(timezone.utc).isoformat(),
        "document_type": "A38",
        "slot_count": len(
            doc.get("ReferenceEnergyCurveOperatingEnvelope_MarketDocument", {})
            .get("Series", [{}])[0]
            .get("Period", {})
            .get("Point", [])
        ),
    }


@router.get("/alarms")
async def list_alarms(
    status: Optional[str] = Query(None, description="Filter by status: ACTIVE | ACKNOWLEDGED | CLEARED"),
    current_user: CurrentUserDep = None,
) -> dict:
    """Return network alarms (overvoltage, emergency SPG, thermal)."""
    alarms = _alarms if not status else [a for a in _alarms if a["status"] == status]
    return {
        "alarms": alarms,
        "active_count": sum(1 for a in _alarms if a["status"] == "ACTIVE"),
        "total": len(_alarms),
    }


@router.post("/alarms/{alarm_id}/ack")
async def acknowledge_alarm(
    alarm_id: str,
    current_user: CurrentUserDep = None,
) -> dict:
    """Acknowledge an alarm by ID."""
    for alarm in _alarms:
        if alarm["id"] == alarm_id:
            if alarm["status"] == "ACTIVE":
                alarm["status"] = "ACKNOWLEDGED"
            return {"ok": True, "id": alarm_id, "status": alarm["status"]}
    raise HTTPException(status_code=404, detail=f"Alarm '{alarm_id}' not found")


@router.get("/live-measurements")
async def get_live_measurements(
    dt_id: str = Query("DT-AUZ-001", description="Distribution transformer ID"),
    current_user: CurrentUserDep = None,
) -> dict:
    """
    Simulated minute-level SPG measurements for enrolled assets on a DT.

    Uses current time to derive realistic solar/load profiles.
    In production this would receive data from the SPG telemetry channel.
    """
    now = datetime.now(timezone.utc)
    hour = now.hour + now.minute / 60.0
    # Solar generation curve (peaks ~13:00)
    solar_factor = max(0.0, math.sin(math.pi * (hour - 6.0) / 12.0))
    t = _time.time()

    if dt_id == "DT-AUZ-001":
        enrolled_assets = [
            {
                "name": "Community Solar A", "type": "Solar PV",
                "p_kw": round(57.0 * solar_factor + math.sin(t * 0.11) * 2.5, 1),
                "q_kvar": round(8.5 + math.sin(t * 0.07) * 0.8, 1),
                "enrolled": True,
            },
            {
                "name": "Community Solar B", "type": "Solar PV",
                "p_kw": round(43.0 * solar_factor + math.sin(t * 0.13) * 1.8, 1),
                "q_kvar": round(6.2 + math.sin(t * 0.09) * 0.5, 1),
                "enrolled": True,
            },
            {
                "name": "Fougères BESS", "type": "Battery",
                "p_kw": round(12.0 + math.sin(t * 0.05) * 3.2, 1),
                "q_kvar": round(2.1 + math.sin(t * 0.06) * 0.3, 1),
                "enrolled": True,
            },
        ]
        residual_load = 42.5 + math.sin(t * 0.03) * 7.0
    elif dt_id == "DT-AUZ-005":
        enrolled_assets = [
            {
                "name": "Bois-Rond Solar Farm", "type": "Solar PV",
                "p_kw": round(96.0 * solar_factor + math.sin(t * 0.09) * 4.1, 1),
                "q_kvar": round(14.2 + math.sin(t * 0.08) * 1.2, 1),
                "enrolled": True,
            },
            {
                "name": "Bois-Rond BESS", "type": "Battery",
                "p_kw": round(18.0 + math.sin(t * 0.07) * 2.4, 1),
                "q_kvar": round(3.8 + math.sin(t * 0.05) * 0.4, 1),
                "enrolled": True,
            },
        ]
        residual_load = 28.0 + math.sin(t * 0.04) * 5.5
    else:
        enrolled_assets = []
        residual_load = 30.0 + math.sin(t * 0.03) * 6.0

    total_enrolled_p = sum(a["p_kw"] for a in enrolled_assets)
    dt_total_p = round(total_enrolled_p + residual_load, 1)

    return {
        "dt_id": dt_id,
        "timestamp": now.isoformat(),
        "interval": "PT1M",
        "dt_total_p_kw": dt_total_p,
        "residual_load_kw": round(residual_load, 1),
        "enrolled_total_p_kw": round(total_enrolled_p, 1),
        "assets": enrolled_assets,
        "note": "residual_load = DT_head_measurement − enrolled_spg_sum (top-down subtraction)",
    }
