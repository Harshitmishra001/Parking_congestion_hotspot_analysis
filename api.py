import uuid
import math
import hashlib
import colorsys
import pandas as pd
import numpy as np
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
import pulp
from sklearn.cluster import KMeans

app = FastAPI(title="Predictive Parking API")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

_DAY_MAP = {
    "Monday": 0, "Tuesday": 1, "Wednesday": 2, "Thursday": 3,
    "Friday": 4, "Saturday": 5, "Sunday": 6,
}

def load_and_sanitise(path: str = "unified_friction_log.csv") -> pd.DataFrame:
    df = pd.read_csv(path)
    df = df[
        df["centroid_lat"].between(12.7, 13.2) &
        df["centroid_lon"].between(77.3, 77.8)
    ].copy()
    parts = df["time_block"].str.split("_", n=1, expand=True)
    df["day_of_week"] = parts[0].map(_DAY_MAP).astype(int)
    df["hour_of_day"] = parts[1].str[:2].astype(int)
    df["is_chronic"] = df["confidence_score"] >= 0.85
    df["chronicity_label"] = df["is_chronic"].map(
        {True: "🔴 Repeat Offender", False: "🟡 Anomaly"}
    )
    return df

# Load globally on startup
master_df = load_and_sanitise()

# Constants
DEPOT_LAT = 12.9815
DEPOT_LON = 77.5946
CRITICAL_RADIUS_KM = 0.5

HOSPITALS = [
    {"name": "Victoria General", "lat": 12.9634, "lon": 77.5755, "mult": 3.0, "icon": "🏥", "color": "#FF0055"},
    {"name": "Manipal Lifeline", "lat": 12.9592, "lon": 77.6406, "mult": 3.0, "icon": "🏥", "color": "#FF0055"}
]
SCHOOLS = [
    {"name": "St. Joseph's Academy", "lat": 12.9674, "lon": 77.6006, "mult": 1.5, "icon": "🏫", "color": "#FFD700"}
]
ALL_POIS = HOSPITALS + SCHOOLS

EVENTS = [
    {
        "name": "Phase 2 Metro Construction",
        "type": "🚧",
        "color": "#FF8C00",
        "weight_multiplier": 1.5,
        "polygon": [
            [12.9650, 77.5850], [12.9780, 77.5850],
            [12.9780, 77.6050], [12.9650, 77.6050]
        ]
    },
    {
        "name": "Public Rally / VIP Movement",
        "type": "📢",
        "color": "#9400D3",
        "weight_multiplier": 1.3,
        "polygon": [
            [12.9800, 77.5700], [12.9950, 77.5700],
            [12.9950, 77.5900], [12.9800, 77.5900]
        ]
    }
]

def is_point_in_polygon(lat, lon, polygon):
    inside = False
    n = len(polygon)
    j = n - 1
    for i in range(n):
        lat_i, lon_i = polygon[i]
        lat_j, lon_j = polygon[j]
        y_in_range = (lat_i <= lat < lat_j) or (lat_j <= lat < lat_i)
        if y_in_range:
            x_intersect = lon_i + (lat - lat_i) / (lat_j - lat_i) * (lon_j - lon_i)
            if lon < x_intersect:
                inside = not inside
        j = i
    return inside

def haversine_km(lat1, lon1, lat2, lon2):
    R = 6371.0
    dlat = math.radians(lat2 - lat1)
    dlon = math.radians(lon2 - lon1)
    a = math.sin(dlat / 2)**2 + math.cos(math.radians(lat1)) * math.cos(math.radians(lat2)) * math.sin(dlon / 2)**2
    return R * 2 * math.atan2(math.sqrt(a), math.sqrt(1 - a))

def priority_score(I_j, C_j, t_j, D_ij, lambda_, alpha):
    if D_ij < 0.1: D_ij = 0.1
    return (I_j * C_j * (1 + lambda_ * t_j)) / (D_ij ** alpha)

def deterministic_elapsed_hours(hotspot_id: int) -> float:
    h = hashlib.sha256(str(hotspot_id).encode('utf-8')).hexdigest()
    val = int(h[:8], 16) / 0xffffffff
    return 0.5 + (val * 4.5)

def solve_knapsack(candidates_df: pd.DataFrame, max_officers: int, prob_name: str):
    prob = pulp.LpProblem(prob_name, pulp.LpMaximize)
    idx = candidates_df.index.tolist()
    x = pulp.LpVariable.dicts("x", idx, cat="Binary")

    delay_col = "effective_delay_minutes" if "effective_delay_minutes" in candidates_df.columns else "estimated_delay_minutes"
    prob += pulp.lpSum(
        candidates_df.loc[i, delay_col] * candidates_df.loc[i, "confidence_score"] * x[i]
        for i in idx
    )
    prob += pulp.lpSum(candidates_df.loc[i, "resource_cost"] * x[i] for i in idx) <= max_officers
    prob.solve(pulp.PULP_CBC_CMD(msg=0))

    status = pulp.LpStatus[prob.status]
    if status != "Optimal":
        return pd.DataFrame(), status

    selected = [i for i in idx if x[i].varValue is not None and x[i].varValue > 0.5]
    return candidates_df.loc[selected].copy(), status


class DispatchRequest(BaseModel):
    time_block: str
    available_officers: int
    alpha: float
    lambda_: float
    enable_critical: bool
    enable_events: bool

def df_to_records(df: pd.DataFrame):
    df_clean = df.replace({np.nan: None})
    records = df_clean.to_dict(orient="records")
    for r in records:
        for k, v in r.items():
            if isinstance(v, (np.integer, np.int64)):
                r[k] = int(v)
            elif isinstance(v, (np.floating, np.float64)):
                r[k] = float(v)
    return records

@app.get("/api/vitals")
def get_vitals():
    total_hotspots = int(master_df["hotspot_id"].nunique())
    total_delay_hrs = float(master_df["estimated_delay_minutes"].sum() / 60)
    chronic_hotspot_count = int(master_df[master_df["confidence_score"] >= 0.85]["hotspot_id"].nunique())
    
    worst_hotspot_id = int(
        master_df.groupby("hotspot_id")["estimated_delay_minutes"]
        .sum().idxmax()
    )
    worst_delay = float(master_df.groupby("hotspot_id")["estimated_delay_minutes"].sum().max())
    
    city_stats = {
        "totalHotspots": total_hotspots,
        "totalDelayHrs": round(total_delay_hrs, 1),
        "chronicOffenders": chronic_hotspot_count,
        "worstHotspot": worst_hotspot_id,
        "worstDelay": round(worst_delay, 1)
    }
    
    # We aggregate all hotspots for the UI map initially. 
    # Just grab max delay row per hotspot for display.
    idx = master_df.groupby('hotspot_id')['estimated_delay_minutes'].idxmax()
    unique_hotspots = master_df.loc[idx].copy()
    
    unique_hotspots['id'] = unique_hotspots['hotspot_id']
    unique_hotspots['lat'] = unique_hotspots['centroid_lat']
    unique_hotspots['lon'] = unique_hotspots['centroid_lon']
    unique_hotspots['delay'] = unique_hotspots['estimated_delay_minutes']
    unique_hotspots['cost'] = unique_hotspots['resource_cost']
    unique_hotspots['conf'] = unique_hotspots['confidence_score']
    unique_hotspots['chronic'] = unique_hotspots['is_chronic']
    unique_hotspots['tag'] = unique_hotspots['chronicity_label']
    unique_hotspots['critical'] = None
    unique_hotspots['event'] = None
    
    cols = ['id', 'lat', 'lon', 'delay', 'cost', 'conf', 'chronic', 'tag', 'critical', 'event']
    hotspots_list = df_to_records(unique_hotspots[cols])
    
    time_blocks = sorted(master_df['time_block'].unique().tolist())
    
    # Filter for chronic offenders
    chronic_df = master_df[master_df['is_chronic'] == True]
    if not chronic_df.empty:
        registry = chronic_df.groupby('hotspot_id').agg({
            'estimated_delay_minutes': 'sum',
            'confidence_score': 'mean',
            'time_block': lambda x: x.mode()[0] if not x.mode().empty else 'N/A'
        }).reset_index()
        # Rename columns to match frontend expectations
        registry.rename(columns={
            'hotspot_id': 'id', 
            'estimated_delay_minutes': 'totalDelay',
            'confidence_score': 'conf',
            'time_block': 'peak'
        }, inplace=True)
        registry = registry.sort_values('totalDelay', ascending=False).head(6)
        # Add rank and recommendation
        registry['rank'] = range(1, len(registry) + 1)
        registry['violations'] = (registry['totalDelay'] / 1.5).astype(int) # Mock violations based on delay
        registry['rec'] = registry['conf'].apply(lambda c: "Permanent barricade" if c >= 0.90 else "Regular patrol slot")
        
        chronic_registry_data = registry.replace({np.nan: None}).to_dict(orient='records')
    else:
        chronic_registry_data = []
    
    return {
        "cityStats": city_stats,
        "hotspots": hotspots_list,
        "time_blocks": time_blocks,
        "chronic_registry": chronic_registry_data
    }

@app.post("/api/dispatch")
def run_dispatch(req: DispatchRequest):
    slot_df = master_df[master_df["time_block"] == req.time_block].copy()
    if slot_df.empty:
        return {"error": "No data for this time block"}

    candidates = slot_df.nlargest(50, "estimated_delay_minutes").copy()
    candidates.reset_index(drop=True, inplace=True)

    candidates['effective_delay_minutes'] = candidates['estimated_delay_minutes'].copy()
    candidates['critical_tag'] = None
    candidates['critical_mult'] = 1.0

    if req.enable_critical:
        for idx, row in candidates.iterrows():
            highest_mult = 1.0
            tag = None
            for poi in ALL_POIS:
                dist = haversine_km(row['centroid_lat'], row['centroid_lon'], poi['lat'], poi['lon'])
                if dist <= CRITICAL_RADIUS_KM and poi['mult'] > highest_mult:
                    highest_mult = poi['mult']
                    tag = f"{poi['icon']} {poi['name']} Zone"
            if tag:
                candidates.at[idx, 'critical_mult'] = highest_mult
                candidates.at[idx, 'critical_tag'] = tag
                candidates.at[idx, 'effective_delay_minutes'] = row['estimated_delay_minutes'] * highest_mult

    candidates['event_context'] = None
    candidates['event_weight_mult'] = 1.0

    if req.enable_events:
        for idx, row in candidates.iterrows():
            highest_event_mult = 1.0
            event_tag = None
            for event in EVENTS:
                if is_point_in_polygon(row['centroid_lat'], row['centroid_lon'], event['polygon']):
                    if event['weight_multiplier'] > highest_event_mult:
                        highest_event_mult = event['weight_multiplier']
                        event_tag = f"{event['type']} {event['name']} Spillover"
            if event_tag:
                candidates.at[idx, 'event_context'] = event_tag
                candidates.at[idx, 'event_weight_mult'] = highest_event_mult
                candidates.at[idx, 'effective_delay_minutes'] = candidates.at[idx, 'effective_delay_minutes'] * highest_event_mult

    prob_id = f"Knapsack_{uuid.uuid4().hex[:8]}"
    dispatch_manifest, status = solve_knapsack(candidates, req.available_officers, prob_id)

    if status != "Optimal" or dispatch_manifest.empty:
        return {"error": "No feasible solution"}

    for col, default in [('critical_tag', None), ('critical_mult', 1.0),
                         ('effective_delay_minutes', None), ('event_context', None),
                         ('event_weight_mult', 1.0)]:
        if col not in dispatch_manifest.columns:
            dispatch_manifest[col] = default
            
    if dispatch_manifest['effective_delay_minutes'].isna().all():
        dispatch_manifest['effective_delay_minutes'] = dispatch_manifest['estimated_delay_minutes']

    total_delay_cleared = float(dispatch_manifest["estimated_delay_minutes"].sum())
    total_officers_used = int(dispatch_manifest["resource_cost"].sum())
    unmanaged_delay = float(slot_df["estimated_delay_minutes"].sum())

    twin_results = []
    Z_base = total_delay_cleared
    K_base = total_officers_used

    for n in range(1, 4):
        p_name = f"Twin_K{K_base+n}_{uuid.uuid4().hex[:8]}"
        prob_twin = pulp.LpProblem(p_name, pulp.LpMaximize)
        vars_twin = [pulp.LpVariable(f"xt_{n}_{i}", cat='Binary') for i in range(len(candidates))]

        delay_col = "effective_delay_minutes" if "effective_delay_minutes" in candidates.columns else "estimated_delay_minutes"
        prob_twin += pulp.lpSum([
            vars_twin[i] * getattr(row, delay_col) * row.confidence_score
            for i, row in enumerate(candidates.itertuples())
        ])

        prob_twin += pulp.lpSum([
            vars_twin[i] * row.resource_cost
            for i, row in enumerate(candidates.itertuples())
        ]) <= K_base + n

        prob_twin.solve(pulp.PULP_CBC_CMD(msg=0))

        Z_n_display = sum([
            row.estimated_delay_minutes
            for i, row in enumerate(candidates.itertuples())
            if vars_twin[i].varValue is not None and vars_twin[i].varValue > 0.5
        ])

        delta_n = max(0, Z_n_display - Z_base)
        ME_n = delta_n / n

        twin_results.append({
            'n': n,
            'delta': float(delta_n),
            'me': round(float(ME_n), 1)
        })

    dispatch_manifest['time_elapsed_hours'] = dispatch_manifest['hotspot_id'].apply(deterministic_elapsed_hours)

    n_hotspots = len(dispatch_manifest)
    K = max(1, min(total_officers_used, n_hotspots))

    if K == 1 or n_hotspots == 1:
        dispatch_manifest['officer_id'] = 0
    else:
        coords = dispatch_manifest[['centroid_lat', 'centroid_lon']].values
        kmeans = KMeans(n_clusters=K, random_state=42, n_init=10)
        dispatch_manifest['officer_id'] = kmeans.fit_predict(coords)

    all_routes = []
    for officer_id in range(K):
        sub = dispatch_manifest[dispatch_manifest['officer_id'] == officer_id].copy().reset_index(drop=True)
        if sub.empty: continue

        current_lat = DEPOT_LAT
        current_lon = DEPOT_LON
        visited = set()
        sequence = []

        while len(visited) < len(sub):
            best_score = -1
            best_idx = -1
            for idx, row in sub.iterrows():
                if idx in visited: continue
                d = haversine_km(current_lat, current_lon, row['centroid_lat'], row['centroid_lon'])
                p = priority_score(row['estimated_delay_minutes'], row['confidence_score'],
                                   row['time_elapsed_hours'], d, req.lambda_, req.alpha)
                if p > best_score:
                    best_score = p
                    best_idx = idx

            chosen = sub.loc[best_idx].copy()
            chosen['route_sequence'] = len(sequence) + 1
            chosen['distance_from_prev_km'] = round(haversine_km(current_lat, current_lon, chosen['centroid_lat'], chosen['centroid_lon']), 2)
            sequence.append(chosen)

            current_lat = chosen['centroid_lat']
            current_lon = chosen['centroid_lon']
            visited.add(best_idx)

        all_routes.extend(sequence)

    routed_manifest = pd.DataFrame(all_routes).reset_index(drop=True)
    
    # Map back to UI schema where needed
    routed_manifest['id'] = routed_manifest['hotspot_id']
    routed_manifest['lat'] = routed_manifest['centroid_lat']
    routed_manifest['lon'] = routed_manifest['centroid_lon']
    routed_manifest['delay'] = routed_manifest['estimated_delay_minutes']
    routed_manifest['cost'] = routed_manifest['resource_cost']
    routed_manifest['conf'] = routed_manifest['confidence_score']
    routed_manifest['chronic'] = routed_manifest['is_chronic']
    routed_manifest['tag'] = routed_manifest['chronicity_label']
    routed_manifest['critical'] = routed_manifest['critical_tag']
    routed_manifest['event'] = routed_manifest['event_context']
    
    pct_cleared = (total_delay_cleared / unmanaged_delay * 100) if unmanaged_delay > 0 else 0

    return {
        "dispatched_ids": [int(x) for x in dispatch_manifest["hotspot_id"].tolist()],
        "routes": df_to_records(routed_manifest),
        "twin_data": twin_results,
        "metrics": {
            "total_delay_cleared": float(total_delay_cleared),
            "unmanaged_delay": float(unmanaged_delay),
            "pct_cleared": float(pct_cleared)
        }
    }
