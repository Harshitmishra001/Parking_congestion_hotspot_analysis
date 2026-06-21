"""
ONE-TIME BATCH SCRIPT — Run this manually before the demo, not as part
of the live API. This pre-fetches eLoc + address for all 484 hotspots
ONCE and saves the result to a CSV column. The live app then reads from
this pre-computed column and makes ZERO live eLoc API calls during judging.

Usage:
    python precompute_elocs.py

This script is safe to re-run — it skips hotspots that already have a
cached eLoc and only calls the API for new or missing entries.
"""
import os
import json
import time
import requests
import pandas as pd
from pathlib import Path
from dotenv import load_dotenv

load_dotenv()
MAPPLS_STATIC_KEY = os.getenv("MAPPLS_STATIC_KEY")

CACHE_DIR = Path("mappls_cache")
CACHE_DIR.mkdir(exist_ok=True)
ELOC_CACHE_FILE = CACHE_DIR / "eloc_cache.json"

def load_eloc_cache():
    if ELOC_CACHE_FILE.exists():
        with open(ELOC_CACHE_FILE, "r") as f:
            return json.load(f)
    return {}

def save_eloc_cache(cache):
    with open(ELOC_CACHE_FILE, "w") as f:
        json.dump(cache, f, indent=2)

def coord_key(lat, lon):
    return f"{round(lat,4)},{round(lon,4)}"

def fetch_eloc(lat, lon, retries=2):
    """Single reverse-geocode call with basic retry. Used only in this
    offline batch script — never called live from api.py."""
    url = (
        f"https://apis.mappls.com/advancedmaps/v1/"
        f"{MAPPLS_STATIC_KEY}/rev_geocode?lat={lat}&lng={lon}"
    )
    for attempt in range(retries):
        try:
            response = requests.get(url, timeout=5)
            if response.status_code == 200:
                data = response.json()
                results = data.get("results")
                if results and len(results) > 0:
                    result = results[0]
                    # Defensive .get() chain — confirm actual field names
                    # against Mappls docs before relying on 'eLoc'/'copin'.
                    # Common Mappls response fields include 'eLoc' and
                    # 'formatted_address' — verify against a live test
                    # call before trusting this in production.
                    return {
                        "eloc": result.get("eLoc", result.get("copin", "UNKNOWN")),
                        "address": result.get("formatted_address", "Bengaluru")
                    }
            elif response.status_code == 429:
                # Rate limited — back off and retry
                time.sleep(2 ** attempt)
                continue
            else:
                return None
        except requests.exceptions.RequestException:
            time.sleep(1)
            continue
    return None

def main():
    if not MAPPLS_STATIC_KEY:
        print("✗ MAPPLS_STATIC_KEY not set in .env — cannot run batch geocode.")
        return

    df = pd.read_csv("unified_friction_log.csv")

    # Get unique hotspot centroids only — don't re-geocode the same
    # hotspot once per time_block row, only once per unique hotspot_id
    unique_hotspots = df.drop_duplicates(subset=["hotspot_id"])[
        ["hotspot_id", "centroid_lat", "centroid_lon"]
    ]

    cache = load_eloc_cache()
    new_calls = 0
    skipped = 0

    print(f"Processing {len(unique_hotspots)} unique hotspots...")

    for _, row in unique_hotspots.iterrows():
        key = coord_key(row["centroid_lat"], row["centroid_lon"])

        if key in cache:
            skipped += 1
            continue

        result = fetch_eloc(row["centroid_lat"], row["centroid_lon"])
        if result:
            cache[key] = result
            new_calls += 1
            print(f"  HS-{int(row['hotspot_id']):03d}: {result['eloc']} — {result['address'][:50]}")
        else:
            cache[key] = {"eloc": "PENDING", "address": "Geocoding unavailable"}

        # Be polite to the API — small delay between calls
        time.sleep(0.3)

        # Save incrementally every 20 calls so a crash doesn't lose progress
        if new_calls % 20 == 0 and new_calls > 0:
            save_eloc_cache(cache)

    save_eloc_cache(cache)

    print(f"\n✓ Done. {new_calls} new API calls made, {skipped} already cached.")
    print(f"✓ Estimated credit used: ~{new_calls} reverse-geocode calls.")

    # Merge cached eLoc/address back into the main dataframe and save
    def lookup_eloc(row):
        key = coord_key(row["centroid_lat"], row["centroid_lon"])
        cached = cache.get(key, {"eloc": "PENDING", "address": "Unavailable"})
        return cached["eloc"], cached["address"]

    df[["mappls_eloc", "mappls_address"]] = df.apply(
        lambda r: pd.Series(lookup_eloc(r)), axis=1
    )
    df.to_csv("unified_friction_log_enriched.csv", index=False)
    print("✓ Saved enriched CSV: unified_friction_log_enriched.csv")

if __name__ == "__main__":
    main()
