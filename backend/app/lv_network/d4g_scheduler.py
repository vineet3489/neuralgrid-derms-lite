"""
D4G 15-minute scheduler.

Every 15 minutes:
  1. Fetch baseline (aggregator flex forecast) from D4G
  2. Fetch latest actual power reading from D4G
  3. Run LinDistFlow for the next PT15M slot
  4. Compute curtailment headroom
  5. Build ActivationDocument (A32) and POST to D4G /v1/activation
  6. Store result in _scheduler_state for UI polling

All D4G credentials come from runtime config (routes._d4g_runtime) or env vars.
"""
from __future__ import annotations

import asyncio
import logging
import os
import uuid
from datetime import datetime, timedelta, timezone
from typing import Any, Optional

logger = logging.getLogger(__name__)

# ---------------------------------------------------------------------------
# Scheduler state — UI polls GET /d4g/scheduler-status
# ---------------------------------------------------------------------------

_scheduler_state: dict[str, Any] = {
    "running": False,
    "last_run_at": None,          # ISO string
    "next_run_at": None,          # ISO string
    "last_activation_sent": None, # True / False / None (not yet run)
    "last_activation_at": None,   # ISO string
    "last_ack_id": None,
    "last_curtailment_mw": None,
    "last_d4g_status": None,
    "last_error": None,
    "baseline_points": None,      # 96 × PT15M fetched from D4G
    "actual_power_kw": None,
    "resource_group_id": None,
    "run_count": 0,
}

# D4G live endpoint constants
_D4G_BASE_URL = "https://lnt.digital4grids.com"
_SENDER_EIC   = os.environ.get("D4G_SENDER_EIC",   "17XTESTLNTDSO01T")  # LNT DSO
_RECEIVER_EIC = os.environ.get("D4G_RECEIVER_EIC", "17XTESTD4GSO01T")   # D4G Aggregator


def _get_d4g_creds() -> tuple[str, str]:
    """Return (api_url_base, api_key) from runtime overrides or env vars."""
    # Import lazily to avoid circular imports
    try:
        from app.lv_network.routes import _d4g_runtime
        key = _d4g_runtime.get("d4g_api_key") or os.environ.get("D4G_API_KEY", "")
        rg  = _d4g_runtime.get("resource_group_id") or os.environ.get("D4G_RESOURCE_GROUP_ID", "")
    except Exception:
        key = os.environ.get("D4G_API_KEY", "")
        rg  = os.environ.get("D4G_RESOURCE_GROUP_ID", "")
    return key, rg


def _next_quarter(now: datetime) -> datetime:
    """Return the start of the next full 15-minute boundary after *now*."""
    minutes = (now.minute // 15 + 1) * 15
    base = now.replace(second=0, microsecond=0)
    return base + timedelta(minutes=minutes - now.minute)


async def _fetch_baseline(api_key: str, resource_group_id: str) -> list[dict] | None:
    """
    Fetch 96 × PT15M baseline points from D4G.
    Returns normalised [{position, timestamp_utc, kwh, kw}, ...].
    """
    if not api_key or not resource_group_id:
        return None
    import httpx
    from datetime import timedelta
    url = f"{_D4G_BASE_URL}/v1/baseline/{resource_group_id}"
    try:
        async with httpx.AsyncClient(timeout=15.0) as client:
            resp = await client.get(url, headers={"x-api-key": api_key})
            if resp.status_code != 200:
                return None
            data = resp.json()
            # Navigate IEC CIM nested path
            doc    = data["ReferenceEnergyCurveBaselineNotification_MarketDocument"]
            period = doc["Series"][0]["Series"][0]["Period"][0]
            t0     = datetime.fromisoformat(period["timeInterval"]["start"].replace("Z", "+00:00"))
            points = []
            for p in period["Point"]:
                pos = int(p["position"])
                kwh = float(p["Baseline_Quantity"]["quantity"])
                points.append({
                    "position": pos,
                    "timestamp_utc": (t0 + timedelta(minutes=(pos - 1) * 15)).strftime("%Y-%m-%dT%H:%M:%SZ"),
                    "kwh": kwh,
                    "kw": round(kwh * 4, 4),
                })
            return points
    except Exception as exc:
        logger.warning("D4G baseline fetch/parse failed: %s", exc)
    return None


async def _fetch_actual_power(api_key: str, resource_group_id: str) -> float | None:
    """
    Return latest actual power reading in kW from D4G /v1/actual-power/{rg}/energy.
    Parses IEC CIM ReferenceEnergyCurveHistoricalData_MarketDocument.
    """
    if not api_key or not resource_group_id:
        return None
    import httpx
    url = f"{_D4G_BASE_URL}/v1/actual-power/{resource_group_id}/energy"
    try:
        async with httpx.AsyncClient(timeout=10.0) as client:
            resp = await client.get(url, params={"window": "latest", "resolution": "15m", "power_unit": "kW"},
                                    headers={"x-api-key": api_key})
            if resp.status_code != 200:
                return None
            data = resp.json()
            doc    = data["ReferenceEnergyCurveHistoricalData_MarketDocument"]
            points = doc["Series"][0]["Series"][0]["Period"][0]["Point"]
            if points:
                kwh = float(points[-1]["Historical_Quantity"]["quantity"])
                return round(kwh * 4, 3)   # kWh per PT15M → avg kW
    except Exception as exc:
        logger.warning("D4G actual power fetch/parse failed: %s", exc)
    return None


async def _send_activation(
    api_key: str,
    resource_group_id: str,
    curtailment_mw: float,
    slot_start: datetime,
) -> dict:
    """
    Build an A32 ActivationDocument and POST to D4G /v1/activation.

    curtailment_mw: positive = downward flex request (export curtailment).
                    0 = no curtailment needed — still sends with quantity=0 as heartbeat.
    """
    if not api_key or not resource_group_id:
        return {"sent": False, "simulated": True, "message": "No D4G credentials configured"}

    import httpx

    slot_end = slot_start + timedelta(minutes=15)
    doc_mrid = str(uuid.uuid4())
    instr_mrid = str(uuid.uuid4())

    fmt = "%Y-%m-%dT%H:%M:%S.000+00:00"
    # Exact D4G /v1/activation spec — validated live 2026-06-02
    activation_doc = {
        "mRID": doc_mrid,
        "type": "A32",
        "businessType": "B83",
        "createdDateTime": datetime.now(timezone.utc).strftime(fmt),
        "flowDirection": [{"direction": "A02"}],
        "SenderMarketParticipant": {
            "mRID": _SENDER_EIC,
            "MarketRole": {"roleType": "A04"},     # A04 = DSO
        },
        "ReceiverMarketParticipant": {
            "mRID": _RECEIVER_EIC,
            "MarketRole": {"roleType": "A27"},     # A27 = Aggregator
        },
        "TimeSeries": {                             # object, not array
            "mRID": instr_mrid,
            "marketEvaluationPoint.mRID": resource_group_id,
            "FlowDirection": {"direction": "A02"},
            "MeasurementUnit": {"name": "MAW"},
            "TimeInterval": {
                "start": slot_start.strftime(fmt),
                "end":   slot_end.strftime(fmt),
            },
            "Period": {
                "resolution": "PT15M",
                "Point": [{"position": 1, "quantity": str(round(curtailment_mw, 4))}],
            },
        },
    }

    try:
        async with httpx.AsyncClient(timeout=15.0) as client:
            resp = await client.post(
                f"{_D4G_BASE_URL}/v1/activation",
                json=activation_doc,
                headers={
                    "x-api-key": api_key,
                    "Content-Type": "application/json",
                },
            )
            ack_data = {}
            try:
                ack_data = resp.json()
            except Exception:
                pass

            return {
                "sent": resp.status_code in (200, 201, 202),
                "d4g_status": resp.status_code,
                "ack_id": ack_data.get("mRID") or ack_data.get("id") or doc_mrid[:12],
                "curtailment_mw": curtailment_mw,
                "slot_start": slot_start.isoformat(),
                "message": ack_data.get("message") or f"HTTP {resp.status_code}",
            }
    except Exception as exc:
        return {
            "sent": False,
            "message": f"Connection error: {str(exc)[:120]}",
            "curtailment_mw": curtailment_mw,
        }


def _get_oe_limit_kw_for_next_slot() -> float:
    """
    Return the OE export limit (kW) for the current/next 15-min slot from LinDistFlow.
    Falls back to 90 kW if backend is unavailable.
    """
    try:
        from app.lv_network.lindistflow_oe import compute_lindistflow_oe_48slots
        result = compute_lindistflow_oe_48slots("DT-AUZ-001")
        slots  = result.get("slots", [])
        if not slots:
            return 90.0
        # Find slot closest to current UTC time
        now_slot = (datetime.now(timezone.utc).hour * 2 + (1 if datetime.now(timezone.utc).minute >= 30 else 0))
        slot = slots[min(now_slot, len(slots) - 1)]
        return float(slot.get("quantity_Maximum", 90.0))
    except Exception:
        return 90.0   # safe fallback


def _compute_curtailment_mw(baseline_points: list | None, actual_kw: float | None) -> float:
    """
    Derive curtailment for the next 15-min slot.
    If actual SPG generation > OE export limit → curtailment = excess kW → MW.
    If actual <= limit → 0 (no curtailment needed).
    """
    if actual_kw is None:
        return 0.0
    oe_limit_kw = _get_oe_limit_kw_for_next_slot()
    excess_kw   = max(0.0, actual_kw - oe_limit_kw)
    return round(excess_kw / 1000.0, 6)   # kW → MW


async def run_d4g_cycle() -> None:
    """Execute one D4G 15-minute cycle: fetch → compute → activate."""
    api_key, resource_group_id = _get_d4g_creds()

    _scheduler_state["running"] = True
    _scheduler_state["resource_group_id"] = resource_group_id
    _scheduler_state["last_error"] = None

    now = datetime.now(timezone.utc)
    slot_start = _next_quarter(now)

    try:
        # 1. Fetch baseline & actual power in parallel
        baseline, actual_kw = await asyncio.gather(
            _fetch_baseline(api_key, resource_group_id),
            _fetch_actual_power(api_key, resource_group_id),
        )

        _scheduler_state["baseline_points"] = baseline
        _scheduler_state["actual_power_kw"] = actual_kw

        # 2. Compute curtailment
        curtailment_mw = _compute_curtailment_mw(baseline, actual_kw)
        _scheduler_state["last_curtailment_mw"] = curtailment_mw

        # 3. Send activation
        result = await _send_activation(api_key, resource_group_id, curtailment_mw, slot_start)

        _scheduler_state["last_activation_sent"] = result.get("sent", False)
        _scheduler_state["last_activation_at"] = now.isoformat()
        _scheduler_state["last_ack_id"] = result.get("ack_id")
        _scheduler_state["last_d4g_status"] = result.get("d4g_status")
        _scheduler_state["run_count"] += 1

        logger.info(
            "D4G cycle complete — curtailment=%.4f MW, sent=%s, status=%s",
            curtailment_mw,
            result.get("sent"),
            result.get("d4g_status"),
        )
    except Exception as exc:
        _scheduler_state["last_error"] = str(exc)[:200]
        logger.error("D4G scheduler cycle error: %s", exc)
    finally:
        _scheduler_state["running"] = False
        _scheduler_state["last_run_at"] = now.isoformat()
        next_run = _next_quarter(datetime.now(timezone.utc))
        _scheduler_state["next_run_at"] = next_run.isoformat()


async def d4g_scheduler_loop() -> None:
    """
    Long-running asyncio task.  Fires at each 15-min boundary (HH:00, HH:15, HH:30, HH:45).
    Sleeps until the next boundary rather than using a fixed interval so it stays aligned.
    """
    logger.info("D4G scheduler loop started.")
    # Set initial next_run timestamp
    next_run = _next_quarter(datetime.now(timezone.utc))
    _scheduler_state["next_run_at"] = next_run.isoformat()

    while True:
        now = datetime.now(timezone.utc)
        next_run = _next_quarter(now)
        sleep_secs = (next_run - now).total_seconds()
        if sleep_secs < 0:
            sleep_secs = 0

        _scheduler_state["next_run_at"] = next_run.isoformat()
        logger.debug("D4G scheduler sleeping %.0fs until %s", sleep_secs, next_run.isoformat())
        await asyncio.sleep(sleep_secs)

        await run_d4g_cycle()
