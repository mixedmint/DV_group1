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

// ═══════════════════════════════════════════════
//  Visualisation 5 · Attention and Socio-economic Context
// ═══════════════════════════════════════════════

const P5_FILES = {
  all: 'data/heatmap/msoa_hotspot_all.geojson',
  cultural: 'data/heatmap/msoa_hotspot_cultural.geojson',
  green: 'data/heatmap/msoa_hotspot_green.geojson',
  commercial: 'data/heatmap/msoa_hotspot_commercial.geojson',
  pois: 'data/london_all_poi.geojson',
  socio: 'data/socio_eco/msoa_socioeconomic_normalized.csv'
};

const P5_CATEGORY_LABELS = {
  all: 'All POIs',
  cultural: 'Cultural & Heritage',
  green: 'Green & Recreation',
  commercial: 'Commercial'
};

const P5_CATEGORY_COLORS = {
  all: '#56C9D6',
  cultural: '#9966CC',
  green: '#5B9DE8',
  commercial: '#F0D060'
};

const P5_HEX_COLOR_RANGE = [
  [237, 220, 255, 112],
  [215, 184, 247, 130],
  [190, 142, 232, 150],
  [158, 94, 205, 170],
  [125, 55, 174, 190],
  [92, 25, 135, 210]
];

const P5_HEX_ELEVATION_SCALES = {
  all: 5000,
  cultural: 5000,
  green: 5000,
  commercial: 5000
};

const P5_SOCIO_LABELS = {
  imd: 'IMD deprivation score',
  density: 'Population density',
  ptal: 'Public transport accessibility'
};

const P5_SOCIO_AXIS_LABELS = {
  imd: 'IMD score',
  density: 'Population density',
  ptal: 'Average PTAL/PTAI'
};

const P5_SOCIO_TEXT_LABELS = {
  imd: 'deprivation',
  density: 'population density',
  ptal: 'public transport accessibility'
};

const P5_VIEW_PRESETS = {
  top: { zoom: 9.08, pitch: 0, bearing: 0 },
  balanced: { zoom: 9.4, pitch: 32, bearing: -10 },
  threeD: { zoom: 9.25, pitch: 50, bearing: -18 }
};

(function initSocioEconomicSection() {
  const mapContainer = document.getElementById('map-p5');
  if (!mapContainer) return;

  const state = {
    category: 'all',
    socio: 'imd',
    selectedCode: null
  };

  let mapP5 = null;
  let mergedGeojson = null;
  let scatterData = [];
  let p5PoiData = [];
  let p5DeckOverlay = null;

  const tooltip = document.getElementById('p5-tooltip');
  const selectedCard = document.getElementById('p5-selected-card');
  const scatterEl = document.getElementById('p5-scatter');
  const scatterTitleEl = document.getElementById('p5-scatter-title');
  const correlationEl = document.getElementById('p5-correlation');
  const correlationNoteEl = document.getElementById('p5-correlation-note');
  const socioLegendTitleEl = document.getElementById('p5-socio-legend-title');

  Promise.all([
    fetch(P5_FILES.all).then(r => r.json()),
    fetch(P5_FILES.cultural).then(r => r.json()),
    fetch(P5_FILES.green).then(r => r.json()),
    fetch(P5_FILES.commercial).then(r => r.json()),
    fetch(P5_FILES.pois).then(r => r.json()),
    d3.csv(P5_FILES.socio, d3.autoType)
  ]).then(([allData, culturalData, greenData, commercialData, poiData, socioRows]) => {
    mergedGeojson = mergeP5Data({ allData, culturalData, greenData, commercialData, socioRows });
    scatterData = mergedGeojson.features.map(f => f.properties);
    p5PoiData = poiData.features
      .map(feature => ({
        ...feature,
        properties: {
          ...feature.properties,
          total_2025: toNumberOrZero(feature.properties.total_2025)
        }
      }))
      .filter(feature => feature.geometry?.type === 'Point' && feature.properties.total_2025 > 0);

    initP5Map();
    bindP5Controls();
    updateP5Legend();
    renderP5Scatter();
    updateP5Selected(null);
    window.addEventListener('resize', renderP5Scatter);
  }).catch(err => {
    console.error('Socio-economic section failed to load:', err);
  });

  function mergeP5Data({ allData, culturalData, greenData, commercialData, socioRows }) {
    const socioByMsoa = new Map(socioRows.map(row => [row.msoa, row]));
    const sourceByKey = {
      all: allData,
      cultural: culturalData,
      green: greenData,
      commercial: commercialData
    };

    const attentionLookup = {};
    Object.entries(sourceByKey).forEach(([key, geojson]) => {
      attentionLookup[key] = new Map(
        geojson.features.map(feature => [feature.properties.area_code, feature.properties])
      );
    });

    return {
      type: 'FeatureCollection',
      features: allData.features.map(feature => {
        const code = feature.properties.area_code;
        const socio = socioByMsoa.get(code) || {};
        const nextProps = {
          ...feature.properties,
          imd: toNumberOrNull(socio.imd),
          density: toNumberOrNull(socio.density),
          ptal: toNumberOrNull(socio.ptal),
          imd_norm: toNumberOrNull(socio.imd_norm),
          density_norm: toNumberOrNull(socio.density_norm),
          ptal_norm: toNumberOrNull(socio.ptal_norm)
        };

        Object.keys(sourceByKey).forEach(key => {
          const props = attentionLookup[key].get(code) || {};
          nextProps[`attention_${key}`] = toNumberOrZero(props.attention);
          nextProps[`log_attention_${key}`] = toNumberOrZero(props.log_attention);
        });

        return {
          ...feature,
          properties: nextProps
        };
      })
    };
  }

  function initP5Map() {
    mapP5 = new mapboxgl.Map({
      container: 'map-p5',
      style: 'mapbox://styles/mapbox/dark-v11',
      center: [-0.118, 51.509],
      ...P5_VIEW_PRESETS.balanced,
      dragRotate: true,
      pitchWithRotate: true,
      touchPitch: true,
      touchZoomRotate: true,
      attributionControl: false
    });

    mapP5.addControl(new mapboxgl.AttributionControl({ compact: true }));
    mapP5.addControl(new mapboxgl.NavigationControl(), 'top-left');
    mapP5.scrollZoom.enable();
    mapP5.dragRotate.enable();
    mapP5.touchZoomRotate.enable();
    if (mapP5.touchZoomRotate.enableRotation) mapP5.touchZoomRotate.enableRotation();
    if (mapP5.touchPitch?.enable) mapP5.touchPitch.enable();

    mapP5.on('load', () => {
      mapP5.addSource('p5-msoa', {
        type: 'geojson',
        data: mergedGeojson,
        promoteId: 'area_code'
      });

      mapP5.addLayer({
        id: 'p5-socio-fill',
        type: 'fill',
        source: 'p5-msoa',
        paint: getP5SocioPaint()
      });

      mapP5.addLayer({
        id: 'p5-msoa-outline',
        type: 'line',
        source: 'p5-msoa',
        paint: {
          'line-color': 'rgba(255,255,255,0.32)',
          'line-width': 0.45
        }
      });

      mapP5.addLayer({
        id: 'p5-msoa-highlight',
        type: 'line',
        source: 'p5-msoa',
        filter: ['==', 'area_code', ''],
        paint: {
          'line-color': '#ffffff',
          'line-width': 2.5
        }
      });

      initP5HexLayer();
      setupP5MapInteractions();
    });
  }

  function getP5SocioPaint() {
    const ramps = {
      imd: ['#f7fbff', '#d0e1f2', '#9ecae1', '#4292c6', '#2171b5', '#08306b'],
      density: ['#fff7bc', '#fee391', '#fec44f', '#fe9929', '#ec7014', '#b30000'],
      ptal: ['#f7fcf5', '#d9f0d3', '#addd8e', '#74c476', '#31a354', '#006d2c']
    };
    const ramp = ramps[state.socio] || ramps.imd;
    const breaks = getP5SocioBreaks(state.socio);

    return {
      'fill-color': [
        'step',
        ['coalesce', ['to-number', ['get', state.socio]], breaks[2] ?? 0],
        ramp[0],
        breaks[1], ramp[1],
        breaks[2], ramp[2],
        breaks[3], ramp[3],
        breaks[4], ramp[4],
        breaks[5], ramp[5]
      ],
      'fill-opacity': [
        'case',
        ['boolean', ['feature-state', 'selected'], false], 0.96,
        0.84
      ]
    };
  }

  function initP5HexLayer() {
    refreshP5HexLayer();
  }

  function refreshP5HexLayer() {
    if (!window.deck?.MapboxOverlay || !window.deck?.ColumnLayer) {
      console.warn('deck.gl is not available; P5 column attention layer was skipped.');
      return;
    }

    if (p5DeckOverlay && mapP5) {
      try {
        mapP5.removeControl(p5DeckOverlay);
      } catch (err) {
        console.warn('Previous P5 deck.gl overlay could not be removed cleanly:', err);
      }
      p5DeckOverlay = null;
    }

    p5DeckOverlay = new deck.MapboxOverlay({
      interleaved: false,
      layers: [buildP5HexLayer()]
    });
    mapP5.addControl(p5DeckOverlay);
  }

  function buildP5HexLayer() {
    const data = getP5ColumnData();

    return new deck.ColumnLayer({
      id: `p5-attention-column-${state.category}`,
      data,
      pickable: true,
      extruded: true,
      diskResolution: 6,
      radius: 312,
      coverage: 0.86,
      opacity: 0.72,
      elevationScale: P5_HEX_ELEVATION_SCALES[state.category] || P5_HEX_ELEVATION_SCALES.all,
      elevationRange: [0, 10],
      material: {
        ambient: 0.55,
        diffuse: 0.42,
        shininess: 24,
        specularColor: [255, 255, 255]
      },
      getPosition: d => d.center,
      getFillColor: d => getP5ColumnColor(d.heightMetric),
      getLineColor: d => d.area_code === state.selectedCode ? [255, 255, 255, 235] : [255, 255, 255, 90],
      lineWidthMinPixels: d => d.area_code === state.selectedCode ? 2 : 1,
      getElevation: d => d.heightMetric,
      onHover: info => {
        if (info.object) {
          showP5ColumnTooltip(info.object, info.x, info.y);
        } else {
          tooltip.style.display = 'none';
        }
      },
      onClick: info => {
        if (!info.object) return;
        selectP5Area(info.object.area_code, true);
      },
      updateTriggers: {
        getFillColor: [state.category, state.selectedCode],
        getLineColor: state.selectedCode,
        getElevation: state.category
      }
    });
  }

  function getP5ColumnData() {
    const attentionKey = `attention_${state.category}`;
    const logKey = `log_attention_${state.category}`;

    return mergedGeojson.features
      .map(feature => {
        const center = getFeatureCenter(feature);
        const props = feature.properties;
        const attention = Number(props[attentionKey]) || 0;

        return {
          area_code: props.area_code,
          area_name: props.area_name,
          center,
          attention,
          logAttention: Number(props[logKey]) || 0,
          heightMetric: getP5AttentionMetric(attention),
          imd: props.imd,
          density: props.density,
          ptal: props.ptal
        };
      })
      .filter(d => d.center && d.attention > 0);
  }

  function getP5AttentionMetric(attention) {
    if (attention <= 0) return 0;
    const logTotal = Math.log10(attention + 1);
    const normalized = Math.min(Math.max((logTotal - 2.1) / 4.0, 0), 1);
    return 0.14 + Math.pow(normalized, 2.0) * 1.85;
  }

  function getP5ColumnColor(metric) {
    if (metric <= 0.42) return P5_HEX_COLOR_RANGE[0];
    if (metric <= 0.68) return P5_HEX_COLOR_RANGE[1];
    if (metric <= 0.96) return P5_HEX_COLOR_RANGE[2];
    if (metric <= 1.26) return P5_HEX_COLOR_RANGE[3];
    if (metric <= 1.58) return P5_HEX_COLOR_RANGE[4];
    return P5_HEX_COLOR_RANGE[5];
  }

  function getP5AverageAttention() {
    const attentionKey = `attention_${state.category}`;
    const values = scatterData
      .map(d => Number(d[attentionKey]) || 0)
      .filter(v => v > 0);

    return values.length ? d3.mean(values) : 0;
  }

  function getP5AttentionBenchmark(attention) {
    const average = getP5AverageAttention();
    if (!average || attention <= 0) {
      return { symbol: '→', text: 'No meaningful comparison available.' };
    }

    const ratio = attention / average;
    if (ratio >= 1.1) {
      return {
        symbol: '↑',
        text: `${ratio.toFixed(1)}x the London MSOA average`
      };
    }
    if (ratio <= 0.9) {
      return {
        symbol: '↓',
        text: `${(average / Math.max(attention, 1)).toFixed(1)}x lower than the London MSOA average`
      };
    }

    return { symbol: '→', text: 'Close to the London MSOA average' };
  }

  function setupP5MapInteractions() {
    mapP5.on('mousemove', 'p5-socio-fill', (e) => {
      mapP5.getCanvas().style.cursor = 'pointer';
      const props = e.features[0].properties;
      showP5Tooltip(props, e.originalEvent.clientX, e.originalEvent.clientY);
    });

    mapP5.on('mouseleave', 'p5-socio-fill', () => {
      mapP5.getCanvas().style.cursor = '';
      tooltip.style.display = 'none';
    });

    mapP5.on('click', 'p5-socio-fill', (e) => {
      selectP5Area(e.features[0].properties.area_code, true);
    });

  }

  function bindP5Controls() {
    document.querySelectorAll('.p5-cat-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        document.querySelectorAll('.p5-cat-btn').forEach(b => b.classList.remove('active'));
        btn.classList.add('active');
        state.category = btn.dataset.category;
        refreshP5HexLayer();
        renderP5Scatter();
        updateP5Selected(state.selectedCode);
      });
    });

    document.querySelectorAll('.p5-socio-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        document.querySelectorAll('.p5-socio-btn').forEach(b => b.classList.remove('active'));
        btn.classList.add('active');
        state.socio = btn.dataset.socio;
        updateP5Legend();
        if (mapP5?.getLayer('p5-socio-fill')) {
          mapP5.setPaintProperty('p5-socio-fill', 'fill-color', getP5SocioPaint()['fill-color']);
        }
        renderP5Scatter();
        updateP5Selected(state.selectedCode);
      });
    });

    document.querySelectorAll('.p5-view-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        const preset = P5_VIEW_PRESETS[btn.dataset.view];
        if (!preset || !mapP5) return;
        document.querySelectorAll('.p5-view-btn').forEach(b => b.classList.remove('active'));
        btn.classList.add('active');
        mapP5.easeTo({ ...preset, duration: 650 });
      });
    });
  }

  function updateP5Legend() {
    socioLegendTitleEl.textContent = P5_SOCIO_LABELS[state.socio];
    const gradBar = document.querySelector('.p5-grad-bar');
    if (gradBar) {
      const legendClass = state.socio === 'imd' ? 'cool' : state.socio === 'ptal' ? 'transit' : 'warm';
      gradBar.className = `p5-grad-bar ${legendClass}`;
    }
  }

  function getP5SocioBreaks(key) {
    const values = scatterData
      .map(d => Number(d[key]))
      .filter(Number.isFinite)
      .sort((a, b) => a - b);

    if (!values.length) return [0, 0.2, 0.4, 0.6, 0.8, 1];

    const breaks = [0, 0.2, 0.4, 0.6, 0.8, 1].map(q => d3.quantileSorted(values, q));
    for (let i = 1; i < breaks.length; i += 1) {
      if (breaks[i] <= breaks[i - 1]) {
        breaks[i] = breaks[i - 1] + 0.0001;
      }
    }
    return breaks;
  }

  function renderP5Scatter() {
    if (!scatterEl) return;
    const width = scatterEl.clientWidth || 260;
    const height = scatterEl.clientHeight || 255;
    const margin = { top: 16, right: 14, bottom: 42, left: 52 };
    const innerWidth = Math.max(120, width - margin.left - margin.right);
    const innerHeight = Math.max(120, height - margin.top - margin.bottom);
    const socioKey = state.socio;
    const attentionKey = `attention_${state.category}`;
    const logKey = `log_attention_${state.category}`;

    const rows = scatterData.filter(d =>
      d[socioKey] != null &&
      d[attentionKey] != null &&
      Number.isFinite(Number(d[socioKey])) &&
      Number.isFinite(Number(d[attentionKey])) &&
      Number(d[attentionKey]) > 0
    );

    d3.select(scatterEl).selectAll('*').remove();
    scatterTitleEl.textContent = `${P5_SOCIO_LABELS[state.socio]} vs ${P5_CATEGORY_LABELS[state.category]} Attention`;

    const svg = d3.select(scatterEl)
      .append('svg')
      .attr('width', width)
      .attr('height', height);

    const g = svg.append('g')
      .attr('transform', `translate(${margin.left},${margin.top})`);

    const x = d3.scaleLinear()
      .domain(d3.extent(rows, d => Number(d[socioKey]))).nice()
      .range([0, innerWidth]);

    const y = d3.scaleLinear()
      .domain([0, d3.max(rows, d => Number(d[logKey]) || 0) || 1]).nice()
      .range([innerHeight, 0]);

    g.append('g')
      .attr('class', 'p5-scatter-axis')
      .attr('transform', `translate(0,${innerHeight})`)
      .call(d3.axisBottom(x).ticks(4).tickSizeOuter(0));

    g.append('g')
      .attr('class', 'p5-scatter-axis')
      .call(d3.axisLeft(y).ticks(5).tickSizeOuter(0));

    g.append('text')
      .attr('x', innerWidth / 2)
      .attr('y', innerHeight + 34)
      .attr('text-anchor', 'middle')
      .attr('fill', 'rgba(255,255,255,0.66)')
      .attr('font-size', 10)
      .text(P5_SOCIO_AXIS_LABELS[state.socio]);

    g.append('text')
      .attr('x', -innerHeight / 2)
      .attr('y', -38)
      .attr('transform', 'rotate(-90)')
      .attr('text-anchor', 'middle')
      .attr('fill', 'rgba(255,255,255,0.66)')
      .attr('font-size', 10)
      .text('log pageviews');

    g.selectAll('.p5-scatter-point')
      .data(rows, d => d.area_code)
      .join('circle')
      .attr('class', 'p5-scatter-point')
      .attr('cx', d => x(Number(d[socioKey])))
      .attr('cy', d => y(Number(d[logKey]) || 0))
      .attr('r', d => d.area_code === state.selectedCode ? 5 : 3)
      .attr('fill', d => d.area_code === state.selectedCode ? '#ffffff' : P5_CATEGORY_COLORS[state.category])
      .attr('stroke', 'rgba(0,0,0,0.55)')
      .attr('stroke-width', 0.6)
      .attr('opacity', d => d.area_code === state.selectedCode ? 1 : 0.58)
      .on('mouseenter', (event, d) => {
        showP5Tooltip(d, event.clientX, event.clientY);
      })
      .on('mouseleave', () => {
        tooltip.style.display = 'none';
      })
      .on('click', (event, d) => {
        selectP5Area(d.area_code, true);
      });

    const r = pearson(
      rows.map(d => Number(d[socioKey])),
      rows.map(d => Number(d[logKey]) || 0)
    );
    correlationEl.textContent = `Pearson r, pageviews > 0: ${Number.isFinite(r) ? r.toFixed(2) : '-'}`;
    if (correlationNoteEl) {
      correlationNoteEl.innerHTML = getP5CorrelationText(r, rows.length);
    }
  }

  function getP5CorrelationText(r, n) {
    if (!Number.isFinite(r) || n < 3) {
      return 'There are too few non-zero MSOAs to describe a <strong>stable relationship</strong> for this selection.';
    }

    const socioLabel = P5_SOCIO_TEXT_LABELS[state.socio];
    const categoryLabel = P5_CATEGORY_LABELS[state.category].toLowerCase();
    const absR = Math.abs(r);
    const strength = absR < 0.15 ? 'very weak' : absR < 0.3 ? 'weak' : absR < 0.5 ? 'moderate' : 'strong';
    const direction = r > 0 ? 'positive' : 'negative';

    if (absR < 0.15) {
      return `Among ${n} MSOAs with non-zero ${categoryLabel} pageviews, the relationship with ${socioLabel} is <strong>very weak</strong>, suggesting attention is <strong>not strongly structured</strong> by this variable alone.`;
    }

    const tendency = r > 0
      ? `higher ${socioLabel} tends to coincide with higher ${categoryLabel} attention`
      : `higher ${socioLabel} tends to coincide with lower ${categoryLabel} attention`;

    return `Among ${n} non-zero MSOAs, the relationship is <strong>${strength}</strong> and <strong>${direction}</strong>: ${tendency}.`;
  }

  function selectP5Area(code, flyToArea) {
    if (state.selectedCode && mapP5?.getSource('p5-msoa')) {
      mapP5.setFeatureState({ source: 'p5-msoa', id: state.selectedCode }, { selected: false });
    }

    state.selectedCode = code;

    if (code && mapP5?.getSource('p5-msoa')) {
      mapP5.setFeatureState({ source: 'p5-msoa', id: code }, { selected: true });
      mapP5.setFilter('p5-msoa-highlight', ['==', 'area_code', code]);
    } else if (mapP5?.getLayer('p5-msoa-highlight')) {
      mapP5.setFilter('p5-msoa-highlight', ['==', 'area_code', '']);
    }

    updateP5Selected(code);
    renderP5Scatter();

    if (flyToArea && code) {
      const feature = mergedGeojson.features.find(f => f.properties.area_code === code);
      const center = getFeatureCenter(feature);
      if (center) mapP5.easeTo({ center, zoom: Math.max(mapP5.getZoom(), 10.1), duration: 700 });
    }
  }

  function updateP5Selected(code) {
    const props = code ? scatterData.find(d => d.area_code === code) : null;
    if (!props) {
      selectedCard.innerHTML = `
        <div class="p5-selected-name">Click a map area, column or scatter point</div>
        <div class="p5-selected-grid">
          <span>Attention</span><strong>-</strong>
          <span>IMD</span><strong>-</strong>
          <span>Density</span><strong>-</strong>
          <span>PTAL</span><strong>-</strong>
        </div>
        <p class="p5-interpretation">Interaction links MSOA columns, the socio-economic basemap and the scatter plot.</p>
      `;
      return;
    }

    const attention = Number(props[`attention_${state.category}`]) || 0;
    const benchmark = getP5AttentionBenchmark(attention);
    selectedCard.innerHTML = `
      <div class="p5-selected-name">${props.area_name}</div>
      <div class="p5-selected-grid">
        <span>Attention</span><strong>${formatP5Number(attention)}</strong>
        <span>IMD</span><strong>${formatP5Decimal(props.imd)}</strong>
        <span>Density</span><strong>${formatP5Number(props.density)}</strong>
        <span>PTAL</span><strong>${formatP5Decimal(props.ptal)}</strong>
      </div>
      <p class="p5-benchmark">Attention level: ${benchmark.symbol} ${benchmark.text}</p>
      <p class="p5-interpretation">${getP5Interpretation(props, attention)}</p>
    `;
  }

  function showP5Tooltip(props, x, y) {
    const attention = Number(props[`attention_${state.category}`]) || 0;
    const benchmark = getP5AttentionBenchmark(attention);
    tooltip.innerHTML = `
      <div class="tt-name">${props.area_name || props.area_code}</div>
      <div class="tt-row">Attention: ${formatP5Number(attention)}</div>
      <div class="tt-row">Average level: ${benchmark.symbol} ${benchmark.text}</div>
      <div class="tt-row">IMD: ${formatP5Decimal(props.imd)}</div>
      <div class="tt-row">Density: ${formatP5Number(props.density)}</div>
      <div class="tt-row">PTAL: ${formatP5Decimal(props.ptal)}</div>
    `;
    tooltip.style.display = 'block';
    tooltip.style.left = (x + 12) + 'px';
    tooltip.style.top = (y + 12) + 'px';
  }

  function showP5ColumnTooltip(column, x, y) {
    const benchmark = getP5AttentionBenchmark(column.attention);
    tooltip.innerHTML = `
      <div class="tt-name">${column.area_name}</div>
      <div class="tt-row">MSOA attention: ${formatP5Number(column.attention)}</div>
      <div class="tt-row">Average level: ${benchmark.symbol} ${benchmark.text}</div>
      <div class="tt-row">IMD: ${formatP5Decimal(column.imd)}</div>
      <div class="tt-row">Density: ${formatP5Number(column.density)}</div>
      <div class="tt-row">PTAL: ${formatP5Decimal(column.ptal)}</div>
    `;
    tooltip.style.display = 'block';
    tooltip.style.left = (x + 12) + 'px';
    tooltip.style.top = (y + 12) + 'px';
  }

  function getP5Interpretation(props, attention) {
    const socioNorm = Number(props[`${state.socio}_norm`]);
    const attentionLog = Number(props[`log_attention_${state.category}`]) || 0;
    const socioHigh = socioNorm >= 0.66;
    const socioLow = socioNorm <= 0.33;
    const attentionHigh = attentionLog >= 4;

    if (attentionHigh && socioHigh && state.socio === 'imd') {
      return 'This area has high attention despite high deprivation.';
    }
    if (attentionHigh && socioLow && state.socio === 'imd') {
      return 'This area combines high attention with relatively low deprivation.';
    }
    if (attentionHigh && socioHigh && state.socio === 'density') {
      return 'This area combines high attention with high population density.';
    }
    if (attentionHigh && socioHigh && state.socio === 'ptal') {
      return 'This area combines high attention with strong public transport accessibility.';
    }
    if (attention === 0) {
      return 'No matched Wikipedia attention is recorded for this category.';
    }
    return 'Compare this MSOA with the scatter plot to judge whether attention is above or below areas with similar context.';
  }

  function getFeatureCenter(feature) {
    if (!feature) return null;
    const coords = [];
    collectCoordinates(feature.geometry.coordinates, coords);
    if (!coords.length) return null;
    const lng = d3.mean(coords, d => d[0]);
    const lat = d3.mean(coords, d => d[1]);
    return [lng, lat];
  }

  function collectCoordinates(node, out) {
    if (!Array.isArray(node)) return;
    if (typeof node[0] === 'number' && typeof node[1] === 'number') {
      out.push(node);
      return;
    }
    node.forEach(child => collectCoordinates(child, out));
  }

  function pearson(xs, ys) {
    const n = Math.min(xs.length, ys.length);
    if (n < 2) return NaN;
    const meanX = d3.mean(xs);
    const meanY = d3.mean(ys);
    const numerator = d3.sum(xs, (x, i) => (x - meanX) * (ys[i] - meanY));
    const denomX = Math.sqrt(d3.sum(xs, x => (x - meanX) ** 2));
    const denomY = Math.sqrt(d3.sum(ys, y => (y - meanY) ** 2));
    return numerator / (denomX * denomY);
  }

  function toNumberOrZero(value) {
    const next = Number(value);
    return Number.isFinite(next) ? next : 0;
  }

  function toNumberOrNull(value) {
    const next = Number(value);
    return Number.isFinite(next) ? next : null;
  }

  function formatP5Number(value) {
    if (value == null || value === '') return '-';
    const next = Number(value);
    if (!Number.isFinite(next)) return '-';
    return d3.format(',')(Math.round(next));
  }

  function formatP5Decimal(value) {
    if (value == null || value === '') return '-';
    const next = Number(value);
    if (!Number.isFinite(next)) return '-';
    return next.toFixed(1);
  }
})();
