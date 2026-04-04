"""
LinDistFlow 48-slot Operating Envelope calculator for the Auzances 250 kVA demo network.

LinDistFlow (Baran-Wu linearised, 1989) is the industry-standard method used by
real DNSPs (SAPN, AusNet, WPD) for day-ahead OE batch computation.  It linearises
voltage around nominal (1.0 pu) so each 48-slot batch runs in <5 ms total.

Two-tier OE:
  - quantity_Maximum  (kW) = max consumption the aggregator's SPG can draw
    before DT thermal or end-of-feeder voltage is violated
  - quantity_Minimum  (kW) = max reverse flow (solar export) — negative value

Constraints checked per slot:
  1. DT thermal: Σ branch loads ≤ 225 kW  (250 kVA × 0.9 pf)
  2. DT reverse: reverse flow ≤ 90 kW
  3. Voltage:    V_end for each branch ≥ 0.94 pu  (376 V on 400 V base)
                 V_end for each branch ≤ 1.06 pu  (424 V)

Network constants (Auzances LV, 95mm² XLPE cable):
  R = 0.25 Ω/km,  X = 0.08 Ω/km,  PF = 0.9  (tan φ ≈ 0.484)

Diurnal load profile:
  - Weekday-style residential curve: low overnight, morning/evening peaks
  - EV surge: slots 36-44 (18:00–22:00) add 350 kW to Branch B
"""
from __future__ import annotations

import math
from datetime import datetime, timedelta, timezone
from typing import Any

# ── Network constants ─────────────────────────────────────────────────────────
DT_THERMAL_LIMIT_KW = 225.0          # 250 kVA × 0.9 pf
DT_REVERSE_LIMIT_KW = 90.0           # max reverse export to MV grid
V_NOM_V = 400.0                      # LV line-to-line nominal
V_PHASE_NOM_V = 230.0
# French LV statutory operating limit: 230V ±10% phase = 207-253V phase
# = 360-440V line-to-line → 0.90–1.10 pu (IEC 60038 / EN 50160)
V_MIN_PU = 0.90
V_MAX_PU = 1.10
POWER_FACTOR = 0.9
TAN_PHI = math.tan(math.acos(POWER_FACTOR))  # ≈ 0.484

# Branch definitions
# base_kw = typical mid-day residential load (average demand, not peak instantaneous).
# The PowerFlow page shows the worst-case peak (98/129/68 kW); the OE is built on
# the scheduled day-ahead average with the diurnal curve scaling up to peak.
_BRANCHES = [
    {"id": "BR-A", "phase": "A", "hh": 21, "base_kw": 46.0,  "len_m": 461.0, "amp": 300.0},
    {"id": "BR-B", "phase": "B", "hh": 34, "base_kw": 58.0,  "len_m": 715.0, "amp": 300.0},
    {"id": "BR-C", "phase": "C", "hh": 10, "base_kw": 27.0,  "len_m": 185.0, "amp": 200.0},
]
# Total average base = 131 kW = 58% of DT thermal limit
# Peak multiplier (1.7) brings this to ~223 kW ≈ 99% of limit before EV surge

CABLE_R = 0.25   # Ω/km
CABLE_X = 0.08   # Ω/km

# EV surge: 3 fast chargers on BR-B, slots 36-44 (18:00–22:00)
EV_SURGE_KW = 350.0
EV_SURGE_BRANCH = "BR-B"
EV_SURGE_SLOT_START = 36   # inclusive (0-indexed)
EV_SURGE_SLOT_END = 44     # exclusive

# ── Diurnal load multiplier (48 × 30-min slots, index 0 = 00:00) ─────────────
# Residential weekday profile — multiplier on base_kw above.
# At peak multiplier 1.70, BR-B reaches ~99 kW (≈76% of 129 kW PowerFlow peak).
# EV surge is added as a fixed block on top of the diurnal-scaled base load.
_DIURNAL = [
    0.55, 0.50, 0.48, 0.45, 0.45, 0.48,   # 00:00–03:00  (overnight low)
    0.55, 0.70, 0.95, 1.05, 1.00, 0.95,   # 03:00–06:00  (morning peak)
    0.90, 0.88, 0.85, 0.85, 0.85, 0.88,   # 06:00–09:00  (mid-morning)
    0.90, 0.95, 0.95, 0.92, 0.88, 0.85,   # 09:00–12:00  (late morning)
    0.85, 0.85, 0.88, 0.90, 0.95, 1.00,   # 12:00–15:00  (afternoon ramp)
    1.10, 1.20, 1.35, 1.45, 1.55, 1.65,   # 15:00–18:00  (evening ramp)
    1.70, 1.70, 1.65, 1.60, 1.55, 1.50,   # 18:00–21:00  (EV surge window)
    1.40, 1.20, 1.00, 0.85, 0.72, 0.62,   # 21:00–24:00  (wind-down)
]
assert len(_DIURNAL) == 48, "Diurnal table must have exactly 48 entries"


# ── LinDistFlow core ──────────────────────────────────────────────────────────

def _lindistflow_branch(load_kw: float, r_ohm: float, x_ohm: float) -> dict:
    """
    LinDistFlow (linearised around V_nom = 1.0 pu) for a single radial branch.

    ΔV ≈ (R·P + X·Q) / V_nom          [Volts, linear approximation]
    V_end ≈ V_nom - ΔV

    Returns voltage at end bus and branch current/loading.
    """
    p_w = load_kw * 1000.0
    q_var = p_w * TAN_PHI

    delta_v = (r_ohm * p_w + x_ohm * q_var) / V_NOM_V   # Volts
    v_end_v = V_NOM_V - delta_v
    v_end_pu = v_end_v / V_NOM_V

    # Current (3-phase)
    s_va = math.sqrt(p_w ** 2 + q_var ** 2)
    i_a = s_va / (math.sqrt(3) * V_NOM_V)

    return {
        "v_end_v": round(v_end_v, 1),
        "v_end_pu": round(v_end_pu, 4),
        "i_a": round(i_a, 1),
        "delta_v_v": round(delta_v, 2),
    }


def _voltage_headroom_kw(current_load_kw: float, r_ohm: float, x_ohm: float) -> tuple[float, float]:
    """
    Compute how much additional load (positive) or reverse flow (negative)
    is possible on a branch before a voltage limit is hit.

    Returns (max_additional_load_kw, max_additional_reverse_kw) — both positive.

    LinDistFlow: V_end = V_nom - (R·P + X·Q)/V_nom  where Q = P·tan(φ)
    → P_max such that V_end = V_MIN_PU * V_nom:
         (R + X·tan_φ)·P_max/V_nom = V_nom - V_MIN_V
         P_max = (V_nom - V_MIN_V) * V_nom / (R + X·tan_φ)   [Watts]
    → Headroom = P_max - current_load
    """
    coeff = r_ohm + x_ohm * TAN_PHI  # (R + X·tan_φ) W/V

    v_min_v = V_MIN_PU * V_NOM_V
    v_max_v = V_MAX_PU * V_NOM_V

    # Max load before undervoltage (adding load lowers voltage)
    p_max_w = (V_NOM_V - v_min_v) * V_NOM_V / coeff
    max_add_load = max(0.0, (p_max_w - current_load_kw * 1000.0) / 1000.0)

    # Max reverse flow before overvoltage (reverse flow raises voltage)
    # V_end = V_nom + (R·P_rev + X·Q_rev)/V_nom ≤ V_MAX_V
    # P_rev_max = (V_MAX_V - V_nom) * V_nom / coeff
    p_rev_max_w = (v_max_v - V_NOM_V) * V_NOM_V / coeff
    max_rev = max(0.0, p_rev_max_w / 1000.0)

    return max_add_load, max_rev


def compute_lindistflow_oe_48slots(dt_id: str = "DT-AUZ-001") -> list[dict[str, Any]]:
    """
    Compute 48-slot day-ahead Operating Envelope for the Auzances demo network
    using LinDistFlow.

    Each slot is a 30-minute interval starting at midnight UTC today.
    Returns a list of 48 OEPoint-compatible dicts.
    """
    now = datetime.now(tz=timezone.utc).replace(hour=0, minute=0, second=0, microsecond=0)
    slots: list[dict[str, Any]] = []

    for i in range(48):
        t = now + timedelta(minutes=30 * i)
        time_str = t.strftime("%H:%M")
        mult = _DIURNAL[i]

        # Per-branch loads for this slot
        branch_loads: dict[str, float] = {}
        for br in _BRANCHES:
            load = br["base_kw"] * mult
            # EV surge on Branch B during 18:00–22:00
            if br["id"] == EV_SURGE_BRANCH and EV_SURGE_SLOT_START <= i < EV_SURGE_SLOT_END:
                load += EV_SURGE_KW
            branch_loads[br["id"]] = round(load, 1)

        total_load_kw = sum(branch_loads.values())

        # LinDistFlow per branch
        branch_pf: dict[str, dict] = {}
        for br in _BRANCHES:
            len_km = br["len_m"] / 1000.0
            r = len_km * CABLE_R
            x = len_km * CABLE_X
            pf = _lindistflow_branch(branch_loads[br["id"]], r, x)
            branch_pf[br["id"]] = {**pf, "load_kw": branch_loads[br["id"]], "amp": br["amp"]}

        # Minimum voltage across all branches (worst-case constraint)
        min_v_end_pu = min(b["v_end_pu"] for b in branch_pf.values())
        max_loading_pct = max(
            (b["i_a"] / b["amp"]) * 100.0 for b in branch_pf.values()
        )

        # OE thermal headroom
        thermal_headroom_kw = DT_THERMAL_LIMIT_KW - total_load_kw

        # Voltage headroom: worst branch (BR-B, longest, most loaded)
        worst_br = max(_BRANCHES, key=lambda b: branch_loads[b["id"]] / b["base_kw"])
        len_km_w = worst_br["len_m"] / 1000.0
        v_add_load, v_add_rev = _voltage_headroom_kw(
            branch_loads[worst_br["id"]],
            len_km_w * CABLE_R,
            len_km_w * CABLE_X,
        )

        # quantity_Maximum: additional consumption the aggregator can add
        # bounded by DT thermal AND voltage drop limit
        q_max = round(min(max(0.0, thermal_headroom_kw), v_add_load), 1)

        # quantity_Minimum: max reverse flow (negative)
        # bounded by DT reverse limit AND voltage rise limit
        q_min = round(-min(DT_REVERSE_LIMIT_KW, v_add_rev), 1)

        # Constraint label
        is_ev_surge = EV_SURGE_SLOT_START <= i < EV_SURGE_SLOT_END
        if thermal_headroom_kw < 0:
            constraint = "Branch B thermal"
            quality_code = "A08"   # Estimated, degraded
        elif min_v_end_pu < V_MIN_PU:
            constraint = "Voltage underrun"
            quality_code = "A08"
        elif max_loading_pct > 75:
            constraint = "Cable loading"
            quality_code = "A06"
        else:
            constraint = "—"
            quality_code = "A06"

        # Source tag
        slots.append({
            "position": i + 1,
            "time": time_str,
            "slot_start_utc": t.isoformat(),
            # OE limits
            "quantity_Minimum": q_min,
            "quantity_Maximum": q_max,
            "qualityCode": quality_code,
            "constraint": constraint,
            # Power flow detail (for transparency / chart)
            "total_load_kw": round(total_load_kw, 1),
            "thermal_headroom_kw": round(thermal_headroom_kw, 1),
            "dt_loading_pct": round((total_load_kw / DT_THERMAL_LIMIT_KW) * 100.0, 1),
            "min_v_end_pu": round(min_v_end_pu, 4),
            "min_v_end_v": round(min_v_end_pu * V_NOM_V, 1),
            "branch_A_v_pu": branch_pf["BR-A"]["v_end_pu"],
            "branch_B_v_pu": branch_pf["BR-B"]["v_end_pu"],
            "branch_C_v_pu": branch_pf["BR-C"]["v_end_pu"],
            "branch_A_load_kw": branch_pf["BR-A"]["load_kw"],
            "branch_B_load_kw": branch_pf["BR-B"]["load_kw"],
            "branch_C_load_kw": branch_pf["BR-C"]["load_kw"],
            "ev_surge": is_ev_surge,
            "source": "LinDistFlow",
        })

    return slots
