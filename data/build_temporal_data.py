from pathlib import Path
import json
import shutil
import zipfile
import pandas as pd
import geopandas as gpd


BASE_DIR = Path("/mnt/data")
OUT_DIR = BASE_DIR / "temporal_output"
OUT_DIR.mkdir(exist_ok=True)

# ---------- Input files ----------
POI_CSV = BASE_DIR / "london_poi_all.csv"
LONDON_BOUNDARY = BASE_DIR / "London_GLA_Boundary.geojson"
BOROUGH_ZIP = BASE_DIR / "london_boroughs.zip"
BOROUGH_EXTRACT_DIR = BASE_DIR / "boroughs_unzipped"
BOROUGH_SHP = BOROUGH_EXTRACT_DIR / "London_Borough" / "London_Borough_Excluding_MHW.shp"

# ---------- Output files ----------
OUT_POI_GEOJSON = OUT_DIR / "london_poi_temporal.geojson"
OUT_OVERALL = OUT_DIR / "temporal_overall.json"
OUT_MAJOR = OUT_DIR / "temporal_major.json"
OUT_MINOR = OUT_DIR / "temporal_minor.json"
OUT_BOUNDARY = OUT_DIR / "london_gla_boundary.geojson"

# ---------- Static mappings ----------
MONTH_KEYS = [f"2025{m:02d}" for m in range(1, 13)]
MONTH_LABELS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun",
                "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"]

MAJOR_LABEL_MAP = {
    "Cultural_Heritage": "Cultural & Heritage",
    "Green_Recreation": "Green & Recreation",
    "Commercial": "Commercial",
}

MINOR_NORMALIZE_MAP = {
    "Church": "church",
    "Library": "library",
    "Museum": "museum",
    "Theatre": "theatre",
    "Park": "park",
    "Nature_reserve": "nature_reserve",
    "Amusement_park": "amusement_park",
    "Zoo": "zoo",
    "Shopping_center": "shopping_center",
}

MINOR_LABEL_MAP = {
    "church": "Church",
    "library": "Library",
    "museum": "Museum",
    "theatre": "Theatre",
    "park": "Park",
    "nature_reserve": "Nature Reserve",
    "amusement_park": "Amusement Park",
    "zoo": "Zoo",
    "shopping_center": "Shopping Center",
}


def ensure_borough_shapefile() -> Path:
    if BOROUGH_SHP.exists():
        return BOROUGH_SHP

    BOROUGH_EXTRACT_DIR.mkdir(exist_ok=True)
    with zipfile.ZipFile(BOROUGH_ZIP, "r") as z:
        z.extractall(BOROUGH_EXTRACT_DIR)

    if not BOROUGH_SHP.exists():
        raise FileNotFoundError(f"Could not find borough shapefile after extraction: {BOROUGH_SHP}")

    return BOROUGH_SHP


def build_temporal_files() -> None:
    borough_shp = ensure_borough_shapefile()

    # 1) Read POI CSV
    poi = pd.read_csv(POI_CSV)

    # 2) Normalise categories and add display labels
    poi["major_category"] = poi["category"]
    poi["major_label"] = poi["major_category"].map(MAJOR_LABEL_MAP)

    poi["minor_category"] = poi["subcategory"].map(MINOR_NORMALIZE_MAP).fillna(
        poi["subcategory"].astype(str).str.strip().str.lower().str.replace(" ", "_")
    )
    poi["minor_label"] = poi["minor_category"].map(MINOR_LABEL_MAP).fillna(poi["subcategory"])

    # 3) Spatial join to borough boundaries
    boroughs = gpd.read_file(borough_shp)[["NAME", "GSS_CODE", "geometry"]]
    boroughs = boroughs.rename(columns={"NAME": "borough", "GSS_CODE": "borough_code"})

    poi_gdf = gpd.GeoDataFrame(
        poi.copy(),
        geometry=gpd.points_from_xy(poi["long"], poi["lat"]),
        crs="EPSG:4326",
    )

    poi_joined = gpd.sjoin(poi_gdf.to_crs(boroughs.crs), boroughs, predicate="within", how="left")
    poi_joined = poi_joined.drop(columns=["index_right"]).to_crs("EPSG:4326")

    # 4) Keep only front-end fields for the main GeoJSON
    geo_fields = [
        "poi_name",
        "major_category",
        "major_label",
        "minor_category",
        "minor_label",
        "borough",
        "borough_code",
        "lat",
        "long",
        *MONTH_KEYS,
        "total_2025",
        "geometry",
    ]
    poi_frontend = poi_joined[geo_fields].copy()
    poi_frontend.to_file(OUT_POI_GEOJSON, driver="GeoJSON")

    # 5) Build overall monthly JSON
    overall = []
    for i, (month_key, month_label) in enumerate(zip(MONTH_KEYS, MONTH_LABELS)):
        overall.append({
            "month_index": i,
            "month_key": month_key,
            "month_label": month_label,
            "value": int(poi[month_key].sum())
        })

    with open(OUT_OVERALL, "w", encoding="utf-8") as f:
        json.dump(overall, f, ensure_ascii=False, indent=2)

    # 6) Build major-category monthly JSON
    major_records = []
    major_grouped = poi.groupby("major_category")[MONTH_KEYS].sum().reset_index()
    for _, row in major_grouped.iterrows():
        major_key = row["major_category"]
        for i, (month_key, month_label) in enumerate(zip(MONTH_KEYS, MONTH_LABELS)):
            major_records.append({
                "month_index": i,
                "month_key": month_key,
                "month_label": month_label,
                "major_category": major_key,
                "major_label": MAJOR_LABEL_MAP[major_key],
                "value": int(row[month_key]),
            })

    with open(OUT_MAJOR, "w", encoding="utf-8") as f:
        json.dump(major_records, f, ensure_ascii=False, indent=2)

    # 7) Build minor-category monthly JSON
    minor_records = []
    minor_grouped = poi.assign(
        minor_category=poi["subcategory"].map(MINOR_NORMALIZE_MAP).fillna(
            poi["subcategory"].astype(str).str.strip().str.lower().str.replace(" ", "_")
        )
    )
    minor_grouped = minor_grouped.groupby(["minor_category", "major_category"])[MONTH_KEYS].sum().reset_index()

    for _, row in minor_grouped.iterrows():
        minor_key = row["minor_category"]
        major_key = row["major_category"]
        for i, (month_key, month_label) in enumerate(zip(MONTH_KEYS, MONTH_LABELS)):
            minor_records.append({
                "month_index": i,
                "month_key": month_key,
                "month_label": month_label,
                "minor_category": minor_key,
                "minor_label": MINOR_LABEL_MAP.get(minor_key, minor_key),
                "major_category": major_key,
                "major_label": MAJOR_LABEL_MAP.get(major_key, major_key),
                "value": int(row[month_key]),
            })

    with open(OUT_MINOR, "w", encoding="utf-8") as f:
        json.dump(minor_records, f, ensure_ascii=False, indent=2)

    # 8) Copy London boundary into the same output folder
    shutil.copy2(LONDON_BOUNDARY, OUT_BOUNDARY)

    print("Done.")
    print(f"Saved: {OUT_POI_GEOJSON}")
    print(f"Saved: {OUT_OVERALL}")
    print(f"Saved: {OUT_MAJOR}")
    print(f"Saved: {OUT_MINOR}")
    print(f"Saved: {OUT_BOUNDARY}")


if __name__ == "__main__":
    build_temporal_files()
