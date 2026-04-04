"""
Powsybl power flow service for the Auzances 250 kVA 3-branch LV demo network.

Uses pypowsybl (open-source, RTE France) to run an AC load flow on a
radial 400V network: 1 slack bus (DT secondary) + 3 radial branches (A, B, C).

Network parameters from the Auzances reference LV model:
  - 250 kVA transformer, 20kV/400V, tap ratio 1:1 for LV base
  - Branch A: 21 households, 98 kW base load, 461m cable
  - Branch B: 34 households, 129 kW base load, 715m cable  ← EV congestion
  - Branch C: 10 households, 68 kW base load, 185m cable
  - Cable: 95mm² XLPE, r=0.25 Ω/km, x=0.08 Ω/km, ampacity=300A

EV surge scenario (Branch B):
  - 3 EV fast chargers: 120 + 110 + 120 = 350 kW additional
  - Total Branch B: 479 kW → 213% of DT thermal limit (225 kW)

Fallback: if pypowsybl is not available, returns analytically computed results
using the same Baran-Wu DistFlow equations (identical for radial networks).
"""
from __future__ import annotations

import math
import logging
from typing import Optional

logger = logging.getLogger(__name__)

# Network constants
DT_RATING_KVA = 250.0
DT_POWER_FACTOR = 0.9
DT_THERMAL_LIMIT_KW = DT_RATING_KVA * DT_POWER_FACTOR  # 225 kW
V_NOMINAL_KV = 0.4  # 400V LV base
V_NOMINAL_V = 400.0
V_PHASE_V = 220.0

# Voltage limits (per-unit)
V_MIN_PU = 0.94
V_MAX_PU = 1.06
V_EMERGENCY_MIN_PU = 0.90
V_EMERGENCY_MAX_PU = 1.10

# Cable parameters: 95mm² XLPE 400V
CABLE_R_OHM_PER_KM = 0.25
CABLE_X_OHM_PER_KM = 0.08

# Branch definitions [id, phase, households, base_load_kw, length_m, ampacity_a]
BRANCHES = [
    {"id": "BR-A", "phase": "A", "households": 21, "base_load_kw": 98.0,  "length_m": 461.0, "ampacity_a": 300.0},
    {"id": "BR-B", "phase": "B", "households": 34, "base_load_kw": 129.0, "length_m": 715.0, "ampacity_a": 300.0},
    {"id": "BR-C", "phase": "C", "households": 10, "base_load_kw": 68.0,  "length_m": 185.0, "ampacity_a": 200.0},
]

# EV surge: 3 fast chargers on Branch B
EV_CHARGERS = [
    {"id": "EVC-B01", "label": "EV Charger 1 (Chemin des Acacias)", "branch_id": "BR-B", "kw": 120.0},
    {"id": "EVC-B02", "label": "EV Charger 2 (Rue de Bellevue)",    "branch_id": "BR-B", "kw": 110.0},
    {"id": "EVC-B03", "label": "EV Charger 3 (Hameau du Gué)",      "branch_id": "BR-B", "kw": 120.0},
]


def _build_branch_data(ev_surge: bool) -> list[dict]:
    """Compute branch loads for normal or EV surge scenario."""
    branch_data = []
    for br in BRANCHES:
        load_kw = br["base_load_kw"]
        ev_kw = 0.0
        ev_detail = []
        if ev_surge and br["id"] == "BR-B":
            for ev in EV_CHARGERS:
                ev_kw += ev["kw"]
                ev_detail.append(ev)
        total_kw = load_kw + ev_kw
        # R, X for this branch segment
        length_km = br["length_m"] / 1000.0
        r_ohm = length_km * CABLE_R_OHM_PER_KM
        x_ohm = length_km * CABLE_X_OHM_PER_KM
        branch_data.append({
            **br,
            "total_load_kw": total_kw,
            "ev_load_kw": ev_kw,
            "ev_chargers": ev_detail,
            "r_ohm": r_ohm,
            "x_ohm": x_ohm,
        })
    return branch_data


def _distflow_solve(branches: list[dict], v_slack_pu: float = 1.0) -> list[dict]:
    """
    Solve radial distribution power flow using Baran-Wu (1989) DistFlow.
    For a star topology (all branches connected directly to DT secondary bus),
    each branch is independent — one iteration suffices.

    Returns per-branch results: voltage at end bus, current, loading %, losses.
    """
    results = []
    for br in branches:
        p_kw = br["total_load_kw"]
        q_kvar = p_kw * math.tan(math.acos(DT_POWER_FACTOR))  # PF=0.9
        r = br["r_ohm"]
        x = br["x_ohm"]
        v_base_v = V_NOMINAL_V  # 400V line-to-line
        v_base_sq = v_base_v ** 2

        # DistFlow voltage drop: ΔV² = 2(R·P + X·Q) / V_base²  (in volt² per kW units)
        delta_v_sq = 2.0 * (r * p_kw * 1000.0 + x * q_kvar * 1000.0) / v_base_sq
        v_end_sq = max(v_slack_pu ** 2 - delta_v_sq, 0.01)
        v_end_pu = math.sqrt(v_end_sq)
        v_end_v = v_end_pu * v_base_v

        # Branch current (3-phase)
        s_kva = math.sqrt(p_kw ** 2 + q_kvar ** 2)
        i_ka = (s_kva * 1000.0) / (math.sqrt(3) * v_base_v)
        i_a = i_ka * 1000.0
        loading_pct = (i_a / br["ampacity_a"]) * 100.0

        # Losses
        loss_kw = r * (i_ka * 1000.0) ** 2 / 1000.0

        # Voltage status
        if v_end_pu < V_EMERGENCY_MIN_PU or v_end_pu > V_EMERGENCY_MAX_PU:
            v_status = "CRITICAL"
        elif v_end_pu < V_MIN_PU:
            v_status = "LOW"
        elif v_end_pu > V_MAX_PU:
            v_status = "HIGH"
        else:
            v_status = "NORMAL"

        results.append({
            "branch_id": br["id"],
            "phase": br["phase"],
            "households": br["households"],
            "length_m": br["length_m"],
            "base_load_kw": br["base_load_kw"],
            "ev_load_kw": br["ev_load_kw"],
            "ev_chargers": br.get("ev_chargers", []),
            "total_load_kw": round(p_kw, 1),
            "total_load_mw": round(p_kw / 1000.0, 6),
            "v_end_pu": round(v_end_pu, 4),
            "v_end_v": round(v_end_v, 1),
            "v_dt_pu": round(v_slack_pu, 4),
            "i_a": round(i_a, 1),
            "ampacity_a": br["ampacity_a"],
            "loading_pct": round(loading_pct, 1),
            "loss_kw": round(loss_kw, 2),
            "voltage_status": v_status,
            "thermal_status": "CRITICAL" if loading_pct > 100 else "WARNING" if loading_pct > 75 else "NORMAL",
        })

    return results


def _try_pypowsybl(branches: list[dict]) -> Optional[list[dict]]:
    """
    Attempt to run Powsybl OpenLoadFlow. Returns branch results or None if unavailable.

    Builds the network programmatically using pypowsybl API:
    - Slack bus = DT 400V secondary (v=1.0 pu, angle=0)
    - One bus per branch + one load per branch
    - Star topology: DT → BR-A, DT → BR-B, DT → BR-C
    """
    try:
        import pypowsybl.network as pn
        import pypowsybl as pp
        import pandas as pd
    except ImportError:
        logger.info("pypowsybl not available — using DistFlow solver")
        return None

    try:
        # Build empty network
        n = pn.create_empty("auzance-lv-250kva")

        # Substation + voltage levels
        n.create_substations(id="SUB-AUZ", country="FR")
        n.create_voltage_levels(
            id="VL-LV", substation_id="SUB-AUZ",
            nominal_v=400.0, topology_kind="BUS_BREAKER",
            low_voltage_limit=370.0, high_voltage_limit=440.0,
        )

        # DT secondary bus (slack)
        n.create_buses(id="BUS-DT", voltage_level_id="VL-LV")
        # Branch end buses
        for br in branches:
            n.create_buses(id=f"BUS-{br['id']}", voltage_level_id="VL-LV")

        # Slack generator on DT bus (voltage source)
        n.create_generators(
            id="GEN-SLACK", voltage_level_id="VL-LV", bus_id="BUS-DT",
            min_p=-1000.0, max_p=1000.0, target_p=0.0,
            voltage_regulator_on=True, target_v=400.0,
        )

        # Lines (one per branch, DT → branch end bus)
        for br in branches:
            r = br["r_ohm"]
            x = br["x_ohm"]
            n.create_lines(
                id=f"LINE-{br['id']}",
                voltage_level1_id="VL-LV", bus1_id="BUS-DT",
                voltage_level2_id="VL-LV", bus2_id=f"BUS-{br['id']}",
                r=r, x=x, g1=0.0, b1=0.0, g2=0.0, b2=0.0,
            )

        # Loads (one per branch)
        for br in branches:
            p_mw = br["total_load_kw"] / 1000.0
            q_mvar = p_mw * math.tan(math.acos(DT_POWER_FACTOR))
            n.create_loads(
                id=f"LOAD-{br['id']}", voltage_level_id="VL-LV",
                bus_id=f"BUS-{br['id']}",
                p0=p_mw, q0=q_mvar,
            )

        # Run OpenLoadFlow (AC load flow)
        parameters = pp.loadflow.Parameters(
            voltage_init_mode=pp.loadflow.VoltageInitMode.DC_VALUES,
            distributed_slack=False,
        )
        result = pp.loadflow.run_ac(n, parameters=parameters)

        if not result[0].ok:
            logger.warning("Powsybl load flow did not converge — falling back to DistFlow")
            return None

        # Extract results
        buses_df = n.get_buses()
        lines_df = n.get_lines()

        branch_results = []
        for br in branches:
            bus_id = f"BUS-{br['id']}"
            line_id = f"LINE-{br['id']}"

            v_pu = float(buses_df.loc[bus_id, "v_mag"]) / 400.0 if bus_id in buses_df.index else 1.0
            v_v = v_pu * 400.0

            # Line current from sending-end apparent power
            p1 = float(lines_df.loc[line_id, "p1"]) if line_id in lines_df.index else br["total_load_kw"] / 1000.0
            q1 = float(lines_df.loc[line_id, "q1"]) if line_id in lines_df.index else 0.0
            s_mva = math.sqrt(p1 ** 2 + q1 ** 2)
            i_a = (s_mva * 1e6) / (math.sqrt(3) * 400.0)
            loading_pct = (i_a / br["ampacity_a"]) * 100.0

            p2 = float(lines_df.loc[line_id, "p2"]) if line_id in lines_df.index else -br["total_load_kw"] / 1000.0
            loss_kw = (abs(p1) - abs(p2)) * 1000.0

            if v_pu < V_EMERGENCY_MIN_PU or v_pu > V_EMERGENCY_MAX_PU:
                v_status = "CRITICAL"
            elif v_pu < V_MIN_PU:
                v_status = "LOW"
            elif v_pu > V_MAX_PU:
                v_status = "HIGH"
            else:
                v_status = "NORMAL"

            branch_results.append({
                "branch_id": br["id"],
                "phase": br["phase"],
                "households": br["households"],
                "length_m": br["length_m"],
                "base_load_kw": br["base_load_kw"],
                "ev_load_kw": br["ev_load_kw"],
                "ev_chargers": br.get("ev_chargers", []),
                "total_load_kw": round(br["total_load_kw"], 1),
                "total_load_mw": round(br["total_load_kw"] / 1000.0, 6),
                "v_end_pu": round(v_pu, 4),
                "v_end_v": round(v_v, 1),
                "v_dt_pu": 1.0,
                "i_a": round(i_a, 1),
                "ampacity_a": br["ampacity_a"],
                "loading_pct": round(loading_pct, 1),
                "loss_kw": round(abs(loss_kw), 2),
                "voltage_status": v_status,
                "thermal_status": "CRITICAL" if loading_pct > 100 else "WARNING" if loading_pct > 75 else "NORMAL",
            })

        return branch_results

    except Exception as exc:
        logger.warning("Powsybl load flow failed: %s — falling back to DistFlow", exc)
        return None


def run_auzance_power_flow(ev_surge: bool = False) -> dict:
    """
    Run power flow on the Auzances 250 kVA 3-branch LV network.

    Tries Powsybl (pypowsybl OpenLoadFlow) first. Falls back to analytical
    DistFlow if pypowsybl is unavailable or fails.

    Args:
        ev_surge: If True, adds 3 EV fast chargers to Branch B (350 kW total)

    Returns:
        Dict with: engine, converged, scenario, summary, branches, violations
    """
    branch_data = _build_branch_data(ev_surge=ev_surge)

    # Try Powsybl first
    branch_results = _try_pypowsybl(branch_data)
    engine = "Powsybl OpenLoadFlow"
    if branch_results is None:
        branch_results = _distflow_solve(branch_data)
        engine = "DistFlow (Baran-Wu 1989)"

    total_load_kw = sum(br["total_load_kw"] for br in branch_results)
    total_loss_kw = sum(br["loss_kw"] for br in branch_results)
    dt_loading_pct = (total_load_kw / DT_THERMAL_LIMIT_KW) * 100.0
    dt_status = "CRITICAL" if dt_loading_pct > 100 else "WARNING" if dt_loading_pct > 75 else "NORMAL"

    violations = [
        br for br in branch_results
        if br["voltage_status"] != "NORMAL" or br["thermal_status"] != "NORMAL"
    ]

    return {
        "engine": engine,
        "converged": True,
        "scenario": "ev_surge" if ev_surge else "normal",
        "dt": {
            "id": "DT-AUZ-001",
            "name": "Auzances LV Substation",
            "rating_kva": DT_RATING_KVA,
            "thermal_limit_kw": DT_THERMAL_LIMIT_KW,
            "total_load_kw": round(total_load_kw, 1),
            "total_loss_kw": round(total_loss_kw, 2),
            "loading_pct": round(dt_loading_pct, 1),
            "status": dt_status,
            "v_lv_nominal_v": V_NOMINAL_V,
            "v_phase_nominal_v": V_PHASE_V,
        },
        "branches": branch_results,
        "violations": violations,
        "violation_count": len(violations),
        "ev_surge": ev_surge,
        "ev_chargers": EV_CHARGERS if ev_surge else [],
    }
