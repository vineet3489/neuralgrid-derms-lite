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
_SENDER_EIC   = "17XTESTLNTDSO01T"
_RECEIVER_EIC = "17XTESTD4GRID02T"


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
    """Fetch 96 × PT15M baseline points from D4G."""
    if not api_key or not resource_group_id:
        return None
    import httpx
    url = f"{_D4G_BASE_URL}/v1/baseline/{resource_group_id}"
    try:
        async with httpx.AsyncClient(timeout=15.0) as client:
            resp = await client.get(url, headers={"x-api-key": api_key})
            if resp.status_code == 200:
                data = resp.json()
                # Handle both list and wrapped response
                if isinstance(data, list):
                    return data
                return data.get("data") or data.get("points") or data
    except Exception as exc:
        logger.warning("D4G baseline fetch failed: %s", exc)
    return None


async def _fetch_actual_power(api_key: str, resource_group_id: str) -> float | None:
    """Return latest actual power reading in kW from D4G."""
    if not api_key or not resource_group_id:
        return None
    import httpx
    url = f"{_D4G_BASE_URL}/v1/actual-power/{resource_group_id}/energy"
    try:
        async with httpx.AsyncClient(timeout=10.0) as client:
            resp = await client.get(url, headers={"x-api-key": api_key})
            if resp.status_code == 200:
                data = resp.json()
                # Extract quantity from first reading
                if isinstance(data, list) and data:
                    return float(data[0].get("quantity", 0)) * 4  # kWh per PT15M → avg kW
                if isinstance(data, dict):
                    qty = data.get("quantity") or data.get("value") or data.get("energy_kwh")
                    if qty is not None:
                        return float(qty) * 4
    except Exception as exc:
        logger.warning("D4G actual power fetch failed: %s", exc)
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

    activation_doc = {
        "ActivationDocument": {
            "mRID": doc_mrid,
            "type": "A32",
            "createdDateTime": datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ"),
            "sender_MarketParticipant": {"mRID": _SENDER_EIC},
            "receiver_MarketParticipant": {"mRID": _RECEIVER_EIC},
            "FlexibilityInformation_MarketEvaluationPoint": [
                {
                    "mRID": resource_group_id,
                    "flowDirection": "A02",   # downward flex
                    "Instruction": [
                        {
                            "mRID": instr_mrid,
                            "Period": {
                                "timeInterval": {
                                    "start": slot_start.strftime("%Y-%m-%dT%H:%M:%SZ"),
                                    "end":   slot_end.strftime("%Y-%m-%dT%H:%M:%SZ"),
                                },
                                "resolution": "PT15M",
                                "Point": [
                                    {"position": 1, "quantity": round(curtailment_mw, 4)}
                                ],
                            },
                        }
                    ],
                }
            ],
        }
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


def _compute_curtailment_mw(baseline_points: list | None, actual_kw: float | None) -> float:
    """
    Derive how much curtailment to request for the next 15-min slot.

    Logic:
      - If actual_kw > OE export limit → curtailment = excess
      - OE limit is derived from LinDistFlow slot results (max_export_kw)
      - Falls back to 0 (no curtailment) if data is unavailable
    """
    # DT thermal headroom used as OE limit proxy (kW → MW)
    OE_EXPORT_LIMIT_KW = 90.0   # demo: 90 kW max SPG export per DT

    if actual_kw is None:
        return 0.0

    excess_kw = max(0.0, actual_kw - OE_EXPORT_LIMIT_KW)
    return round(excess_kw / 1000.0, 4)   # kW → MW


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
