import pandas as pd
import numpy as np
from sklearn.cluster import DBSCAN
import json
import warnings
warnings.filterwarnings('ignore')

print("### STEP 1: Initial Profiling & Schema Extraction ###")

# 1. Ingest the data
df = pd.read_csv('violation_anonymized.csv')

# 2. Output exact column names, data types, and null-value percentages
print("\n--- Column Names & Data Types ---")
print(df.dtypes)

print("\n--- Null-Value Percentages ---")
null_percentages = df.isnull().sum() / len(df) * 100
print(null_percentages)

# 3. Identify columns
print("\n--- Identified Key Columns ---")
print("Timestamp/Date: created_datetime")
print("Latitude: latitude")
print("Longitude: longitude")
print("Violation Type: violation_type")

# 4. Filter dataset
row_count_before = len(df)

def is_parking_violation(v_str):
    if pd.isna(v_str):
        return False
    try:
        # Some are JSON strings like '["WRONG PARKING"]'
        v_list = json.loads(v_str)
        if isinstance(v_list, list):
            v_str = " ".join(v_list)
    except:
        pass
    v_str = str(v_str).lower()
    keywords = ["illegal parking", "obstruction", "no parking", "wrong parking", "parking in a main road", "parking near", "double parking", "parking opposite"]
    return any(k in v_str for k in keywords)

df['is_parking'] = df['violation_type'].apply(is_parking_violation)
filtered_df = df[df['is_parking'] == True].copy()
row_count_after = len(filtered_df)

print("\n--- Row Count ---")
print(f"Before Filtering: {row_count_before}")
print(f"After Filtering: {row_count_after}")

print("\n### STEP 2: Spatiotemporal Feature Engineering ###")

# 1. Temporal Parsing
filtered_df['created_datetime'] = pd.to_datetime(filtered_df['created_datetime'], format='mixed', utc=True)
filtered_df['hour_of_day'] = filtered_df['created_datetime'].dt.hour
filtered_df['day_of_week'] = filtered_df['created_datetime'].dt.day_name()
filtered_df['time_block'] = filtered_df['day_of_week'] + "_" + filtered_df['hour_of_day'].astype(str).str.zfill(2) + "00"

# 2 & 3. Spatial Clustering (Hotspot Generation)
print("\n--- Spatial Clustering ---")
# Drop rows with invalid coordinates
filtered_df = filtered_df.dropna(subset=['latitude', 'longitude'])
# Convert lat/lon to radians for Haversine
coords = np.radians(filtered_df[['latitude', 'longitude']].values)

# Epsilon: ~150 meters. Earth radius = 6371.0088 km. Epsilon in radians = 0.150 / 6371.0088
kms_per_radian = 6371.0088
epsilon = 0.150 / kms_per_radian

db = DBSCAN(eps=epsilon, min_samples=5, algorithm='ball_tree', metric='haversine').fit(coords)
filtered_df['hotspot_id'] = db.labels_

# Exclude outliers/noise
filtered_df = filtered_df[filtered_df['hotspot_id'] != -1]
distinct_hotspots = filtered_df['hotspot_id'].nunique()
print(f"Total distinct hotspots identified (excluding noise): {distinct_hotspots}")

# 4. Calculate centroid
centroids = filtered_df.groupby('hotspot_id')[['latitude', 'longitude']].mean().reset_index()
centroids.rename(columns={'latitude': 'centroid_lat', 'longitude': 'centroid_lon'}, inplace=True)
filtered_df = filtered_df.merge(centroids, on='hotspot_id')

print("\n### STEP 3: Intensity & Impact Aggregation ###")

# Aggregate
# Confidence score proxy: Calculate variance of violations. We can use ratio of unique dates to total possible dates
filtered_df['date_only'] = filtered_df['created_datetime'].dt.date

agg_df = filtered_df.groupby(['hotspot_id', 'time_block']).agg(
    historical_violation_count=('id', 'count'),
    unique_dates=('date_only', 'nunique'),
    centroid_lat=('centroid_lat', 'first'),
    centroid_lon=('centroid_lon', 'first')
).reset_index()

# estimated_delay_minutes
base_intersection_delay = 2.0
agg_df['estimated_delay_minutes'] = (agg_df['historical_violation_count'] * 1.5) + base_intersection_delay

# resource_cost
def assign_resource_cost(count):
    if count <= 5: return 1
    elif count <= 15: return 2
    else: return 3

agg_df['resource_cost'] = agg_df['historical_violation_count'].apply(assign_resource_cost)

# confidence_score
# Normalized variance proxy: unique dates / 22 (approx total occurrences of a specific day of week in 5 months)
agg_df['confidence_score'] = (agg_df['unique_dates'] / 22).clip(upper=1.0)
agg_df.drop('unique_dates', axis=1, inplace=True)

print("\n### STEP 4: Output Generation ###")

# 1. Final schema
print("\n--- Final Schema ---")
print(agg_df.dtypes)

# Save to CSV
agg_df.to_csv('unified_friction_log.csv', index=False)

# 2. Sample 5 rows of high-intensity hotspot
print("\n--- Sample High-Intensity Hotspot (Top 5) ---")
print(agg_df.sort_values('historical_violation_count', ascending=False).head(5).to_string())

# 3. Data Anomalies
print("\n--- Data Anomalies & Issues ---")
print("1. Many violation_type entries are JSON strings instead of standard text formats, requiring JSON parsing or substring matching.")
print("2. Some spatial coordinates may be NULL or 0.0, which breaks DBSCAN clustering unless dropped beforehand.")
print("3. There might be coordinates falling outside Bangalore city limits that need bounding box filtering.")
print(f"4. Found {row_count_before - row_count_after} non-parking related rows or empty violation types.")
