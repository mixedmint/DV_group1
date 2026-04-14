
import json
from pathlib import Path
import numpy as np
import geopandas as gpd

INPUT_GEOJSON = Path('temporal_output/london_poi_temporal.geojson')
OUTPUT_DIR = Path('borough_output')

MONTH_KEYS = [f'2025{m:02d}' for m in range(1, 13)]
MONTH_LABELS = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec']

CATEGORY_ORDER = ['All', 'Cultural_Heritage', 'Green_Recreation', 'Commercial']
CATEGORY_LABELS = {
    'All': 'All',
    'Cultural_Heritage': 'Cultural & Heritage',
    'Green_Recreation': 'Green & Recreation',
    'Commercial': 'Commercial'
}

def main():
    OUTPUT_DIR.mkdir(exist_ok=True)
    gdf = gpd.read_file(INPUT_GEOJSON)

    ranking_records = []
    summary_records = []

    for month_index, (month_key, month_label) in enumerate(zip(MONTH_KEYS, MONTH_LABELS)):
        for category_key in CATEGORY_ORDER:
            if category_key == 'All':
                subset = gdf.copy()
            else:
                subset = gdf[gdf['major_category'] == category_key].copy()

            grouped = (
                subset.groupby(['borough', 'borough_code'], dropna=False)[month_key]
                .sum()
                .reset_index()
                .rename(columns={month_key: 'value'})
            )

            grouped['value'] = grouped['value'].fillna(0).astype(float)
            grouped['month_index'] = month_index
            grouped['month_key'] = month_key
            grouped['month_label'] = month_label
            grouped['category_key'] = category_key
            grouped['category_label'] = CATEGORY_LABELS[category_key]

            grouped = grouped.sort_values(['value', 'borough'], ascending=[False, True]).reset_index(drop=True)
            grouped['rank'] = np.arange(1, len(grouped) + 1)

            ranking_records.extend(
                grouped[
                    ['month_index','month_key','month_label','category_key','category_label',
                     'borough','borough_code','value','rank']
                ].to_dict(orient='records')
            )

            summary_records.append({
                'month_index': month_index,
                'month_key': month_key,
                'month_label': month_label,
                'category_key': category_key,
                'category_label': CATEGORY_LABELS[category_key],
                'london_total_pageviews': float(grouped['value'].sum()),
                'top5_boroughs': grouped.head(5)[['borough','borough_code','value','rank']].to_dict(orient='records')
            })

    meta = {
        'months': [
            {'month_index': i, 'month_key': k, 'month_label': label}
            for i, (k, label) in enumerate(zip(MONTH_KEYS, MONTH_LABELS))
        ],
        'categories': [
            {'category_key': key, 'category_label': CATEGORY_LABELS[key]}
            for key in CATEGORY_ORDER
        ],
        'borough_count': int(gdf['borough'].nunique())
    }

    with open(OUTPUT_DIR / 'temporal_borough_ranking.json', 'w', encoding='utf-8') as f:
        json.dump(ranking_records, f, ensure_ascii=False, indent=2)

    with open(OUTPUT_DIR / 'temporal_borough_summary.json', 'w', encoding='utf-8') as f:
        json.dump(summary_records, f, ensure_ascii=False, indent=2)

    with open(OUTPUT_DIR / 'temporal_borough_meta.json', 'w', encoding='utf-8') as f:
        json.dump(meta, f, ensure_ascii=False, indent=2)

    print('Done.')
    print('Files written to:', OUTPUT_DIR.resolve())

if __name__ == '__main__':
    main()
