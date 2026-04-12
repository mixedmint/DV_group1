// ═══════════════════════════════════════════════
//  P3 · POI Distribution Map
// ═══════════════════════════════════════════════

mapboxgl.accessToken = 'pk.eyJ1IjoibWludDExMTEiLCJhIjoiY21raXRlZXZlMHV6ZzNkcXQ1dXcyMmhodiJ9.Ins4QfjMA0v0UPEjw71GHg';

// ── Data configuration ────────────────────────
const CAT_COLORS = {
  'Cultural_Heritage': '#9966CC',
  'Green_Recreation':  '#5B9DE8',
  'Commercial':        '#F0D060'
};

const SUBCATEGORIES = {
  'Cultural_Heritage': ['Theatre', 'Library', 'Museum', 'Church'],
  'Green_Recreation':  ['Park', 'Nature_reserve', 'Amusement_park', 'Zoo'],
  'Commercial':        ['Shopping_center']
};

const CAT_LABELS = {
  'all':               'All Categories',
  'Cultural_Heritage': 'Cultural & Heritage',
  'Green_Recreation':  'Green & Recreation',
  'Commercial':        'Commercial'
};

let currentCat = 'all';
let currentSub = 'all';
let allGeoJSON  = null;
let barChart    = null;

// ── Initialise map ────────────────────────────
const map = new mapboxgl.Map({
  container: 'map-p3',
  style:     'mapbox://styles/mapbox/dark-v11',
  center:    [-0.118, 51.509],
  zoom:      9.2,
  attributionControl: false
});

map.addControl(new mapboxgl.AttributionControl({ compact: true }));
map.addControl(new mapboxgl.NavigationControl(), 'top-left');

// ── Load GeoJSON data ─────────────────────────
map.on('load', () => {
  fetch('data/london_all_poi.geojson')
    .then(r => r.json())
    .then(data => {
      allGeoJSON = data;

      map.addSource('pois', { type: 'geojson', data: data });

      // Circle point layer
      map.addLayer({
        id:   'poi-circles',
        type: 'circle',
        source: 'pois',
        paint: {
          'circle-color': [
            'match', ['get', 'category'],
            'Cultural_Heritage', '#9966CC',
            'Green_Recreation',  '#5B9DE8',
            'Commercial',        '#F0D060',
            '#aaa'
          ],
          'circle-radius': [
            'interpolate', ['linear'],
            ['to-number', ['get', 'total_2025']],
            0,      3,
            1000,   4,
            10000,  7,
            50000,  11,
            200000, 16
          ],
          'circle-opacity': 0.85,
          'circle-stroke-width': 0.8,
          'circle-stroke-color': 'rgba(255,255,255,0.4)'
        }
      });

      // Hover highlight layer
      map.addLayer({
        id:   'poi-hover',
        type: 'circle',
        source: 'pois',
        filter: ['==', 'poi_name', ''],
        paint: {
          'circle-color': '#fff',
          'circle-radius': [
            'interpolate', ['linear'],
            ['to-number', ['get', 'total_2025']],
            0,      4,
            1000,   5,
            10000,  8,
            50000,  12,
            200000, 17
          ],
          'circle-opacity': 0.3
        }
      });

      // London boundary outline + outside mask
      fetch('data/London_GLA_Boundary.geojson')
        .then(r => r.json())
        .then(gla => {
          // Boundary line
          map.addSource('gla-boundary', { type: 'geojson', data: gla });

          map.addLayer({
            id: 'gla-outline', type: 'line', source: 'gla-boundary',
            paint: { 'line-color': 'rgba(255,255,255,0.6)', 'line-width': 1.5 }
          });

          // Build world-minus-London mask
          const feature = gla.features ? gla.features[0] : gla;
          const geom    = feature.geometry;
          const outerRing = [[-180,-90],[180,-90],[180,90],[-180,90],[-180,-90]];
          const maskCoords = [outerRing];
          if (geom.type === 'Polygon') {
            geom.coordinates.forEach(ring => maskCoords.push(ring));
          } else {
            geom.coordinates.forEach(poly => poly.forEach(ring => maskCoords.push(ring)));
          }
          map.addSource('london-mask', {
            type: 'geojson',
            data: { type: 'Feature', geometry: { type: 'Polygon', coordinates: maskCoords } }
          });
          map.addLayer({
            id: 'london-mask-fill', type: 'fill', source: 'london-mask',
            paint: { 'fill-color': '#ffffff', 'fill-opacity': 0.10 }
          });
        });

      updateChart('all', 'all');
      setupInteractions();
    });
});

// ── Map interactions ──────────────────────────
function setupInteractions() {
  const tooltip = document.getElementById('p3-tooltip');

  // Hover: highlight + show simple tooltip
  map.on('mousemove', 'poi-circles', (e) => {
    map.getCanvas().style.cursor = 'pointer';
    const p = e.features[0].properties;
    map.setFilter('poi-hover', ['==', 'poi_name', p.poi_name]);

    const catLabel = CAT_LABELS[p.category] || p.category;
    tooltip.innerHTML = `
      <div class="tt-name">${p.poi_name}</div>
      <div class="tt-cat">${catLabel} · ${p.subcategory.replace(/_/g, ' ')}</div>
    `;
    tooltip.style.display = 'block';
    tooltip.style.left = (e.originalEvent.clientX + 12) + 'px';
    tooltip.style.top  = (e.originalEvent.clientY + 12) + 'px';
  });

  map.on('mouseleave', 'poi-circles', () => {
    map.getCanvas().style.cursor = '';
    map.setFilter('poi-hover', ['==', 'poi_name', '']);
    tooltip.style.display = 'none';
  });

  // Click on empty map: close popup
  map.on('click', (e) => {
    const features = map.queryRenderedFeatures(e.point, { layers: ['poi-circles'] });
    if (features.length === 0) {
      document.getElementById('p3-popup').style.display = 'none';
    }
  });

  // Click: show POI detail popup
  map.on('click', 'poi-circles', (e) => {
    const p = e.features[0].properties;
    const total = Number(p.total_2025).toLocaleString();
    const catLabel = CAT_LABELS[p.category] || p.category;
    const color = CAT_COLORS[p.category] || '#aaa';

    document.getElementById('p3-popup-content').innerHTML = `
      <div class="popup-name">${p.poi_name}</div>
      <div class="popup-tag" style="background:${color}22;color:${color}">
        ${catLabel} · ${p.subcategory.replace(/_/g, ' ')}
      </div>
      <div class="popup-row">
        <span>2025 Total Pageviews</span>
        <strong>${total}</strong>
      </div>
      <div class="popup-months">
        <div class="popup-month-label">Monthly breakdown</div>
        <div class="popup-bars">
          ${['202501','202502','202503','202504','202505','202506',
             '202507','202508','202509','202510','202511','202512']
            .map((m, i) => {
              const months = ['Jan','Feb','Mar','Apr','May','Jun',
                              'Jul','Aug','Sep','Oct','Nov','Dec'];
              const val = Number(p[m]);
              const maxVal = Math.max(...['202501','202502','202503','202504',
                '202505','202506','202507','202508','202509','202510',
                '202511','202512'].map(k => Number(p[k])));
              const pct = maxVal > 0 ? (val / maxVal * 100).toFixed(0) : 0;
              return `
                <div class="popup-bar-item">
                  <div class="popup-bar-fill" style="height:${pct}%;background:${color}"></div>
                  <div class="popup-bar-month">${months[i]}</div>
                </div>`;
            }).join('')}
        </div>
      </div>
    `;
    tooltip.style.display = 'none';
    document.getElementById('p3-popup').style.display = 'block';
  });
}

// ── Category button switching ─────────────────
document.querySelectorAll('.p3-btn[data-cat]').forEach(btn => {
  btn.addEventListener('click', () => {
    document.querySelectorAll('.p3-btn[data-cat]').forEach(b => b.classList.remove('active'));
    btn.classList.add('active');

    currentCat = btn.dataset.cat;
    currentSub = 'all';

    updateMapFilter();
    updateSubButtons(currentCat);
    updateChart(currentCat, 'all');
  });
});

// ── Update map layer filter ───────────────────
function updateMapFilter() {
  let filter = null;
  if (currentCat !== 'all' && currentSub === 'all') {
    filter = ['==', ['get', 'category'], currentCat];
  } else if (currentSub !== 'all') {
    filter = ['==', ['get', 'subcategory'], currentSub];
  }
  map.setFilter('poi-circles', filter);
}

// ── Sub-type buttons ──────────────────────────
function updateSubButtons(cat) {
  const panel   = document.getElementById('p3-sub-panel');
  const container = document.getElementById('p3-sub-buttons');

  if (cat === 'all') {
    panel.style.display = 'none';
    return;
  }
  panel.style.display = 'block';
  container.innerHTML  = '';

  // "All" button
  const allBtn = document.createElement('button');
  allBtn.className   = 'p3-btn active';
  allBtn.textContent = 'All';
  allBtn.addEventListener('click', () => {
    container.querySelectorAll('.p3-btn').forEach(b => b.classList.remove('active'));
    allBtn.classList.add('active');
    currentSub = 'all';
    updateMapFilter();
    updateChart(currentCat, 'all');
  });
  container.appendChild(allBtn);

  // Individual sub-type buttons
  SUBCATEGORIES[cat].forEach(sub => {
    const btn = document.createElement('button');
    btn.className   = 'p3-btn';
    btn.textContent = sub.replace('_', ' ');
    btn.addEventListener('click', () => {
      container.querySelectorAll('.p3-btn').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      currentSub = sub;
      updateMapFilter();
      updateChart(currentCat, sub);
    });
    container.appendChild(btn);
  });
}

// ── Bar Chart ─────────────────────────────────
function updateChart(cat, sub) {
  if (!allGeoJSON) return;

  let features = allGeoJSON.features;
  if (cat !== 'all') features = features.filter(f => f.properties.category === cat);
  if (sub !== 'all') features = features.filter(f => f.properties.subcategory === sub);

  features.sort((a, b) =>
    parseFloat(b.properties.total_2025) - parseFloat(a.properties.total_2025)
  );

  const top5   = features.slice(0, 5);
  const labels = top5.map(f => f.properties.poi_name);
  const values = top5.map(f => parseFloat(f.properties.total_2025));
  const color  = cat !== 'all' ? CAT_COLORS[cat] : '#9966CC';

  const label = sub !== 'all'
    ? sub.replace('_', ' ')
    : CAT_LABELS[cat];
  document.getElementById('p3-chart-title').textContent = `Top 5 · ${label}`;

  if (barChart) barChart.destroy();

  const ctx = document.getElementById('p3-bar-chart').getContext('2d');
  barChart = new Chart(ctx, {
    type: 'bar',
    data: {
      labels,
      datasets: [{
        data: values,
        backgroundColor: color + '99',
        borderColor:     color,
        borderWidth: 1,
        borderRadius: 3
      }]
    },
    options: {
      indexAxis: 'y',
      plugins:   { legend: { display: false } },
      scales: {
        x: {
          ticks: { color: 'rgba(255,255,255,0.5)', font: { size: 9 } },
          grid:  { color: 'rgba(255,255,255,0.08)' }
        },
        y: {
          ticks: {
            color: 'rgba(255,255,255,0.7)',
            font:  { size: 9 },
            callback: v => ['1st','2nd','3rd','4th','5th'][v] ?? v
          },
          grid: { display: false }
        }
      }
    }
  });
}

// ── Close popup ───────────────────────────────
document.getElementById('p3-popup-close').addEventListener('click', () => {
  document.getElementById('p3-popup').style.display = 'none';
});

// ═══════════════════════════════════════════════
//  P4 · Attention Heatmap
// ═══════════════════════════════════════════════

const HOTSPOT_FILES = {
  all:        'data/heatmap/msoa_hotspot_all.geojson',
  cultural:   'data/heatmap/msoa_hotspot_cultural.geojson',
  green:      'data/heatmap/msoa_hotspot_green.geojson',
  commercial: 'data/heatmap/msoa_hotspot_commercial.geojson'
};

const INSIGHTS = {
  all:        'Digital attention concentrates strongly in Central London. Westminster and Camden record the highest total pageviews, while outer boroughs receive far less Wikipedia traffic.',
  cultural:   'Cultural & Heritage sites drive the most digital attention. Central London MSOAs containing major museums, theatres and churches dominate total pageviews.',
  green:      'Green & Recreation attention is more dispersed than cultural sites, with notable peaks near large central parks. Outer nature reserves attract minimal digital attention.',
  commercial: 'Commercial attention is highly concentrated around West End shopping destinations. Most outer-borough shopping centres generate comparatively low Wikipedia pageviews.'
};

function getClusterColor(clusterType) {
  if (clusterType.startsWith('hotspot')) return '#c0392b';
  if (clusterType.startsWith('coldspot')) return '#2471a3';
  return '#bdc3c7';
}

function getClusterOpacity(clusterType) {
  if (clusterType === 'hotspot_99' || clusterType === 'coldspot_99') return 0.85;
  if (clusterType === 'hotspot_95' || clusterType === 'coldspot_95') return 0.65;
  if (clusterType === 'hotspot_90' || clusterType === 'coldspot_90') return 0.45;
  return 0.15;
}

function getAttentionLevel(attention) {
  if (attention > 50000) return 'Very High';
  if (attention > 10000) return 'High';
  if (attention > 1000)  return 'Medium';
  if (attention > 0)     return 'Low';
  return 'None';
}

function getComparison(zScore) {
  if (zScore > 2.58)  return 'Much higher than neighbours';
  if (zScore > 1.96)  return 'Higher than neighbours';
  if (zScore > 0)     return 'Slightly higher than neighbours';
  if (zScore < -2.58) return 'Much lower than neighbours';
  if (zScore < -1.96) return 'Lower than neighbours';
  if (zScore < 0)     return 'Slightly lower than neighbours';
  return 'Similar to neighbours';
}

function getInterpretation(clusterType, areaName) {
  if (clusterType.startsWith('hotspot'))
    return `${areaName} has significantly higher digital attention compared to surrounding areas.`;
  if (clusterType.startsWith('coldspot'))
    return `${areaName} has significantly lower digital attention compared to surrounding areas.`;
  return `${areaName} shows no statistically significant spatial pattern of digital attention.`;
}

// ── Initialise P4 map ─────────────────────────
const mapP4 = new mapboxgl.Map({
  container: 'map-p4',
  style:     'mapbox://styles/mapbox/dark-v11',
  center:    [-0.118, 51.490],
  zoom:      9.2,
  attributionControl: false
});

mapP4.addControl(new mapboxgl.AttributionControl({ compact: true }));
mapP4.addControl(new mapboxgl.NavigationControl(), 'top-left');

let p4CurrentLayer = 'all';
let p4CurrentFilter = 'all';
let p4BarChart = null;
let p4Data = {};

// Wait for both the map style and all GeoJSON files to be ready,
// whichever finishes last — avoids a race condition where the map
// 'load' event fires before the fetch Promise resolves (or vice versa).
const p4MapReady  = new Promise(resolve => mapP4.on('load', resolve));
const p4DataReady = Promise.all(
  Object.entries(HOTSPOT_FILES).map(([key, url]) =>
    fetch(url).then(r => r.json()).then(data => { p4Data[key] = data; })
  )
);

Promise.all([p4MapReady, p4DataReady]).then(() => {
  // Add initial data source and layers
    mapP4.addSource('hotspot', {
      type: 'geojson',
      data: p4Data['all']
    });

    mapP4.addLayer({
      id:   'hotspot-fill',
      type: 'fill',
      source: 'hotspot',
      paint: {
        'fill-color': [
          'interpolate', ['linear'],
          ['to-number', ['get', 'log_attention']],
          0,   '#f7f7f7',
          1,   '#fee8c8',
          2,   '#fdbb84',
          3,   '#fc8d59',
          4,   '#e34a33',
          5,   '#b30000',
          6.5, '#67000d'
        ],
        'fill-opacity': 0.75
      }
    });

    mapP4.addLayer({
      id:   'hotspot-outline',
      type: 'line',
      source: 'hotspot',
      paint: {
        'line-color': 'rgba(255,255,255,0.4)',
        'line-width': 0.5
      }
    });

    mapP4.addLayer({
      id:   'hotspot-hover-outline',
      type: 'line',
      source: 'hotspot',
      filter: ['==', 'area_code', ''],
      paint: {
        'line-color': '#333',
        'line-width': 2
      }
    });

    // London boundary outline
    mapP4.addSource('gla-boundary', {
      type: 'geojson',
      data: 'data/London_GLA_Boundary.geojson'
    });
    mapP4.addLayer({
      id:   'gla-outline',
      type: 'line',
      source: 'gla-boundary',
      paint: {
        'line-color': 'rgba(255,255,255,0.6)',
        'line-width': 1.5
      }
    });

    updateP4Chart('all');
    setupP4Interactions();
});

// ── Switch active data layer ──────────────────
function switchP4Layer(layerKey) {
  if (!mapP4.getSource('hotspot')) return;
  mapP4.getSource('hotspot').setData(p4Data[layerKey]);
  document.getElementById('p4-insight').textContent = INSIGHTS[layerKey];
  updateP4Chart(layerKey);
  p4CurrentFilter = 'all';
  document.querySelectorAll('.p4-filter-btn').forEach(b => b.classList.remove('active'));
  document.querySelector('.p4-filter-btn[data-filter="all"]').classList.add('active');
  mapP4.setFilter('hotspot-fill', null);
  mapP4.setFilter('hotspot-outline', null);
}

// ── Category buttons ──────────────────────────
document.querySelectorAll('.p4-btn[data-layer]').forEach(btn => {
  btn.addEventListener('click', () => {
    document.querySelectorAll('.p4-btn[data-layer]').forEach(b => b.classList.remove('active'));
    btn.classList.add('active');
    p4CurrentLayer = btn.dataset.layer;
    switchP4Layer(p4CurrentLayer);
  });
});

// ── Filter buttons ────────────────────────────
document.querySelectorAll('.p4-filter-btn').forEach(btn => {
  btn.addEventListener('click', () => {
    document.querySelectorAll('.p4-filter-btn').forEach(b => b.classList.remove('active'));
    btn.classList.add('active');
    p4CurrentFilter = btn.dataset.filter;

    let filter = null;
    if (p4CurrentFilter === 'high') {
      // attention > 10,000 i.e. log_attention > 4
      filter = ['>', ['to-number', ['get', 'log_attention']], 4];
    } else if (p4CurrentFilter === 'low') {
      // 0 < attention < 1,000 i.e. 0 < log_attention < 3
      filter = ['all',
        ['>', ['to-number', ['get', 'log_attention']], 0],
        ['<', ['to-number', ['get', 'log_attention']], 3]
      ];
    }
    mapP4.setFilter('hotspot-fill', filter);
    mapP4.setFilter('hotspot-outline', filter);
  });
});

// ── Map interactions ──────────────────────────
function setupP4Interactions() {
  const tooltip = document.getElementById('p4-tooltip');

  // Hover: highlight + simple tooltip
  mapP4.on('mousemove', 'hotspot-fill', (e) => {
    mapP4.getCanvas().style.cursor = 'pointer';
    const props = e.features[0].properties;
    mapP4.setFilter('hotspot-hover-outline', ['==', 'area_code', props.area_code]);

    const level = getAttentionLevel(props.attention);
    const views = Number(props.attention).toLocaleString();
    tooltip.innerHTML = `
      <div class="tt-name">${props.area_name}</div>
      <div class="tt-cat">2025 Pageviews: ${views}</div>
      <div class="tt-cat">Attention Level: ${level}</div>
    `;
    tooltip.style.display = 'block';
    tooltip.style.left = (e.originalEvent.clientX + 12) + 'px';
    tooltip.style.top  = (e.originalEvent.clientY + 12) + 'px';
  });

  mapP4.on('mouseleave', 'hotspot-fill', () => {
    mapP4.getCanvas().style.cursor = '';
    mapP4.setFilter('hotspot-hover-outline', ['==', 'area_code', '']);
    tooltip.style.display = 'none';
  });

}

// ── Top Hotspots Bar Chart ─────────────────────
function updateP4Chart(layerKey) {
  const data = p4Data[layerKey];
  if (!data) return;

  const hotspots = data.features
    .filter(f => f.properties.attention > 0)
    .sort((a, b) => b.properties.attention - a.properties.attention)
    .slice(0, 5);

  const labels = hotspots.map(f => f.properties.area_name);
  const values = hotspots.map(f => parseFloat(f.properties.attention));

  document.getElementById('p4-chart-title').textContent =
    `Top 5 Areas · ${layerKey === 'all' ? 'All POIs' :
      layerKey === 'cultural' ? 'Cultural & Heritage' :
      layerKey === 'green' ? 'Green & Recreation' : 'Commercial'}`;

  if (p4BarChart) p4BarChart.destroy();

  if (hotspots.length === 0) {
    document.getElementById('p4-chart-title').textContent = 'No data available';
    return;
  }

  const ctx = document.getElementById('p4-bar-chart').getContext('2d');
  p4BarChart = new Chart(ctx, {
    type: 'bar',
    data: {
      labels,
      datasets: [{
        data: values,
        backgroundColor: '#c0392b99',
        borderColor:     '#c0392b',
        borderWidth: 1,
        borderRadius: 3
      }]
    },
    options: {
      indexAxis: 'y',
      plugins: { legend: { display: false } },
      scales: {
        x: {
          ticks: { color: 'rgba(255,255,255,0.5)', font: { size: 9 } },
          grid:  { color: 'rgba(255,255,255,0.08)' }
        },
        y: {
          ticks: {
            color: 'rgba(255,255,255,0.7)', font: { size: 9 },
            callback: v => ['1st','2nd','3rd','4th','5th'][v] ?? v
          },
          grid: { display: false }
        }
      }
    }
  });
}

// ── Close P4 popup ────────────────────────────
document.getElementById('p4-popup-close').addEventListener('click', () => {
  document.getElementById('p4-popup').style.display = 'none';
});