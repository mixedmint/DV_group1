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
const p4PopupClose = document.getElementById('p4-popup-close');
if (p4PopupClose) {
  p4PopupClose.addEventListener('click', () => {
    const p4Popup = document.getElementById('p4-popup');
    if (p4Popup) p4Popup.style.display = 'none';
  });
}

// ═══════════════════════════════════════════════
//  P5 · Temporal Dynamics
// ═══════════════════════════════════════════════

// ── Configuration Constants ─────────────
const TEMPORAL_FILES = {
  pois:     'data/london_poi_temporal.geojson',
  overall:  'data/temporal_overall.json',
  major:    'data/temporal_major.json',
  minor:    'data/temporal_minor.json',
  boundary: 'data/London_GLA_Boundary.geojson'
};

const TEMPORAL_COLORS = {
  Cultural_Heritage: '#9966CC',
  Green_Recreation:  '#5B9DE8',
  Commercial:        '#F0D060'
};

const TEMPORAL_MINOR_ORDER = [
  'church',
  'library',
  'museum',
  'theatre',
  'park',
  'nature_reserve',
  'amusement_park',
  'zoo',
  'shopping_center'
];

const TEMPORAL_MINOR_LABELS = {
  church: 'Church',
  library: 'Library',
  museum: 'Museum',
  theatre: 'Theatre',
  park: 'Park',
  nature_reserve: 'Nature Reserve',
  amusement_park: 'Amusement Park',
  zoo: 'Zoo',
  shopping_center: 'Shopping Center'
};

const TEMPORAL_MAJOR_LABELS = {
  Cultural_Heritage: 'Cultural & Heritage',
  Green_Recreation: 'Green & Recreation',
  Commercial: 'Commercial'
};

const temporalMonthMarkerPlugin = {
  id: 'temporalMonthMarker',
  afterDatasetsDraw(chart, args, pluginOptions) {
    const index = pluginOptions?.index;
    if (index == null) return;

    const xScale = chart.scales.x;
    const yScale = chart.scales.y;
    if (!xScale || !yScale) return;

    const label = chart.data.labels[index];
    const x = xScale.getPixelForValue(label);
    const ctx = chart.ctx;

    ctx.save();
    ctx.beginPath();
    ctx.moveTo(x, yScale.top);
    ctx.lineTo(x, yScale.bottom);
    ctx.lineWidth = 1.2;
    ctx.strokeStyle = 'rgba(86, 201, 214, 0.9)';
    ctx.stroke();

    ctx.beginPath();
    ctx.arc(x, yScale.top + 4, 3, 0, Math.PI * 2);
    ctx.fillStyle = 'rgba(86, 201, 214, 0.95)';
    ctx.fill();
    ctx.restore();
  }
};

Chart.register(temporalMonthMarkerPlugin);

// ── Temporal IIFE ─────────────
(function initTemporalSection() {
  const mapContainer = document.getElementById('map-temporal');
  if (!mapContainer) return;

  const state = {
    monthIndex: 0,
    monthKey: '202501',
    monthLabel: 'Jan',
    mode: 'major',
    minorSelected: 'church'
  };

  let mapTemporal = null;
  let temporalPoiData = null;
  let temporalOverall = [];
  let temporalMajor = [];
  let temporalMinor = [];
  let boundaryData = null;

  let overallChart = null;
  let detailChart = null;

  const monthLabelEl   = document.getElementById('temporal-current-month');
  const sliderEl       = document.getElementById('temporal-slider');
  const minorWrapEl    = document.getElementById('temporal-minor-wrap');
  const minorSelectEl  = document.getElementById('temporal-minor-select');
  const detailTitleEl  = document.getElementById('temporal-detail-title');
  const tooltipEl      = document.getElementById('temporal-tooltip');

  // ── Data Loading ─────────────
  Promise.all([
    fetch(TEMPORAL_FILES.pois).then(r => r.json()),
    fetch(TEMPORAL_FILES.overall).then(r => r.json()),
    fetch(TEMPORAL_FILES.major).then(r => r.json()),
    fetch(TEMPORAL_FILES.minor).then(r => r.json()),
    fetch(TEMPORAL_FILES.boundary).then(r => r.json())
  ]).then(([poiData, overallData, majorData, minorData, glaData]) => {
    temporalPoiData = poiData;
    temporalOverall = overallData;
    temporalMajor   = majorData;
    temporalMinor   = minorData;
    boundaryData    = glaData;

    state.monthIndex = temporalOverall[0].month_index;
    state.monthKey   = temporalOverall[0].month_key;
    state.monthLabel = temporalOverall[0].month_label;

    buildMinorDropdown();
    initTemporalMap();
    renderOverallChart();
    renderDetailChart();
    bindTemporalControls();
    updateMonthUI();
  }).catch(err => {
    console.error('Temporal section failed to load:', err);
  });

// ── Temporal Initialization ─────────────

  function buildMinorDropdown() {
    minorSelectEl.innerHTML = '';
    TEMPORAL_MINOR_ORDER.forEach(key => {
      const option = document.createElement('option');
      option.value = key;
      option.textContent = TEMPORAL_MINOR_LABELS[key];
      minorSelectEl.appendChild(option);
    });
    minorSelectEl.value = state.minorSelected;
  }

  // ── Map ─────────────
  function initTemporalMap() {
    mapTemporal = new mapboxgl.Map({
      container: 'map-temporal',
      style: 'mapbox://styles/mapbox/dark-v11',
      center: [-0.118, 51.509],
      zoom: 9.2,
      attributionControl: false
    });

    mapTemporal.addControl(new mapboxgl.AttributionControl({ compact: true }));
    mapTemporal.addControl(new mapboxgl.NavigationControl(), 'top-left');

    mapTemporal.on('load', () => {
      mapTemporal.addSource('temporal-pois', {
        type: 'geojson',
        data: temporalPoiData
      });

      mapTemporal.addLayer({
        id: 'temporal-poi-circles',
        type: 'circle',
        source: 'temporal-pois',
        paint: getTemporalCirclePaint(state.monthKey)
      });

      mapTemporal.addSource('temporal-gla-boundary', {
        type: 'geojson',
        data: boundaryData
      });

      mapTemporal.addLayer({
        id: 'temporal-gla-outline',
        type: 'line',
        source: 'temporal-gla-boundary',
        paint: {
          'line-color': 'rgba(255,255,255,0.6)',
          'line-width': 1.5
        }
      });

      const feature = boundaryData.features ? boundaryData.features[0] : boundaryData;
      const geom = feature.geometry;
      const outerRing = [[-180,-90],[180,-90],[180,90],[-180,90],[-180,-90]];
      const maskCoords = [outerRing];

      if (geom.type === 'Polygon') {
        geom.coordinates.forEach(ring => maskCoords.push(ring));
      } else {
        geom.coordinates.forEach(poly => poly.forEach(ring => maskCoords.push(ring)));
      }

      mapTemporal.addSource('temporal-london-mask', {
        type: 'geojson',
        data: {
          type: 'Feature',
          geometry: {
            type: 'Polygon',
            coordinates: maskCoords
          }
        }
      });

      mapTemporal.addLayer({
       id: 'temporal-london-mask-fill',
        type: 'fill',
        source: 'temporal-london-mask',
       paint: {
         'fill-color': '#ffffff',
          'fill-opacity': 0.10
        }
      });
      
      const bounds = new mapboxgl.LngLatBounds();
      boundaryData.features[0].geometry.coordinates.flat(2).forEach(coord => {
        if (Array.isArray(coord) && coord.length === 2) bounds.extend(coord);
      });
      if (!bounds.isEmpty()) mapTemporal.fitBounds(bounds, { padding: 30, duration: 0 });

      setupTemporalMapHover();
    });
  }

  function getTemporalCirclePaint(monthKey) {
    return {
      'circle-color': [
        'match', ['get', 'major_category'],
        'Cultural_Heritage', TEMPORAL_COLORS.Cultural_Heritage,
        'Green_Recreation',  TEMPORAL_COLORS.Green_Recreation,
        'Commercial',        TEMPORAL_COLORS.Commercial,
        '#999999'
      ],
      'circle-radius': [
        'interpolate', ['exponential', 1.7],
        ['to-number', ['get', monthKey]],
        0, 1,
        20, 3,
        50, 6,
        200, 10,
        1000, 15,
        5000, 18,
        20000, 26,
        50000, 30,
        150000, 38
      ],
      'circle-opacity': 0.82,
      'circle-stroke-width': 0.8,
      'circle-stroke-color': 'rgba(255,255,255,0.7)'
    };
  }

    // ── Hover ─────────────
  function setupTemporalMapHover() {
    mapTemporal.on('mousemove', 'temporal-poi-circles', (e) => {
      mapTemporal.getCanvas().style.cursor = 'pointer';

      const p = e.features[0].properties;
      const value = Number(p[state.monthKey] || 0).toLocaleString();
      const borough = p.borough || 'Unknown';

      tooltipEl.innerHTML = `
        <div class="tt-name">${p.poi_name}</div>
        <div class="tt-row">${state.monthLabel}: ${value} pageviews</div>
        <div class="tt-row">Category: ${p.major_label} - ${p.minor_label}</div>
        <div class="tt-row">Borough: ${borough}</div>
      `;

      tooltipEl.style.display = 'block';
      tooltipEl.style.left = (e.originalEvent.clientX + 12) + 'px';
      tooltipEl.style.top  = (e.originalEvent.clientY + 12) + 'px';
    });

    mapTemporal.on('mouseleave', 'temporal-poi-circles', () => {
      mapTemporal.getCanvas().style.cursor = '';
      tooltipEl.style.display = 'none';
    });
  }

    // ── update data ─────────────
  function updateTemporalMapMonth() {
    if (!mapTemporal || !mapTemporal.getLayer('temporal-poi-circles')) return;
    mapTemporal.setPaintProperty(
      'temporal-poi-circles',
      'circle-radius',
      getTemporalCirclePaint(state.monthKey)['circle-radius']
    );
  }

  function updateMonthUI() {
    monthLabelEl.textContent = state.monthLabel;
    sliderEl.value = state.monthIndex;
    updateTemporalMapMonth();
    updateChartMonthMarker();
  }

  // ── Trend ─────────────
  function renderOverallChart() {
    const labels = temporalOverall.map(d => d.month_label);
    const values = temporalOverall.map(d => d.value);

    if (overallChart) overallChart.destroy();

    const ctx = document.getElementById('temporal-overall-chart').getContext('2d');
    overallChart = new Chart(ctx, {
      type: 'line',
      data: {
        labels,
        datasets: [{
          label: 'Overall Attention',
          data: values,
          borderColor: '#333131',
          borderWidth: 2,
          pointRadius: 0,
          pointHoverRadius: 3,
          tension: 0.28
        }]
      },
      options: getBaseTemporalChartOptions(state.monthIndex, false)
    });

    document.getElementById('temporal-overall-chart').onclick = (evt) => {
      handleChartClick(evt, overallChart);
    };
  }

  function renderDetailChart() {
    if (detailChart) detailChart.destroy();

    const ctx = document.getElementById('temporal-detail-chart').getContext('2d');

    if (state.mode === 'major') {
      detailTitleEl.textContent = 'Category Trends';
      minorWrapEl.style.display = 'none';

      const labels = temporalOverall.map(d => d.month_label);
      const majorOrder = ['Cultural_Heritage', 'Green_Recreation', 'Commercial'];

      const datasets = majorOrder.map(catKey => {
        const series = temporalMajor
          .filter(d => d.major_category === catKey)
          .sort((a, b) => a.month_index - b.month_index);

        return {
          label: TEMPORAL_MAJOR_LABELS[catKey],
          data: series.map(d => d.value),
          borderColor: TEMPORAL_COLORS[catKey],
          borderWidth: 2,
          pointRadius: 0,
          pointHoverRadius: 3,
          tension: 0.28
        };
      });

      detailChart = new Chart(ctx, {
        type: 'line',
        data: { labels, datasets },
        options: getBaseTemporalChartOptions(state.monthIndex, true)
      });

    } else {
      detailTitleEl.textContent = 'Minor Category Trend';
      minorWrapEl.style.display = 'block';

      const labels = temporalOverall.map(d => d.month_label);
      const series = temporalMinor
        .filter(d => d.minor_category === state.minorSelected)
        .sort((a, b) => a.month_index - b.month_index);

      const parentMajor = series[0]?.major_category || 'Cultural_Heritage';
      const lineColor = TEMPORAL_COLORS[parentMajor];

      detailChart = new Chart(ctx, {
        type: 'line',
        data: {
          labels,
          datasets: [{
            label: TEMPORAL_MINOR_LABELS[state.minorSelected],
            data: series.map(d => d.value),
            borderColor: lineColor,
            borderWidth: 2,
            pointRadius: 0,
            pointHoverRadius: 3,
            tension: 0.28
          }]
        },
        options: getBaseTemporalChartOptions(state.monthIndex, false)
      });
    }

    document.getElementById('temporal-detail-chart').onclick = (evt) => {
      handleChartClick(evt, detailChart);
    };
  }

  function getBaseTemporalChartOptions(monthIndex, showLegend) {
    return {
      responsive: true,
      maintainAspectRatio: false,
      interaction: {
        mode: 'nearest',
        intersect: false
      },
      plugins: {
        legend: {
          display: showLegend,
          position: 'bottom',
          labels: {
            boxWidth: 10,
            boxHeight: 10,
            color: '#666666',
            font: { size: 11 }
          }
        },
        tooltip: {
          callbacks: {
            label: function(context) {
              const value = Number(context.raw || 0).toLocaleString();
              return `${context.dataset.label}: ${value}`;
            }
          }
        },
        temporalMonthMarker: {
          index: monthIndex
        }
      },
      scales: {
        x: {
          ticks: {
            color: '#888585',
            font: { size: 11 }
          },
          grid: {
            color: 'rgba(200,198,198,0.35)'
          }
        },
        y: {
          ticks: {
            color: '#888585',
            font: { size: 11 },
            callback: (value) => formatAxisTick(value)
          },
          grid: {
            color: 'rgba(200,198,198,0.35)'
          }
        }
      }
    };
  }

  function updateChartMonthMarker() {
    if (overallChart) {
      overallChart.options.plugins.temporalMonthMarker.index = state.monthIndex;
      overallChart.update('none');
    }
    if (detailChart) {
      detailChart.options.plugins.temporalMonthMarker.index = state.monthIndex;
      detailChart.update('none');
    }
  }

  function bindTemporalControls() {
    sliderEl.addEventListener('input', (e) => {
      const nextIndex = Number(e.target.value);
      setTemporalMonth(nextIndex);
    });

    document.querySelectorAll('.temporal-mode-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        document.querySelectorAll('.temporal-mode-btn').forEach(b => b.classList.remove('active'));
        btn.classList.add('active');
        state.mode = btn.dataset.mode;
        renderDetailChart();
        updateChartMonthMarker();
      });
    });

    minorSelectEl.addEventListener('change', (e) => {
      state.minorSelected = e.target.value;
      if (state.mode === 'minor') {
        renderDetailChart();
        updateChartMonthMarker();
      }
    });
  }

  function setTemporalMonth(nextIndex) {
    const next = temporalOverall.find(d => d.month_index === nextIndex);
    if (!next) return;

    state.monthIndex = next.month_index;
    state.monthKey   = next.month_key;
    state.monthLabel = next.month_label;

    updateMonthUI();
  }

  function handleChartClick(evt, chart) {
    const points = chart.getElementsAtEventForMode(evt, 'nearest', { intersect: false }, true);
    if (!points.length) return;
    const clickedIndex = points[0].index;
    setTemporalMonth(clickedIndex);
  }

  function formatAxisTick(value) {
    if (value >= 1000000) return (value / 1000000).toFixed(1) + 'M';
    if (value >= 1000) return (value / 1000).toFixed(0) + 'k';
    return value;
  }
})();

// ═══════════════════════════════════════════════
//  P6 · Digital Attention by Borough
// ═══════════════════════════════════════════════

// ── Configuration Constants ─────────────
const BOROUGH_FILES = {
  ranking: 'data/temporal_borough_ranking.json',
  summary: 'data/temporal_borough_summary.json',
  meta:    'data/temporal_borough_meta.json'
};

const BOROUGH_COLORS = {
  All: '#4E79A7',
  Cultural_Heritage: '#9966CC',
  Green_Recreation: '#5B9DE8',
  Commercial: '#F0D060'
};

// ── Borough IIFE ─────────────
(function initBoroughSection() {
  const chartWrap = document.getElementById('borough-bar-chart');
  if (!chartWrap) return;

  const state = {
    monthIndex: 0,
    categoryKey: 'All',
    playing: false,
    timer: null
  };

  let rankingData = [];
  let summaryData = [];
  let metaData = null;

  const monthEl = document.getElementById('borough-current-month');
  const sliderEl = document.getElementById('borough-slider');
  const playBtn = document.getElementById('borough-play-btn');
  const totalEl = document.getElementById('borough-total-value');
  const top5El = document.getElementById('borough-top5-list');
  const catBtns = document.querySelectorAll('.borough-cat-btn');

  // ── Data Loading ─────────────
  Promise.all([
    fetch(BOROUGH_FILES.ranking).then(r => r.json()),
    fetch(BOROUGH_FILES.summary).then(r => r.json()),
    fetch(BOROUGH_FILES.meta).then(r => r.json())
  ]).then(([ranking, summary, meta]) => {
    rankingData = ranking;
    summaryData = summary;
    metaData = meta;

    const maxIndex = metaData.months.length - 1;
    sliderEl.max = maxIndex;
    sliderEl.value = state.monthIndex;

    bindBoroughControls();
    updateBoroughView();
    window.addEventListener('resize', updateBoroughView);
  }).catch(err => {
    console.error('Borough section failed to load:', err);
  });

  // ── User Interaction ─────────────
  function bindBoroughControls() {
    sliderEl.addEventListener('input', (e) => {
      stopPlayback();
      state.monthIndex = Number(e.target.value);
      updateBoroughView();
    });

    playBtn.addEventListener('click', () => {
      if (state.playing) {
        stopPlayback();
      } else {
        startPlayback();
      }
    });

    catBtns.forEach(btn => {
      btn.addEventListener('click', () => {
        stopPlayback();
        catBtns.forEach(b => b.classList.remove('active'));
        btn.classList.add('active');
        state.categoryKey = btn.dataset.category;
        updateBoroughView();
      });
    });
  }

  function startPlayback() {
    if (state.playing) return;
    state.playing = true;
    playBtn.textContent = 'Pause';

    state.timer = setInterval(() => {
      const maxIndex = metaData.months.length - 1;
      state.monthIndex = state.monthIndex >= maxIndex ? 0 : state.monthIndex + 1;
      updateBoroughView();
    }, 1000);
  }

  function stopPlayback() {
    state.playing = false;
    playBtn.textContent = 'Play';
    if (state.timer) {
      clearInterval(state.timer);
      state.timer = null;
    }
  }

  function updateBoroughView() {
    const monthMeta = metaData.months.find(d => d.month_index === state.monthIndex);
    if (!monthMeta) return;

    monthEl.textContent = monthMeta.month_label;
    sliderEl.value = state.monthIndex;

    renderBoroughChart();
    renderBoroughSummary();
  }

  // ── Chart ─────────────
  function renderBoroughChart() {
    const rows = rankingData
      .filter(d => d.month_index === state.monthIndex)
      .filter(d => d.category_key === state.categoryKey)
      .sort((a, b) => b.value - a.value);

    if (!rows.length) return;

    const margin = { top: 16, right: 90, bottom: 28, left: 150 };
    const rowHeight = 22;
    const innerHeight = rows.length * rowHeight;
    const width = chartWrap.clientWidth || 900;
    const height = innerHeight + margin.top + margin.bottom;
    const innerWidth = width - margin.left - margin.right;

    const x = d3.scaleLinear()
      .domain([0, d3.max(rows, d => d.value)]).nice()
      .range([0, innerWidth]);

    const y = d3.scaleBand()
      .domain(rows.map(d => d.borough))
      .range([0, innerHeight])
      .padding(0.16);

    d3.select(chartWrap).selectAll('*').remove();

    const svg = d3.select(chartWrap)
      .append('svg')
      .attr('width', width)
      .attr('height', height);

    const g = svg.append('g')
      .attr('transform', `translate(${margin.left},${margin.top})`);

    // x axis
    g.append('g')
      .attr('class', 'borough-axis')
      .attr('transform', `translate(0,${innerHeight})`)
      .call(
        d3.axisBottom(x)
          .ticks(6)
          .tickFormat(d => {
            if (d >= 1000000) return (d / 1000000).toFixed(1) + 'M';
            if (d >= 1000) return (d / 1000).toFixed(0) + 'k';
            return d;
          })
      );

    // y axis
    g.append('g')
      .attr('class', 'borough-axis')
      .call(d3.axisLeft(y).tickSize(0))
      .call(g => g.select('.domain').remove());

    const barColor = BOROUGH_COLORS[state.categoryKey] || '#4E79A7';

    g.selectAll('.borough-bar')
      .data(rows, d => d.borough)
      .join('rect')
      .attr('class', 'borough-bar')
      .attr('x', 0)
      .attr('y', d => y(d.borough))
      .attr('height', y.bandwidth())
      .attr('width', d => x(d.value))
      .attr('fill', barColor)
      .attr('opacity', 0.88);

    g.selectAll('.borough-value-label')
      .data(rows, d => d.borough)
      .join('text')
      .attr('class', 'borough-value-label')
      .attr('x', d => x(d.value) + 6)
      .attr('y', d => y(d.borough) + y.bandwidth() / 2 + 4)
      .text(d => d3.format(',')(Math.round(d.value)));
  }
    
  // ── Summary ─────────────
  function renderBoroughSummary() {
    const row = summaryData.find(
      d => d.month_index === state.monthIndex && d.category_key === state.categoryKey
    );
    if (!row) return;

    totalEl.textContent = d3.format(',')(Math.round(row.london_total_pageviews));

    top5El.innerHTML = '';
    row.top5_boroughs.forEach(item => {
      const li = document.createElement('li');
      li.textContent = `${item.borough} — ${d3.format(',')(Math.round(item.value))}`;
      top5El.appendChild(li);
    });
  }
})();
