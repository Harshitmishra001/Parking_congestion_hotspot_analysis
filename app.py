import streamlit as st
import pandas as pd
import pulp
import folium
from streamlit_folium import st_folium

st.set_page_config(page_title="Command Center Dashboard", layout="wide")

st.title("Predictive Parking & Automated Dispatch Command Center")

# 1. Data Loading & Impact Calculation
@st.cache_data
def load_data():
    df = pd.read_csv('unified_friction_log.csv')
    df['impact_score'] = df['estimated_delay_minutes'] * df['confidence_score']
    return df

try:
    df = load_data()
except FileNotFoundError:
    st.error("Data file 'unified_friction_log.csv' not found. Please ensure the data engineering pipeline has been run.")
    st.stop()

# 2. Streamlit Sidebar (The Control Panel)
st.sidebar.header("Dispatch Controls")

time_blocks = sorted(df['time_block'].unique().tolist())
default_index = time_blocks.index('Sunday_0400') if 'Sunday_0400' in time_blocks else 0

selected_time_block = st.sidebar.selectbox(
    "Select Time Block",
    options=time_blocks,
    index=default_index
)

available_officers = st.sidebar.slider(
    "Available Officers",
    min_value=1,
    max_value=50,
    value=10,
    step=1
)

filtered_df = df[df['time_block'] == selected_time_block].copy()

# 3. The Knapsack Optimizer (PuLP)
def optimize_dispatch(df_slice, max_officers):
    # Initialize problem
    prob = pulp.LpProblem("Dispatch_Optimization", pulp.LpMaximize)
    
    # Decision variables: x_i is 1 if hotspot i is selected, 0 otherwise
    hotspot_ids = df_slice['hotspot_id'].tolist()
    impacts = df_slice.set_index('hotspot_id')['impact_score'].to_dict()
    costs = df_slice.set_index('hotspot_id')['resource_cost'].to_dict()
    
    dispatch_vars = pulp.LpVariable.dicts("dispatch", hotspot_ids, cat='Binary')
    
    # Objective Function: Maximize sum of impact_score for selected hotspots
    prob += pulp.lpSum([impacts[i] * dispatch_vars[i] for i in hotspot_ids]), "Total_Impact_Score"
    
    # Constraint: Sum of resource_cost <= max_officers
    prob += pulp.lpSum([costs[i] * dispatch_vars[i] for i in hotspot_ids]) <= max_officers, "Officer_Capacity"
    
    # Solve the problem
    prob.solve(pulp.PULP_CBC_CMD(msg=0))
    
    # Map results back
    dispatch_results = {i: dispatch_vars[i].varValue == 1.0 for i in hotspot_ids}
    return dispatch_results

if not filtered_df.empty:
    results_map = optimize_dispatch(filtered_df, available_officers)
    filtered_df['is_dispatched'] = filtered_df['hotspot_id'].map(results_map)
    
    # 4. UI Dashboard: Top Metrics (KPIs)
    st.subheader(f"Metrics for {selected_time_block}")
    
    dispatched_df = filtered_df[filtered_df['is_dispatched'] == True]
    
    commuter_hours_saved = dispatched_df['impact_score'].sum() / 60
    officers_deployed = dispatched_df['resource_cost'].sum()
    grid_cleared_pct = (len(dispatched_df) / len(filtered_df)) * 100 if len(filtered_df) > 0 else 0
    
    col1, col2, col3 = st.columns(3)
    col1.metric("Commuter Hours Saved", f"{commuter_hours_saved:,.1f} hrs")
    col2.metric("Officers Deployed", f"{officers_deployed} / {available_officers}")
    col3.metric("Grid Cleared", f"{grid_cleared_pct:.1f}%")
    
    # 5. UI Dashboard: Interactive Map (Folium)
    st.subheader("Tactical Deployment Map")
    
    # Center map on mean coordinates
    map_center = [filtered_df['centroid_lat'].mean(), filtered_df['centroid_lon'].mean()]
    m = folium.Map(location=map_center, zoom_start=12, tiles="cartodbpositron")
    
    for idx, row in filtered_df.iterrows():
        color = "#00FF00" if row['is_dispatched'] else "#DC143C" # Bright Green or Crimson Red
        
        # Scale radius based on violation count, bounded between 5 and 25
        radius = min(25, max(5, row['historical_violation_count'] / 50))
        
        popup_html = f"""
        <b>Hotspot ID:</b> {row['hotspot_id']}<br>
        <b>Violations:</b> {row['historical_violation_count']}<br>
        <b>Impact Score:</b> {row['impact_score']:,.1f}<br>
        <b>Resource Cost:</b> {row['resource_cost']}
        """
        
        folium.CircleMarker(
            location=[row['centroid_lat'], row['centroid_lon']],
            radius=radius,
            color=color,
            fill=True,
            fill_color=color,
            fill_opacity=0.6,
            weight=1,
            popup=folium.Popup(popup_html, max_width=250)
        ).add_to(m)
        
    st_folium(m, width=1200, height=600)
    
    # 6. UI Dashboard: Dispatch Manifest
    st.subheader("Dispatch Manifest")
    manifest_df = dispatched_df[['hotspot_id', 'centroid_lat', 'centroid_lon', 'resource_cost', 'impact_score']].copy()
    
    # Sort by impact score to show highest priority first
    manifest_df.sort_values(by='impact_score', ascending=False, inplace=True)
    
    manifest_df.rename(columns={
        'hotspot_id': 'Hotspot ID',
        'centroid_lat': 'Latitude',
        'centroid_lon': 'Longitude',
        'resource_cost': 'Required Officers',
        'impact_score': 'Impact Score (Delay x Confidence)'
    }, inplace=True)
    
    st.dataframe(manifest_df, use_container_width=True)
else:
    st.warning("No hotspots found for the selected time block.")
