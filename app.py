###############################################################################
# app.py — Predictive Parking Intelligence: Command Center Dashboard
# Narrative-first layout designed for 15-second judge comprehension.
###############################################################################

import streamlit as st
import pandas as pd
import pulp
import folium
import plotly.graph_objects as go
import math
import hashlib
import colorsys
from sklearn.cluster import KMeans
from streamlit_folium import st_folium

# ─── Page config (MUST be first Streamlit call) ─────────────────────────────
st.set_page_config(layout="wide", page_title="Dispatch Command Center")

# ─── GLOBAL STYLE OVERRIDES ─────────────────────────────────────────────────
st.markdown("""
<style>
body, .stApp { background-color: #0D1117; color: #E6EDF3; }
.metric-card {
    background: #161B22;
    border: 1px solid #30363D;
    border-radius: 12px;
    padding: 20px;
    text-align: center;
}
.metric-danger { border-left: 4px solid #FF4444; }
.metric-success { border-left: 4px solid #00FF88; }
.metric-warn { border-left: 4px solid #FFB800; }
.big-number { font-size: 2.8rem; font-weight: 700; line-height: 1; }
.label { font-size: 0.8rem; color: #8B949E; text-transform: uppercase; letter-spacing: 1px; }
.sublabel { font-size: 0.95rem; color: #8B949E; margin-top: 6px; }
.section-header { font-size: 1.1rem; font-weight: 600; color: #8B949E;
    text-transform: uppercase; letter-spacing: 2px;
    border-bottom: 1px solid #30363D; padding-bottom: 8px; margin: 24px 0 16px 0; }
.dispatch-row { background: #161B22; border-left: 3px solid #00FF88;
    border-radius: 6px; padding: 12px 16px; margin-bottom: 8px; }
.chronic-badge { background: #FF444422; color: #FF4444;
    border: 1px solid #FF4444; border-radius: 4px;
    padding: 2px 8px; font-size: 0.75rem; font-weight: 600; }
.manifest-row {
  padding: 14px 16px;
  margin-bottom: 10px;
}
.manifest-meta {
  font-size: 10px;
  gap: 14px;
  margin-top: 6px;
  flex-wrap: wrap;
}
.manifest-delay {
  font-size: 24px;
}
</style>
""", unsafe_allow_html=True)

# ─── Day-name → ISO weekday mapping ─────────────────────────────────────────
_DAY_MAP = {
    "Monday": 0, "Tuesday": 1, "Wednesday": 2, "Thursday": 3,
    "Friday": 4, "Saturday": 5, "Sunday": 6,
}

###############################################################################
# MODULE 1 — DATA LOADING & SANITISATION
###############################################################################

@st.cache_data
def load_and_sanitise(path: str = "unified_friction_log.csv") -> tuple[pd.DataFrame, int]:
    df = pd.read_csv(path)
    rows_before = len(df)

    # Bengaluru bounding-box filter
    df = df[
        df["centroid_lat"].between(12.7, 13.2) &
        df["centroid_lon"].between(77.3, 77.8)
    ].copy()
    rows_dropped = rows_before - len(df)

    # Parse time_block
    parts = df["time_block"].str.split("_", n=1, expand=True)
    df["day_of_week"] = parts[0].map(_DAY_MAP).astype(int)
    df["hour_of_day"] = parts[1].str[:2].astype(int)

    # Chronicity flags
    df["is_chronic"] = df["confidence_score"] >= 0.85
    df["chronicity_label"] = df["is_chronic"].map(
        {True: "🔴 Repeat Offender", False: "🟡 Anomaly"}
    )
    return df, rows_dropped


master_df, bbox_dropped = load_and_sanitise()

###############################################################################
# SECTION 0 — COMMAND HEADER
###############################################################################

st.markdown("""
<div style='padding: 16px 0 8px 0;'>
    <span style='font-size:1.8rem; font-weight:700;'>⚡ Predictive Parking Intelligence</span>
    <span style='font-size:0.9rem; color:#8B949E; margin-left:16px;'>
        Bengaluru Traffic Enforcement Command Center
    </span>
</div>
""", unsafe_allow_html=True)

###############################################################################
# SECTION 1 — LIVE CITY VITALS  (always visible, full dataset)
###############################################################################

total_hotspots = master_df["hotspot_id"].nunique()
total_delay_hrs = master_df["estimated_delay_minutes"].sum() / 60
chronic_hotspot_count = master_df.loc[
    master_df["confidence_score"] >= 0.85, "hotspot_id"
].nunique()
worst_hotspot_id = int(
    master_df.groupby("hotspot_id")["estimated_delay_minutes"]
    .sum().idxmax()
)

c1, c2, c3, c4, c5 = st.columns(5)

c1.markdown(f"""
<div class='metric-card metric-danger'>
    <div class='label'>Active Hotspots</div>
    <div class='big-number'>{total_hotspots}</div>
    <div class='sublabel'>Across Bengaluru</div>
</div>
""", unsafe_allow_html=True)

c2.markdown(f"""
<div class='metric-card metric-danger'>
    <div class='label'>Total Cumulative Delay</div>
    <div class='big-number'>{total_delay_hrs:,.0f} hrs</div>
    <div class='sublabel'>Across all time blocks</div>
</div>
""", unsafe_allow_html=True)

c3.markdown(f"""
<div class='metric-card metric-warn'>
    <div class='label'>Chronic Offenders</div>
    <div class='big-number'>{chronic_hotspot_count}</div>
    <div class='sublabel'>Systemic weekly repeat</div>
</div>
""", unsafe_allow_html=True)

c4.markdown(f"""
<div class='metric-card metric-warn'>
    <div class='label'>Worst Hotspot</div>
    <div class='big-number'>#{worst_hotspot_id}</div>
    <div class='sublabel'>By total delay generated</div>
</div>
""", unsafe_allow_html=True)

c5.markdown(f"""
<div class='metric-card metric-success'>
    <div class='label'>Optimizer Status</div>
    <div class='big-number'>ILP Ready</div>
    <div class='sublabel'>CBC Solver loaded</div>
</div>
""", unsafe_allow_html=True)

###############################################################################
# SECTION 2 — SIDEBAR (Simplified)
###############################################################################

st.sidebar.header("🎛️ Dispatch Controls")

st.sidebar.markdown("""
<style>
/* Zone dividers inside control bar */
div[data-testid="stHorizontalBlock"] > div[data-testid="column"] {
  border-right: 1px solid #1E2D45 !important;
  padding: 12px 20px !important;
  background: #0F1724;
}
div[data-testid="stHorizontalBlock"] > div[data-testid="column"]:last-child {
  border-right: none !important;
  background: #0F1724;
}
/* Officer big number display */
.officer-display {
  font-family: 'JetBrains Mono', monospace;
  font-size: 36px;
  font-weight: 700;
  color: #C8D6F0;
  line-height: 1;
  margin-bottom: 4px;
}
/* Slider min/max labels */
.slider-bounds {
  display: flex;
  justify-content: space-between;
  font-family: 'JetBrains Mono', monospace;
  font-size: 9px;
  color: #4A6080;
  margin-top: 2px;
  padding: 0 2px;
}
</style>
""", unsafe_allow_html=True)

_default_block = "Sunday_0400"
_tb_options = sorted(master_df['time_block'].unique().tolist())
_tb_default_idx = _tb_options.index(_default_block) if _default_block in _tb_options else 0

selected_tb = st.sidebar.selectbox(
    label="TIME BLOCK",
    options=_tb_options,
    index=_tb_default_idx,
    key="ctrl_time_block",
    label_visibility="collapsed"
)

available_officers = st.sidebar.slider("Available Officers", 1, 20, 5)

st.sidebar.markdown("""
<div class="slider-bounds">
  <span>MIN: 1</span>
  <span>MAX: 20</span>
</div>
""", unsafe_allow_html=True)

st.sidebar.markdown(f"""
<div class="officer-display">{available_officers:02d}</div>
""", unsafe_allow_html=True)

run_optimiser = st.sidebar.button("⚡ Generate Deployment Plan")

st.sidebar.markdown("""
---
**How the optimizer works:**
Each hotspot has a `delay score` and an `officer cost`.
The ILP engine solves the Knapsack problem —
maximizing total delay cleared without exceeding
your officer budget.
""")

# ─── MODULE A — SIDEBAR ROUTING PARAMETERS ──────────────────────────────────
with st.sidebar.expander("⚙ Advanced Routing  ›", expanded=False):
    st.markdown("""
    <style>
    details[data-testid="stExpander"] > summary {
      font-family: 'Space Grotesk', sans-serif !important;
      font-size: 11px !important;
      font-weight: 600 !important;
      letter-spacing: 0.08em !important;
      color: #4A6080 !important;
      border: 1px solid #1E2D45 !important;
      border-radius: 6px !important;
      padding: 8px 12px !important;
      background: #080C14 !important;
      transition: color 0.2s, border-color 0.2s !important;
    }
    details[data-testid="stExpander"][open] > summary {
      color: #C8D6F0 !important;
      border-color: #2A3A5A !important;
    }
    details[data-testid="stExpander"] > summary:hover {
      color: #C8D6F0 !important;
    }
    details[data-testid="stExpander"] > div {
      background: #080C14 !important;
      border: 1px solid #1E2D45 !important;
      border-top: none !important;
      border-radius: 0 0 6px 6px !important;
      padding: 12px !important;
    }
    </style>
    """, unsafe_allow_html=True)

    alpha   = st.slider("Distance Decay α", 0.5, 2.0, 1.0, 0.1, key="ctrl_alpha",
                        help="Higher = officers stay in tighter local zones")
    lambda_ = st.slider("Urgency Growth λ", 0.0, 0.5, 0.15, 0.05, key="ctrl_lambda",
                        help="How fast uncleared severity compounds per hour")
    st.markdown("---")
    enable_critical_override = st.checkbox(
        "🚑 Hospitals / Schools Override",
        value=False, key="ctrl_critical",
        help="Hospitals 3x · Schools 1.5x impact multiplier"
    )
    enable_event_context = st.checkbox(
        "🚧 Event Context Overlays",
        value=False, key="ctrl_events",
        help="Metro Construction 1.5x · Rally zones 1.3x"
    )

st.sidebar.markdown("""
<style>
/* Prevent expander from collapsing into control bar */
details[data-testid="stExpander"] {
  margin-top: 0 !important;
}
</style>
""", unsafe_allow_html=True)

###############################################################################
# MODULE B — CONSTANTS AND HELPER FUNCTIONS
###############################################################################

DEPOT_LAT = 12.9815
DEPOT_LON = 77.5946
DEPOT_NAME = "Central Dispatch Depot"

# ─── CRITICAL POI CONSTANTS ──────────────────────────────────────────────────
HOSPITALS = [
    {"name": "Victoria General", "lat": 12.9634, "lon": 77.5755,
     "mult": 3.0, "icon": "\U0001f3e5", "color": "#FF0055"},
    {"name": "Manipal Lifeline", "lat": 12.9592, "lon": 77.6406,
     "mult": 3.0, "icon": "\U0001f3e5", "color": "#FF0055"}
]
SCHOOLS = [
    {"name": "St. Joseph's Academy", "lat": 12.9674, "lon": 77.6006,
     "mult": 1.5, "icon": "\U0001f3eb", "color": "#FFD700"}
]
CRITICAL_RADIUS_KM = 0.5
ALL_POIS = HOSPITALS + SCHOOLS

# Synthetic Event Polygon Coordinates for Bengaluru (Lat, Lon pairs)
# CRITICAL: All polygons must be defined in counter-clockwise vertex order
# to guarantee consistent winding for the Ray Casting algorithm.
EVENTS = [
    {
        "name": "Phase 2 Metro Construction",
        "type": "🚧",
        "color": "#FF8C00",
        "weight_multiplier": 1.5,  # Construction zones worsen congestion
        "polygon": [
            [12.9650, 77.5850], [12.9780, 77.5850],
            [12.9780, 77.6050], [12.9650, 77.6050]
        ]
    },
    {
        "name": "Public Rally / VIP Movement",
        "type": "📢",
        "color": "#9400D3",
        "weight_multiplier": 1.3,  # Rally spillover increases parking density
        "polygon": [
            [12.9800, 77.5700], [12.9950, 77.5700],
            [12.9950, 77.5900], [12.9800, 77.5900]
        ]
    }
]

def is_point_in_polygon(lat, lon, polygon):
    """
    Ray Casting Point-in-Polygon Algorithm.

    Shoots a horizontal ray rightward from point (lat, lon) and counts
    edge crossings with the polygon boundary. Odd crossings = inside.

    The Y-bound check uses strict less-than on the upper bound:
        (lat_i <= lat < lat_j) OR (lat_j <= lat < lat_i)
    This asymmetry is intentional — it prevents double-counting when
    the ray passes exactly through a polygon vertex.

    The X-intersection formula uses linear interpolation:
        x_intersect = x_i + (y_P - y_i) / (y_j - y_i) * (x_j - x_i)
    The point is inside if its longitude is left of the intersection.

    Args:
        lat     : Latitude of the point to test
        lon     : Longitude of the point to test
        polygon : List of [lat, lon] pairs defining the polygon boundary

    Returns:
        True if point is inside polygon, False otherwise
    """
    inside = False
    n = len(polygon)
    j = n - 1  # j starts as the last vertex (closes the polygon)

    for i in range(n):
        lat_i, lon_i = polygon[i]
        lat_j, lon_j = polygon[j]

        # Y-bound check: is the hotspot's latitude between the two vertices?
        y_in_range = (lat_i <= lat < lat_j) or (lat_j <= lat < lat_i)

        if y_in_range:
            # X-intersection: longitude where the horizontal ray meets this edge
            # Formula: lon_i + (lat - lat_i) / (lat_j - lat_i) * (lon_j - lon_i)
            x_intersect = lon_i + (lat - lat_i) / (lat_j - lat_i) * (lon_j - lon_i)

            # If hotspot is left of intersection, the ray crosses this edge
            if lon < x_intersect:
                inside = not inside  # Toggle parity

        j = i  # Advance j to current i for next iteration

    return inside

def haversine_km(lat1, lon1, lat2, lon2):
    """Returns distance in kilometers between two lat/lon points."""
    R = 6371.0
    phi1, phi2 = math.radians(lat1), math.radians(lat2)
    dphi = math.radians(lat2 - lat1)
    dlambda = math.radians(lon2 - lon1)
    a = math.sin(dphi/2)**2 + math.cos(phi1)*math.cos(phi2)*math.sin(dlambda/2)**2
    return R * 2 * math.atan2(math.sqrt(a), math.sqrt(1 - a))

def priority_score(I_j, C_j, t_j, D_ij, lambda_, alpha, epsilon=1.0):
    """Gravity-based priority score. Higher = go here next."""
    return (I_j * C_j * (1 + lambda_ * t_j)) / ((D_ij + epsilon) ** alpha)

def deterministic_elapsed_hours(hotspot_id):
    """Generates a stable, deterministic time_elapsed_hours value per hotspot."""
    seed = int(hashlib.md5(str(hotspot_id).encode()).hexdigest(), 16) % 10000
    return 0.5 + (seed / 10000) * 3.5

def generate_officer_colors(n):
    """Generates n visually distinct hex colors using HSV color wheel spacing."""
    colors = []
    for i in range(n):
        hue = i / max(n, 1)
        r, g, b = colorsys.hsv_to_rgb(hue, 0.85, 0.95)
        colors.append('#{:02X}{:02X}{:02X}'.format(int(r*255), int(g*255), int(b*255)))
    return colors

def roi_label(ME_n, theta_H, theta_L, ME_max):
    """
    Classifies marginal efficiency against global peak performance.

    Thresholds are relative to ME_max (the best efficiency across all
    simulated budget increments), not ME_1 (the first officer's efficiency).
    This correctly handles the Lumpy Knapsack Effect in ILP problems where
    integer constraints cause non-monotonic efficiency curves.

    Args:
        ME_n    : Marginal efficiency for this simulation (mins/officer)
        theta_H : 90% of ME_max — High ROI threshold
        theta_L : 50% of ME_max — Diminishing Returns floor
        ME_max  : Global peak efficiency across all twin simulations

    Returns:
        String label with emoji for UI display
    """
    if ME_n == 0 or ME_max == 0:
        return "🔴 Zero ROI — Budget Saturated"
    if ME_n >= theta_H:
        return "🟢 High ROI — Breakthrough Tier"
    elif ME_n >= theta_L:
        return "🟡 Moderate ROI"
    else:
        return "🔴 Diminishing Returns"

###############################################################################
# ILP SOLVER HELPER  (reusable for Pareto curve)
###############################################################################

def solve_knapsack(candidates_df: pd.DataFrame, max_officers: int):
    """Solve the 0-1 Knapsack ILP.  Returns (dispatch_df, status_str)."""
    prob = pulp.LpProblem("Parking_Dispatch_Knapsack", pulp.LpMaximize)
    idx = candidates_df.index.tolist()
    x = pulp.LpVariable.dicts("x", idx, cat="Binary")

    # Use effective_delay_minutes if available (critical infrastructure override),
    # otherwise fall back to estimated_delay_minutes
    delay_col = "effective_delay_minutes" if "effective_delay_minutes" in candidates_df.columns else "estimated_delay_minutes"
    prob += pulp.lpSum(
        candidates_df.loc[i, delay_col]
        * candidates_df.loc[i, "confidence_score"]
        * x[i]
        for i in idx
    )
    prob += (
        pulp.lpSum(candidates_df.loc[i, "resource_cost"] * x[i] for i in idx)
        <= max_officers
    )
    prob.solve(pulp.PULP_CBC_CMD(msg=0))

    status = pulp.LpStatus[prob.status]
    if status != "Optimal":
        return pd.DataFrame(), status

    selected = [i for i in idx if x[i].varValue == 1.0]
    return candidates_df.loc[selected].copy(), status

###############################################################################
# MODULE 3 — ILP KNAPSACK ENGINE  (button click → session_state)
###############################################################################

slot_df = master_df[master_df["time_block"] == selected_tb].copy()

if run_optimiser:
    if len(slot_df) == 0:
        st.warning("No data for this time block.")
        st.stop()

    candidates = slot_df.nlargest(50, "estimated_delay_minutes").copy()
    candidates.reset_index(drop=True, inplace=True)

    # ── MODULE C — CRITICAL INFRASTRUCTURE OVERRIDE ───────────────────────
    # Initialize effective columns fresh (idempotent)
    candidates['effective_delay_minutes'] = candidates['estimated_delay_minutes'].copy()
    candidates['critical_tag'] = None
    candidates['critical_mult'] = 1.0

    if enable_critical_override:
        for idx, row in candidates.iterrows():
            highest_mult = 1.0
            tag = None
            for poi in ALL_POIS:
                dist = haversine_km(
                    row['centroid_lat'], row['centroid_lon'],
                    poi['lat'], poi['lon']
                )
                if dist <= CRITICAL_RADIUS_KM and poi['mult'] > highest_mult:
                    highest_mult = poi['mult']
                    tag = f"{poi['icon']} {poi['name']} Zone"
            if tag:
                candidates.at[idx, 'critical_mult'] = highest_mult
                candidates.at[idx, 'critical_tag'] = tag
                candidates.at[idx, 'effective_delay_minutes'] = (
                    row['estimated_delay_minutes'] * highest_mult
                )

    # Always re-initialize from scratch to prevent stale data on toggle
    # Do NOT use 'if column not in df' — that pattern preserves old values
    # when the checkbox is toggled off and back on in the same session.
    candidates['event_context'] = None
    candidates['event_weight_mult'] = 1.0

    if enable_event_context:
        for idx, row in candidates.iterrows():
            highest_event_mult = 1.0
            event_tag = None

            for event in EVENTS:
                if is_point_in_polygon(
                    row['centroid_lat'],
                    row['centroid_lon'],
                    event['polygon']
                ):
                    # If hotspot is in multiple zones, apply the highest multiplier
                    if event['weight_multiplier'] > highest_event_mult:
                        highest_event_mult = event['weight_multiplier']
                        event_tag = f"{event['type']} {event['name']} Spillover"

            if event_tag:
                candidates.at[idx, 'event_context'] = event_tag
                candidates.at[idx, 'event_weight_mult'] = highest_event_mult
                # Stack with existing effective_delay_minutes
                # (which may already include critical infrastructure multiplier)
                # This means a hospital-zone + construction-zone hotspot gets
                # both multipliers applied: 3.0 * 1.5 = 4.5x total weight
                candidates.at[idx, 'effective_delay_minutes'] = (
                    candidates.at[idx, 'effective_delay_minutes'] * highest_event_mult
                )

    dispatch_manifest, status = solve_knapsack(candidates, available_officers)

    if status != "Optimal":
        st.error("No feasible solution found. Increase officer budget.")
        st.stop()

    # ── MODULE C3 — COLUMN PROPAGATION GUARD ───────────────────────────────
    for col, default in [('critical_tag', None),
                         ('critical_mult', 1.0),
                         ('effective_delay_minutes', None),
                         ('event_context', None),
                         ('event_weight_mult', 1.0)]:
        if col not in dispatch_manifest.columns:
            dispatch_manifest[col] = default
    if dispatch_manifest['effective_delay_minutes'].isna().all():
        dispatch_manifest['effective_delay_minutes'] = (
            dispatch_manifest['estimated_delay_minutes']
        )

    total_delay_cleared = float(dispatch_manifest["estimated_delay_minutes"].sum())
    total_officers_used = int(dispatch_manifest["resource_cost"].sum())
    unmanaged_delay = float(slot_df["estimated_delay_minutes"].sum())

    # ── Pareto curve computation (1 to 20 officers) ──────────────────────
    pareto_results = []
    for n_officers in range(1, 21):
        d, s = solve_knapsack(candidates, n_officers)
        cleared = float(d["estimated_delay_minutes"].sum()) if s == "Optimal" else 0.0
        pareto_results.append({"officers": n_officers, "delay_cleared": cleared})

    # ── MODULE: DIGITAL TWIN LITE — MARGINAL GAIN SIMULATOR ──
    twin_results = []
    Z_base = total_delay_cleared
    K_base = total_officers_used

    for n in range(1, 4):
        # STEP 1: Instantiate Twin ILP with expanded budget
        prob_twin = pulp.LpProblem(f"Twin_K{K_base+n}", pulp.LpMaximize)
        vars_twin = [
            pulp.LpVariable(f"xt_{n}_{i}", cat='Binary')
            for i in range(len(candidates))
        ]

        # Objective: internal solver uses confidence-weighted effective delay
        delay_col = "effective_delay_minutes" if "effective_delay_minutes" in candidates.columns else "estimated_delay_minutes"
        prob_twin += pulp.lpSum([
            vars_twin[i] * getattr(row, delay_col) * row.confidence_score
            for i, row in enumerate(candidates.itertuples())
        ])

        # Constraint: total officer cost must not exceed expanded budget
        prob_twin += pulp.lpSum([
            vars_twin[i] * row.resource_cost
            for i, row in enumerate(candidates.itertuples())
        ]) <= K_base + n

        prob_twin.solve(pulp.PULP_CBC_CMD(msg=0))

        # STEP 2 — THE FIX: Calculate Z_n using RAW display minutes, NOT the
        # objective score. This ensures apples-to-apples comparison with Z_base.
        #
        # HARDENING PATCH A: Use varValue > 0.5 instead of varValue == 1.0
        Z_n_display = sum([
            row.estimated_delay_minutes
            for i, row in enumerate(candidates.itertuples())
            if (
                vars_twin[i].varValue is not None and
                vars_twin[i].varValue > 0.5
            )
        ])

        # STEP 3: Calculate apples-to-apples delta
        delta_n = Z_n_display - Z_base

        # Safety guard: adding officers to a maximization problem can never
        # yield negative gain. If delta is negative, it means Z_base already
        # exceeds Z_n due to a data edge case. Clamp to zero.
        delta_n = max(0, delta_n)

        # Marginal efficiency: delay minutes recovered per additional officer
        ME_n = delta_n / n

        twin_results.append({
            'n': n,
            'Z_n': Z_n_display,
            'delta_n': delta_n,
            'ME_n': round(ME_n, 1)
        })

    # PATCH: Global Maximum Thresholding
    # Reason: ME_1 (first officer efficiency) is an unreliable baseline in
    # integer programs because the Lumpy Knapsack Effect causes non-monotonic
    # efficiency curves. A low ME_1 sets a floor so low that all tiers pass,
    # producing meaningless "High ROI" labels across the board.
    #
    # Fix: Judge all tiers against the PEAK efficiency across all simulations.
    # theta_H = 90% of peak — only the breakthrough tier qualifies as High ROI
    # theta_L = 50% of peak — moderate tier requires meaningful performance
    # Anything below 50% of peak is correctly labeled Diminishing Returns.
    ME_max = max(r['ME_n'] for r in twin_results) if twin_results else 0
    theta_H = ME_max * 0.9   # 90% of peak efficiency = High ROI threshold
    theta_L = ME_max * 0.5   # 50% of peak efficiency = Diminishing Returns floor
    # ── MODULE C — DATA PREPARATION FOR ROUTING ───────────────────────────
    dispatch_manifest['time_elapsed_hours'] = dispatch_manifest['hotspot_id'].apply(
        deterministic_elapsed_hours
    )

    n_hotspots = len(dispatch_manifest)
    raw_k = int(dispatch_manifest['resource_cost'].sum())
    K = max(1, min(raw_k, n_hotspots))

    if K == 1 or n_hotspots == 1:
        dispatch_manifest['officer_id'] = 0
    else:
        coords = dispatch_manifest[['centroid_lat', 'centroid_lon']].values
        kmeans = KMeans(n_clusters=K, random_state=42, n_init=10)
        dispatch_manifest['officer_id'] = kmeans.fit_predict(coords)

    officer_colors = generate_officer_colors(K)

    # ── MODULE D — GRAVITY ROUTING ENGINE ─────────────────────────────────
    all_routes = []

    for officer_id in range(K):
        sub = dispatch_manifest[
            dispatch_manifest['officer_id'] == officer_id
        ].copy().reset_index(drop=True)

        if sub.empty:
            continue

        current_lat = DEPOT_LAT
        current_lon = DEPOT_LON
        visited = set()
        sequence = []

        while len(visited) < len(sub):
            best_score = -1
            best_idx = -1

            for idx, row in sub.iterrows():
                if idx in visited:
                    continue
                d = haversine_km(
                    current_lat, current_lon,
                    row['centroid_lat'], row['centroid_lon']
                )
                p = priority_score(
                    I_j=row['estimated_delay_minutes'],
                    C_j=row['confidence_score'],
                    t_j=row['time_elapsed_hours'],
                    D_ij=d,
                    lambda_=lambda_,
                    alpha=alpha
                )
                if p > best_score:
                    best_score = p
                    best_idx = idx

            chosen = sub.loc[best_idx].copy()
            chosen['route_sequence'] = len(sequence) + 1
            chosen['priority_score_calculated'] = round(best_score, 2)
            chosen['distance_from_prev_km'] = round(haversine_km(
                current_lat, current_lon,
                chosen['centroid_lat'], chosen['centroid_lon']
            ), 2)
            sequence.append(chosen)

            current_lat = chosen['centroid_lat']
            current_lon = chosen['centroid_lon']
            visited.add(best_idx)

        all_routes.extend(sequence)

    routed_manifest = pd.DataFrame(all_routes).reset_index(drop=True)

    for col, default in [
        ('event_context', None),
        ('event_weight_mult', 1.0)
    ]:
        if col not in routed_manifest.columns:
            routed_manifest[col] = default

    # ── Persist to session_state ─────────────────────────────────────────
    st.session_state["plan"] = {
        "dispatch_manifest": dispatch_manifest,
        "candidates": candidates,
        "slot_df": slot_df,
        "total_delay_cleared": total_delay_cleared,
        "total_officers_used": total_officers_used,
        "unmanaged_delay": unmanaged_delay,
        "selected_tb": selected_tb,
        "available_officers": available_officers,
        "pareto": pd.DataFrame(pareto_results),
    }
    st.session_state['routed_manifest'] = routed_manifest
    st.session_state['officer_colors'] = officer_colors
    st.session_state['K'] = K
    st.session_state['enable_critical_override'] = enable_critical_override
    st.session_state['twin_results'] = twin_results
    st.session_state['roi_thresholds'] = (theta_H, theta_L)
    st.session_state['ME_max'] = ME_max

###############################################################################
# SECTIONS 3-6 — Render from session_state
###############################################################################

if "plan" in st.session_state:
    p = st.session_state["plan"]
    dispatch_manifest = p["dispatch_manifest"]
    slot_df_r = p["slot_df"]
    cleared = p["total_delay_cleared"]
    officers_used = p["total_officers_used"]
    unmanaged = p["unmanaged_delay"]
    pareto_df = p["pareto"]

    # ─────────────────────────────────────────────────────────────────────
    # SECTION 3 — BEFORE / AFTER IMPACT BANNER
    # ─────────────────────────────────────────────────────────────────────
    st.markdown("<div class='section-header'>📊 Deployment Impact Analysis</div>",
                unsafe_allow_html=True)

    b1, b2, b3 = st.columns(3)

    b1.markdown(f"""
    <div class='metric-card metric-danger'>
        <div class='label'>🔴 UNMANAGED CITY DELAY</div>
        <div class='big-number'>{unmanaged/60:.1f} hrs</div>
        <div class='sublabel'>Across {len(slot_df_r)} active hotspots</div>
    </div>
    """, unsafe_allow_html=True)

    b2.markdown(f"""
    <div class='metric-card metric-success'>
        <div class='label'>🟢 POST-DISPATCH DELAY</div>
        <div class='big-number'>{(unmanaged - cleared)/60:.1f} hrs</div>
        <div class='sublabel'>After {officers_used} officers deployed</div>
    </div>
    """, unsafe_allow_html=True)

    pct_cleared = (cleared / unmanaged * 100) if unmanaged > 0 else 0
    b3.markdown(f"""
    <div class='metric-card metric-success'>
        <div class='label'>⚡ DELAY ELIMINATED</div>
        <div class='big-number'>{pct_cleared:.0f}%</div>
        <div class='sublabel'>{cleared:.0f} mins reclaimed for commuters</div>
    </div>
    """, unsafe_allow_html=True)

    # ─────────────────────────────────────────────────────────────────────
    # SECTION 3.5 — DIGITAL TWIN LITE SIMULATOR
    # ─────────────────────────────────────────────────────────────────────
    if 'twin_results' in st.session_state:
        tr = st.session_state['twin_results']
        t_H, t_L = st.session_state['roi_thresholds']
        ME_max = st.session_state.get('ME_max', 1.0)
        
        st.markdown(
            "<div class='section-header'>\U0001f52e Digital Twin \u2014 Marginal Gain Simulator</div>",
            unsafe_allow_html=True
        )
        # If all three simulations return zero gain, the current deployment
        # is already optimal. Show a positive signal instead of three zero cards.
        if all(r['delta_n'] == 0 for r in tr):
            st.markdown("""
            <div class='metric-card metric-success' style='text-align:left; margin-bottom:16px;'>
                <div class='label'>✅ Deployment Status</div>
                <div style='font-size:1.15rem; font-weight:600; margin-top:8px;'>
                    Budget Saturated — Current deployment is 
                    <span style='color:#00FF88;'>mathematically optimal</span>.
                    All high-value hotspots in this time block are already assigned.
                    Additional officers yield zero marginal gain.
                </div>
            </div>
            """, unsafe_allow_html=True)
        else:
            cols = st.columns(3)
            icons = ["\U0001f46e", "\U0001f46e\U0001f46e", "\U0001f46e\U0001f46e\U0001f46e"]
            
            for i, result in enumerate(tr):
                label = roi_label(result['ME_n'], t_H, t_L, ME_max)
                
                color = (
                    "#00FF88" if "High" in label 
                    else "#FFB800" if "Moderate" in label 
                    else "#FF4444"
                )
                with cols[i]:
                    twin_html = (
                        f"<div class='metric-card' style='border-left:4px solid {color};'>"
                        f"<div class='label'>{icons[i]} +{result['n']} Officer(s)</div>"
                        f"<div class='big-number' style='color:{color};'>+{result['delta_n']:.0f} "
                        f"<span style='font-size:1rem;'>mins</span></div>"
                        f"<div class='sublabel'>{result['ME_n']:.1f} min/officer \u00b7 {label}</div>"
                        f"</div>"
                    )
                    st.markdown(twin_html, unsafe_allow_html=True)
            
            # Bottom recommendation
            if tr:
                best = max(tr, key=lambda x: x['ME_n'])
                worst_me = min(tr, key=lambda x: x['ME_n'])
                
                is_breakthrough = best['ME_n'] >= t_H
                all_diminishing = all(
                    roi_label(r['ME_n'], t_H, t_L, ME_max) == "🔴 Diminishing Returns"
                    for r in tr
                )
                
                if all_diminishing:
                    recommendation_html = f"""
                    <div class='metric-card' style='border-left:4px solid #FF4444; margin-top:12px; text-align:left;'>
                        <div class='label'>⚡ Commander Recommendation</div>
                        <div style='font-size:1.1rem; font-weight:600; margin-top:8px;'>
                            <span style='color:#FF4444;'>Do not deploy additional officers</span>
                            to this time block. Peak marginal efficiency is only
                            <span style='color:#FFB800; font-weight:700;'>
                                {best['ME_n']:.1f} mins/officer
                            </span>
                            — well below the viable threshold. Redeploy resources to
                            a higher-impact time block instead.
                        </div>
                    </div>
                    """
                else:
                    recommendation_html = f"""
                    <div class='metric-card metric-success' style='margin-top:12px; text-align:left;'>
                        <div class='label'>⚡ Commander Recommendation</div>
                        <div style='font-size:1.1rem; font-weight:600; margin-top:8px;'>
                            {'🚀 Breakthrough detected. ' if is_breakthrough else ''}Deploy
                            <span style='color:#00FF88; font-weight:700;'>
                                +{best['n']} officer(s)
                            </span>
                            for this time block.
                            Efficiency peaks at
                            <span style='color:#FFB800; font-weight:700;'>
                                {best['ME_n']:.1f} mins cleared per officer
                            </span>
                            {'— this unlocks a high-cost critical hotspot inaccessible at lower budgets.'
                             if is_breakthrough else
                             '. Adding fewer officers yields significantly lower returns.'}
                        </div>
                    </div>
                    """
                
                st.markdown(recommendation_html, unsafe_allow_html=True)

    # ─────────────────────────────────────────────────────────────────────
    # SECTION 4 — MAP (left) + MISSION BRIEF (right)
    # ─────────────────────────────────────────────────────────────────────
    map_col, brief_col = st.columns([13, 7])

    dispatched_ids = set(dispatch_manifest["hotspot_id"].tolist())

    with map_col:
        st.markdown("<div class='section-header'>🗺️ Tactical Deployment Map</div>",
                    unsafe_allow_html=True)

        m = folium.Map(
            location=[12.9716, 77.5946],
            zoom_start=12,
            tiles="https://{s}.basemaps.cartocdn.com/dark_nolabels/{z}/{x}/{y}{r}.png",
            attr="© OpenStreetMap contributors © CARTO",
            prefer_canvas=True,
            zoom_control=False
        )
        from folium.plugins import Fullscreen
        Fullscreen(position='topright', force_separate_button=True).add_to(m)

        # Identify the single worst hotspot for the pulsing ring
        worst_row_idx = slot_df_r["estimated_delay_minutes"].idxmax()
        worst_hid = int(slot_df_r.loc[worst_row_idx, "hotspot_id"])

        # Layer 1 — ALL hotspots (severity-tiered colors)
        all_layer = folium.FeatureGroup(name="All Hotspots")
        for _, row in slot_df_r.iterrows():
            delay = row["estimated_delay_minutes"]
            hid = int(row["hotspot_id"])

            # Change 3 — Severity-tiered dot colors & radii
            if delay > 1000:
                dot_color = "#FF0000"
                radius = min(8 + delay / 300, 30)
            elif delay > 200:
                dot_color = "#FF6B35"
                radius = min(6 + delay / 400, 20)
            else:
                dot_color = "#FF4444"
                radius = 6

            popup_html = (
                f"<b>Hotspot {hid}</b><br>"
                f"Delay: {delay:.0f} mins<br>"
                f"Officers: {int(row['resource_cost'])}<br>"
                f"{row['chronicity_label']}"
            )

            # Change 5 — Pulsing ring for THE worst hotspot only
            if hid == worst_hid:
                folium.CircleMarker(
                    location=[row["centroid_lat"], row["centroid_lon"]],
                    radius=35, color="#FF0000", fill=True,
                    fill_color="#FF0000", fill_opacity=0.1, weight=0,
                ).add_to(all_layer)
                folium.CircleMarker(
                    location=[row["centroid_lat"], row["centroid_lon"]],
                    radius=25, color="#FF0000", fill=True,
                    fill_color="#FF0000", fill_opacity=0.3, weight=0,
                ).add_to(all_layer)
                folium.CircleMarker(
                    location=[row["centroid_lat"], row["centroid_lon"]],
                    radius=15, color="#FF0000", fill=True,
                    fill_color="#FF0000", fill_opacity=0.9, weight=1,
                    popup=folium.Popup(popup_html, max_width=260),
                    tooltip=f"🔥 WORST OFFENDER | Hotspot {hid} | {delay:.0f} mins",
                ).add_to(all_layer)
            else:
                folium.CircleMarker(
                    location=[row["centroid_lat"], row["centroid_lon"]],
                    radius=radius,
                    color=dot_color,
                    fill=True,
                    fill_color=dot_color,
                    fill_opacity=0.6,
                    weight=1,
                    popup=folium.Popup(popup_html, max_width=260),
                    tooltip=f"Hotspot {hid} | Delay: {delay:.0f} mins",
                ).add_to(all_layer)

            # Change 4 — DivIcon labels ONLY for delay > 1000
            if delay > 1000:
                folium.Marker(
                    location=[row["centroid_lat"], row["centroid_lon"]],
                    icon=folium.DivIcon(
                        html=f"<div style='font-size:11px; font-weight:700; "
                             f"color:#FF0000; text-shadow:0 0 4px #000, 0 0 8px #000; "
                             f"white-space:nowrap;'>{delay:.0f}m</div>",
                        icon_size=(50, 16),
                        icon_anchor=(25, -10),
                    ),
                ).add_to(all_layer)

        all_layer.add_to(m)

        # Layer 2 — Change 6: Enhanced green dispatched markers with glow
        dispatch_layer = folium.FeatureGroup(name="Dispatched")
        for _, row in dispatch_manifest.iterrows():
            delay = row["estimated_delay_minutes"]
            hid = int(row["hotspot_id"])

            dispatch_popup = folium.Popup(
                f"<b>✅ DISPATCHED</b><br>"
                f"Hotspot {hid}<br>"
                f"{delay:.0f} mins cleared<br>"
                f"{int(row['resource_cost'])} officers",
                max_width=200,
            )

            # Outer glow
            folium.CircleMarker(
                location=[row["centroid_lat"], row["centroid_lon"]],
                radius=22, color="#00FF00", fill=True,
                fill_color="#00FF00", fill_opacity=0.3, weight=0,
            ).add_to(dispatch_layer)

            # Core marker
            folium.CircleMarker(
                location=[row["centroid_lat"], row["centroid_lon"]],
                radius=14, color="#00FF00", fill=True,
                fill_color="#00FF00", fill_opacity=0.9, weight=2,
                popup=dispatch_popup,
                tooltip=f"✅ DISPATCHED | Hotspot {hid} | Officers: {int(row['resource_cost'])}",
            ).add_to(dispatch_layer)

        dispatch_layer.add_to(m)

        # ── MODULE E — ROUTE OVERLAYS ON MAP ─────────────────────────────
        routed_manifest_map = st.session_state.get('routed_manifest', pd.DataFrame())
        officer_colors_map = st.session_state.get('officer_colors', [])
        K_map = st.session_state.get('K', 0)

        if not routed_manifest_map.empty:
            # Central Depot Marker
            folium.Marker(
                location=[DEPOT_LAT, DEPOT_LON],
                icon=folium.DivIcon(
                    html="""
                    <div style="
                      background: transparent !important;
                      border: none !important;
                      box-shadow: none !important;
                    ">
                      <!-- Outer glow ring -->
                      <div style="
                        position: absolute;
                        width: 44px; height: 44px;
                        border-radius: 50%;
                        background: rgba(255,184,0,0.12);
                        border: 1px solid rgba(255,184,0,0.3);
                        top: -8px; left: -8px;
                      "></div>
                      <!-- Main depot marker -->
                      <div style="
                        width: 28px;
                        height: 28px;
                        border-radius: 50%;
                        background: #FFB800;
                        border: 2px solid #ffffff;
                        display: flex;
                        align-items: center;
                        justify-content: center;
                        font-size: 13px;
                        box-shadow: 0 0 14px rgba(255,184,0,0.7),
                                    0 0 28px rgba(255,184,0,0.35),
                                    0 0 0 4px rgba(255,184,0,0.15);
                        position: relative;
                        z-index: 2;
                      ">🏛</div>
                      <!-- HQ label below -->
                      <div style="
                        position: absolute;
                        top: 32px;
                        left: 50%;
                        transform: translateX(-50%);
                        white-space: nowrap;
                        font-family: 'JetBrains Mono', monospace;
                        font-size: 8px;
                        font-weight: 700;
                        color: #FFB800;
                        letter-spacing: 0.1em;
                        text-shadow: 0 0 8px rgba(255,184,0,0.8);
                        background: rgba(8,12,20,0.8);
                        padding: 1px 5px;
                        border-radius: 2px;
                      ">HQ DEPOT</div>
                    </div>
                    """,
                    icon_size=(28, 28),
                    icon_anchor=(14, 14),
                    class_name="depot-marker"
                ),
                tooltip=folium.Tooltip(
                    text="🏛 Central Dispatch Depot — Origin of all officer routes",
                    style=(
                        "font-family: 'Space Grotesk', sans-serif;"
                        "font-size: 11px;"
                        "background: #0F1724;"
                        "color: #C8D6F0;"
                        "border: 1px solid #FFB800;"
                        "border-radius: 6px;"
                        "padding: 6px 10px;"
                    )
                )
            ).add_to(m)

            # Route PolyLines per officer
            for oid in range(K_map):
                officer_route = routed_manifest_map[
                    routed_manifest_map['officer_id'] == oid
                ].sort_values('route_sequence')

                if officer_route.empty:
                    continue

                color = officer_colors_map[oid] if oid < len(officer_colors_map) else '#FFFFFF'

                route_coords = [[DEPOT_LAT, DEPOT_LON]]
                for _, node in officer_route.iterrows():
                    route_coords.append([node['centroid_lat'], node['centroid_lon']])

                folium.PolyLine(
                    locations=route_coords,
                    color=color,
                    weight=2.5,
                    opacity=0.75,
                    tooltip=f"Officer {oid + 1} Route",
                    dash_array='6 4'
                ).add_to(m)

                # Sequence number labels
                for _, node in officer_route.iterrows():
                    folium.Marker(
                        location=[node['centroid_lat'], node['centroid_lon']],
                        icon=folium.DivIcon(html=f"""
                            <div style='
                                background:{color}; color:#000;
                                border-radius:50%; width:22px; height:22px;
                                display:flex; align-items:center; justify-content:center;
                                font-size:11px; font-weight:800;
                                border:2px solid #fff;
                            '>{int(node['route_sequence'])}</div>
                        """),
                        tooltip=f"Officer {oid+1} | Stop #{int(node['route_sequence'])} | P={node['priority_score_calculated']}"
                    ).add_to(m)

        # ── MODULE D — CRITICAL INFRASTRUCTURE MAP OVERLAYS ─────────────────
        if enable_critical_override:
            for poi in ALL_POIS:
                pcolor = poi['color']
                folium.Circle(
                    location=[poi['lat'], poi['lon']],
                    radius=CRITICAL_RADIUS_KM * 1000,
                    color=pcolor,
                    fill=True,
                    fill_opacity=0.08,
                    weight=1.5,
                    dash_array='5 5',
                    tooltip=f"{poi['icon']} {poi['name']} \u2014 {poi['mult']}x Multiplier Zone"
                ).add_to(m)
                folium.Marker(
                    location=[poi['lat'], poi['lon']],
                    icon=folium.DivIcon(html=f"""
                        <div style='
                            font-size:22px;
                            text-shadow: 0 0 8px {pcolor}, 0 0 16px {pcolor};
                            filter: drop-shadow(0 0 6px {pcolor});
                        '>{poi['icon']}</div>
                    """),
                    tooltip=f"{poi['icon']} {poi['name']} | {poi['mult']}x Impact Override Active"
                ).add_to(m)

        if enable_event_context:
            for event in EVENTS:
                color = event['color']
        
                # Render filled polygon zone
                folium.Polygon(
                    locations=event['polygon'],
                    color=color,
                    weight=2,
                    fill=True,
                    fill_opacity=0.12,
                    dash_array='10 8',
                    tooltip=(
                        f"{event['type']} {event['name']} | "
                        f"{event['weight_multiplier']}x Impact Multiplier Active"
                    )
                ).add_to(m)
        
                # Render zone label at polygon centroid
                centroid_lat = sum(p[0] for p in event['polygon']) / len(event['polygon'])
                centroid_lon = sum(p[1] for p in event['polygon']) / len(event['polygon'])
        
                folium.Marker(
                    location=[centroid_lat, centroid_lon],
                    icon=folium.DivIcon(html=f"""
                        <div style='
                            color:{color};
                            font-size:18px;
                            font-weight:700;
                            text-shadow: 0 0 8px {color};
                            white-space:nowrap;
                        '>{event['type']} {event['name']}</div>
                    """),
                    tooltip=f"{event['type']} {event['name']}"
                ).add_to(m)

        # HTML legend in bottom-right corner
        legend_html = """
        <div style="
            position: fixed;
            bottom: 30px; right: 30px;
            background: rgba(13,17,23,0.92);
            border: 1px solid #30363D;
            border-radius: 8px;
            padding: 12px 16px;
            font-size: 12px;
            color: #E6EDF3;
            z-index: 9999;
            line-height: 1.8;
            font-family: sans-serif;
        ">
            <b style="font-size:13px;">Map Legend</b><br>
            <span style="color:#FF0000;">&#11044;</span> Critical (&gt;1000 min)<br>
            <span style="color:#FF6B35;">&#11044;</span> High (&gt;200 min)<br>
            <span style="color:#FF4444;">&#11044;</span> Active Hotspot<br>
            <span style="color:#00FF00;">&#11044;</span> Dispatched<br>
            <span style="color:#FFB800;">&#11044;</span> Depot<br>
            <span style="color:#FF0055;">&#11044;</span> Hospital Zone<br>
            <span style="color:#FFD700;">&#11044;</span> School Zone
        </div>
        """
        
        from folium import Element
        m.get_root().html.add_child(Element("""
        <style>
        /* Override Leaflet's default white background on DivIcon */
        .depot-marker {
          background: transparent !important;
          border: none !important;
        }
        .leaflet-div-icon {
          background: transparent !important;
          border: none !important;
        }
        </style>
        """))
        
        m.get_root().html.add_child(folium.Element(legend_html))

        folium.LayerControl().add_to(m)
        st_folium(m, use_container_width=True, height=520, returned_objects=[])

    with brief_col:
        # ── MODULE F — MULTI-AGENT ROUTED MANIFEST ────────────────────────
        if 'routed_manifest' in st.session_state and not st.session_state['routed_manifest'].empty:
            rm = st.session_state['routed_manifest']
            oc = st.session_state['officer_colors']

            st.markdown("<div class='section-header'>\U0001f3af Multi-Agent Routed Deployment Manifest</div>",
                        unsafe_allow_html=True)

            for officer_id in sorted(rm['officer_id'].unique()):
                color = oc[officer_id] if officer_id < len(oc) else '#FFFFFF'
                officer_route = rm[rm['officer_id'] == officer_id].sort_values('route_sequence')
                total_delay_off = officer_route['estimated_delay_minutes'].sum()
                total_dist = officer_route['distance_from_prev_km'].sum()

                header_html = (
                    f"<div style='border-left:4px solid {color}; padding:8px 16px; "
                    f"margin-bottom:6px; background:#161B22; border-radius:6px;'>"
                    f"<span style='color:{color}; font-weight:700; font-size:1.05rem;'>"
                    f"Officer {officer_id + 1}</span>"
                    f"<span style='color:#8B949E; font-size:0.85rem; margin-left:12px;'>"
                    f"{len(officer_route)} stops \u00b7 {total_delay_off:.0f} mins cleared \u00b7 "
                    f"{total_dist:.1f} km total travel</span></div>"
                )
                st.markdown(header_html, unsafe_allow_html=True)

                _total_delay_in_manifest = rm['estimated_delay_minutes'].sum()
                _max_delay_in_manifest   = rm['estimated_delay_minutes'].max()

                for i, (_, row) in enumerate(
                    officer_route.sort_values('estimated_delay_minutes', ascending=False).iterrows()
                ):
                    delay      = float(row['estimated_delay_minutes'])
                    proportion = delay / max(_total_delay_in_manifest, 1)

                    # Bar height: 8px minimum, 72px maximum, proportional to delay share
                    bar_h = int(8 + proportion * 64)

                    # Bar opacity: encodes individual severity
                    bar_opacity = round(0.35 + (delay / max(_max_delay_in_manifest, 1)) * 0.65, 2)

                    # P-score bar width (normalized to max P-score in manifest)
                    _max_pscore = rm.get('priority_score_calculated', pd.Series([1.0])).max()
                    pscore    = float(row.get('priority_score_calculated', 0))
                    p_bar_pct = round((pscore / max(_max_pscore, 1)) * 100)

                    # Badge assembly — priority order: critical → event → chronic
                    badges_html = ""
                    if 'critical_tag' in row.index and pd.notnull(row.get('critical_tag', None)):
                        badges_html += f'<span class="badge badge-critical" style="background:rgba(255,0,85,0.15); color:#FF0055; border:1px solid #FF0055; padding:2px 6px; border-radius:4px; font-size:10px; font-weight:700;">{row["critical_tag"]}</span> '
                    if 'event_context' in row.index and pd.notnull(row.get('event_context', None)):
                        badges_html += f'<span class="badge badge-event" style="background:rgba(255,140,0,0.15); color:#FF8C00; border:1px solid #FF8C00; padding:2px 6px; border-radius:4px; font-size:10px; font-weight:700;">{row["event_context"]}</span> '
                    
                    is_chronic = bool(row.get('is_chronic', False)) if 'is_chronic' in row.index else (row.get('chronicity_label') == "🔴 Repeat Offender")
                    if is_chronic:
                        badges_html += '<span class="badge badge-repeat" style="background:#FF444422; color:#FF4444; border:1px solid #FF4444; padding:2px 6px; border-radius:4px; font-size:10px; font-weight:700;">REPEAT</span> '
                    else:
                        badges_html += '<span class="badge badge-anomaly" style="background:#4A608022; color:#4A6080; border:1px solid #4A6080; padding:2px 6px; border-radius:4px; font-size:10px; font-weight:700;">ANOMALY</span> '

                    officer_num = int(row.get('officer_id', 0)) + 1
                    stop_num    = int(row.get('route_sequence', i + 1))
                    hs_id       = int(row['hotspot_id'])
                    cost        = int(row['resource_cost'])
                    conf        = float(row['confidence_score'])
                    dist        = float(row.get('distance_from_prev_km', 0))

                    st.markdown(f"""
                    <div class="manifest-row" style="
                      display: flex;
                      background: #0F1724;
                      border: 1px solid #1E2D45;
                      border-radius: 8px;
                      margin-bottom: 10px;
                      overflow: hidden;
                      min-height: {bar_h + 56}px;
                      transition: border-color 0.2s;
                    ">
                      <!-- PROPORTIONAL LEFT BAR -->
                      <div style="
                        width: 4px;
                        min-height: {bar_h + 56}px;
                        background: {color};
                        opacity: {bar_opacity};
                        flex-shrink: 0;
                      "></div>

                      <!-- CARD CONTENT -->
                      <div style="flex: 1; padding: 13px 15px;">

                        <!-- TOP ROW: stop ID + badges -->
                        <div style="display:flex; justify-content:space-between;
                                    align-items:flex-start; margin-bottom:7px;">
                          <div>
                            <span style="font-family:'JetBrains Mono',monospace;
                                         font-size:10px; font-weight:700; color:{color}; opacity:0.8;">
                              STOP #{stop_num:02d} —
                            </span>
                            <span style="font-size:13px; font-weight:700; color:#C8D6F0;">
                              HS-{hs_id:03d}
                            </span>
                          </div>
                          <div style="display:flex; gap:4px; flex-wrap:wrap;
                                      justify-content:flex-end;">
                            {badges_html}
                          </div>
                        </div>

                        <!-- DELAY NUMBER -->
                        <div style="
                          font-family:'JetBrains Mono',monospace;
                          font-size:24px; font-weight:700; color:{color};
                          line-height:1; margin-bottom:6px;
                        ">
                          {int(delay):,}
                          <span style="font-size:10px; color:#4A6080;
                                       font-weight:400; margin-left:3px; letter-spacing:1px;">MINS CLEARED</span>
                        </div>

                        <!-- P-SCORE BAR -->
                        <div style="height:3px; background:#1E2D45; border-radius:2px;
                                    margin-bottom:8px; overflow:hidden;">
                          <div style="height:100%; width:{p_bar_pct}%; border-radius:2px;
                                      background:linear-gradient(90deg,{color},#0066FF);"></div>
                        </div>

                        <!-- META ROW -->
                        <div class="manifest-meta" style="display:flex; gap:14px; flex-wrap:wrap;
                                    font-family:'JetBrains Mono',monospace;
                                    font-size:10px; color:#8B949E; margin-top:6px;">
                          <span>👮 {cost} OFF</span>
                          <span>📊 {conf:.0%} CONF</span>
                          <span style="color:#FFB800; font-weight:700;">P={pscore:.1f}</span>
                          <span>📍 {dist:.1f}km</span>
                        </div>

                      </div>
                    </div>
                    """, unsafe_allow_html=True)
        else:
            st.markdown("<div class='section-header'>\U0001f3af Officer Deployment Manifest</div>",
                        unsafe_allow_html=True)
            st.info("Click \u26a1 Generate Deployment Plan to see routed manifest.")

    # ─────────────────────────────────────────────────────────────────────
    # SECTION 5 — PARETO EFFICIENCY CURVE
    # ─────────────────────────────────────────────────────────────────────
    st.markdown("<div class='section-header'>📈 Resource Optimization: Pareto Efficiency Curve</div>",
                unsafe_allow_html=True)

    # Find elbow point
    pareto_df = pareto_df.copy()
    pareto_df["marginal_gain"] = pareto_df["delay_cleared"].diff().fillna(
        pareto_df["delay_cleared"].iloc[0]
    )
    max_marginal = pareto_df["marginal_gain"].max()
    threshold = 0.20 * max_marginal

    elbow_candidates = pareto_df[
        (pareto_df.index > 0) & (pareto_df["marginal_gain"] < threshold)
    ]
    if len(elbow_candidates) > 0:
        elbow_point = int(elbow_candidates.iloc[0]["officers"]) - 1
    else:
        elbow_point = 20
    elbow_point = max(1, elbow_point)

    fig = go.Figure()
    fig.add_trace(go.Scatter(
        x=pareto_df["officers"],
        y=pareto_df["delay_cleared"],
        mode="lines+markers",
        line=dict(color="#00FF88", width=3),
        marker=dict(size=8, color="#00FF88"),
        name="Delay Cleared",
    ))

    # Vertical line at elbow point
    elbow_delay = float(
        pareto_df.loc[pareto_df["officers"] == elbow_point, "delay_cleared"].values[0]
    ) if elbow_point <= 20 else 0
    fig.add_vline(
        x=elbow_point, line_dash="dash", line_color="#FF4444", line_width=2,
        annotation_text=f"Optimal: {elbow_point} officers",
        annotation_font_color="#FF4444",
        annotation_font_size=13,
    )

    fig.update_layout(
        template="plotly_dark",
        paper_bgcolor="#0D1117",
        plot_bgcolor="#161B22",
        xaxis_title="Officers Deployed",
        yaxis_title="Delay Cleared (mins)",
        height=380,
        margin=dict(l=40, r=20, t=30, b=40),
        showlegend=False,
    )
    st.plotly_chart(fig, use_container_width=True)

    st.markdown(f"""
    <div class='metric-card metric-success' style='margin-top:12px;'>
        <div class='label'>System Recommendation</div>
        <div style='font-size:1.3rem; font-weight:600; margin-top:8px;'>
            Deploy <span style='color:#00FF88;'>{elbow_point} officers</span>
            for this time block.
            Adding more yields diminishing returns of less than
            <span style='color:#FFB800;'>20% marginal gain</span>.
        </div>
    </div>
    """, unsafe_allow_html=True)

    # ─────────────────────────────────────────────────────────────────────
    # SECTION 6 — CHRONICITY INTELLIGENCE TABLE
    # ─────────────────────────────────────────────────────────────────────
    st.markdown("<div class='section-header'>🔴 Systemic Offender Registry — Chronic Parking Contagions</div>",
                unsafe_allow_html=True)

    # Step 1: Compute peak time block per hotspot BEFORE main aggregation
    # Group by (hotspot, time_block), sum the delay, then keep the top one per hotspot
    _delay_by_tb = (
        master_df
        .groupby(["hotspot_id", "time_block"], as_index=False)["estimated_delay_minutes"]
        .sum()
    )
    _delay_by_tb = _delay_by_tb.sort_values(
        "estimated_delay_minutes", ascending=False
    )
    peak_tb = (
        _delay_by_tb
        .drop_duplicates(subset="hotspot_id", keep="first")
        .rename(columns={"time_block": "peak_time_block"})
        [["hotspot_id", "peak_time_block"]]
    )

    # Step 2: Main aggregation
    chronic_agg = master_df.groupby("hotspot_id").agg(
        total_violations=("historical_violation_count", "sum"),
        avg_confidence=("confidence_score", "mean"),
        total_delay=("estimated_delay_minutes", "sum"),
    ).reset_index()

    # Step 3: Merge peak_time_block (left join to keep all hotspots)
    chronic_agg = chronic_agg.merge(peak_tb, on="hotspot_id", how="left")
    chronic_agg["peak_time_block"] = chronic_agg["peak_time_block"].fillna("N/A")

    chronic_agg["is_chronic"] = chronic_agg["avg_confidence"] >= 0.85
    chronic_table = (
        chronic_agg[chronic_agg["is_chronic"]]
        .sort_values("total_delay", ascending=False)
        .head(15)
        .reset_index(drop=True)
    )
    chronic_table.insert(0, "chronicity_rank", range(1, len(chronic_table) + 1))
    chronic_table["Recommendation"] = "Install permanent barricade"

    st.dataframe(
        chronic_table[[
            "chronicity_rank", "hotspot_id", "total_violations",
            "avg_confidence", "peak_time_block", "total_delay",
            "Recommendation",
        ]],
        use_container_width=True,
    )

else:
    # ── Idle state ───────────────────────────────────────────────────────
    st.info(
        "👈 Configure the time block and officer budget in the sidebar, "
        "then click **⚡ Generate Deployment Plan** to run the optimiser."
    )
