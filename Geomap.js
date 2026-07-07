let map;
let marker;
let kmzLayer = null;
let kmzFeatures = [];
let userMarker = null;
let userAccuracyCircle = null;
let unitMarker = null;
window.unitLat = null;
window.unitLon = null;

function pointInPolygon(point, polygon) {
  if (!polygon || polygon.length < 3) return false;

  const lng = point[0];
  const lat = point[1];
  let inside = false;

  for (let i = 0, j = polygon.length - 1; i < polygon.length; j = i++) {
    const lngi = polygon[i][0];
    const lati = polygon[i][1];
    const lngj = polygon[j][0];
    const latj = polygon[j][1];

    if (((lati > lat) !== (latj > lat)) && (lng < (lngj - lngi) * (lat - lati) / (latj - lati) + lngi)) {
      inside = !inside;
    }
  }

  return inside;
}

function getAreaName(lat, lng) {
  if (!kmzFeatures.length || lat == null || lng == null) return '-';

  for (const feature of kmzFeatures) {
    if (!feature.name) continue;
    if (pointInPolygon([lng, lat], feature.polygon)) {
      return feature.name;
    }
  }

  return 'Outside Area';
}

function updateAreaNameDisplay(lat, lng) {
  const areaEl = document.getElementById('areaName');
  if (areaEl) {
    const name = getAreaName(lat, lng);
    areaEl.textContent = 'User Location: ' + name;
    if (name === 'Outside Area') {
      areaEl.style.background = 'rgba(239,68,68,0.2)';
      areaEl.style.borderColor = 'rgba(239,68,68,0.4)';
    } else if (name !== '-') {
      areaEl.style.background = 'rgba(34,197,94,0.2)';
      areaEl.style.borderColor = 'rgba(34,197,94,0.4)';
    } else {
      areaEl.style.background = '';
      areaEl.style.borderColor = '';
    }
  }
}

window.getAreaName = getAreaName;

function updateUserMarker(lat, lng) {
  if (!map || lat == null || lng == null) return;

  const latlng = [lat, lng];

  if (userMarker) {
    userMarker.setLatLng(latlng);
  } else {
    userMarker = L.marker(latlng, {
      icon: L.divIcon({
        className: 'user-marker',
        html: '<div style="width:16px;height:16px;background:#22c55e;border:3px solid #fff;border-radius:50%;box-shadow:0 0 0 6px rgba(34,197,94,0.3),0 2px 6px rgba(0,0,0,0.4);"></div>',
        iconSize: [16, 16],
        iconAnchor: [8, 8]
      })
    }).addTo(map);
  }

  if (userAccuracyCircle) {
    userAccuracyCircle.setLatLng(latlng);
  }

  updateAreaNameDisplay(lat, lng);
}

function clearUserMarker() {
  if (userMarker) {
    map.removeLayer(userMarker);
    userMarker = null;
  }
  if (userAccuracyCircle) {
    map.removeLayer(userAccuracyCircle);
    userAccuracyCircle = null;
  }
}

function setUnitMarker(lat, lng) {
  unitLat = lat;
  unitLon = lng;

  const latlng = [lat, lng];

  if (unitMarker) {
    unitMarker.setLatLng(latlng);
  } else {
    unitMarker = L.marker(latlng, {
      icon: L.divIcon({
        className: 'unit-marker',
        html: '<div style="width:14px;height:14px;background:#f59e0b;border:3px solid #fff;border-radius:50%;box-shadow:0 0 0 6px rgba(245,158,11,0.3),0 2px 6px rgba(0,0,0,0.4);"></div>',
        iconSize: [14, 14],
        iconAnchor: [7, 7]
      })
    }).addTo(map);
  }

  updateUnitLocationDisplay(lat, lng);
}

function clearUnitMarker() {
  if (unitMarker) {
    map.removeLayer(unitMarker);
    unitMarker = null;
  }
  unitLat = null;
  unitLon = null;
}

function updateUnitLocationDisplay(lat, lng) {
  const el = document.getElementById('unitLocationDisplay');
  if (el) {
    const name = getAreaName(lat, lng);
    el.textContent = 'Unit Location: ' + name;
  }
}

window.updateUserMarker = updateUserMarker;
window.clearUserMarker = clearUserMarker;
window.setUnitMarker = setUnitMarker;
window.clearUnitMarker = clearUnitMarker;

async function loadKmz(file) {
  if (!file) return;
  if (!window.JSZip) {
    showPopup('JSZip belum dimuat', 'error');
    return;
  }
  if (!window.toGeoJSON) {
    showPopup('Library toGeoJSON belum dimuat', 'error');
    return;
  }

  try {
    const zip = await JSZip.loadAsync(file);
    let kmlFile = null;

    zip.forEach((path, zipEntry) => {
      if (path.toLowerCase().endsWith('.kml')) {
        kmlFile = zipEntry;
      }
    });

    if (!kmlFile) {
      showPopup('Tidak ada file KML di dalam KMZ', 'error');
      return;
    }

    const kmlText = await kmlFile.async('string');
    const parser = new DOMParser();
    const kmlDoc = parser.parseFromString(kmlText, 'application/xml');

    const geojson = toGeoJSON.kml(kmlDoc);

    if (kmzLayer) {
      map.removeLayer(kmzLayer);
    }

    kmzFeatures = [];
    geojson.features.forEach(f => {
      if (!f.properties || !f.properties.name) return;
      const addPolygon = (name, coords) => {
        if (coords && coords[0]) {
          kmzFeatures.push({ name, polygon: coords[0] });
        }
      };
      if (f.geometry.type === 'Polygon') {
        addPolygon(f.properties.name, f.geometry.coordinates);
      } else if (f.geometry.type === 'MultiPolygon') {
        f.geometry.coordinates.forEach(polygon => addPolygon(f.properties.name, polygon));
      } else if (f.geometry.type === 'GeometryCollection') {
        f.geometry.geometries.forEach(g => {
          if (g.type === 'Polygon') addPolygon(f.properties.name, g.coordinates);
          else if (g.type === 'MultiPolygon') g.coordinates.forEach(polygon => addPolygon(f.properties.name, polygon));
        });
      }
    });

    kmzLayer = L.geoJSON(geojson, {
      interactive: false,
      style: {
        color: '#ef4444',
        weight: 3,
        opacity: 0.9,
        fillColor: '#ef4444',
        fillOpacity: 0.15,
        dashArray: '8, 4'
      },
      onEachFeature: function (feature, layer) {
        const name = feature.properties && feature.properties.name;
        if (name) {
          layer.bindTooltip(name, {
            permanent: true,
            direction: 'center',
            className: 'kmz-tooltip'
          });
        }
      }
    }).addTo(map);

    map.fitBounds(kmzLayer.getBounds(), { padding: [40, 40] });

    const btnClear = document.getElementById('btnClearKmz');
    if (btnClear) btnClear.style.display = 'inline-block';

    showPopup('Boundary berhasil dimuat!', 'success');
  } catch (err) {
    console.error(err);
    showPopup('Gagal memuat KMZ: ' + err.message, 'error');
  }
}

function clearKmz() {
  if (kmzLayer) {
    map.removeLayer(kmzLayer);
    kmzLayer = null;
  }
  kmzFeatures = [];
  const btnClear = document.getElementById('btnClearKmz');
  if (btnClear) btnClear.style.display = 'none';
  showPopup('Boundary dihapus', 'success');
}

window.loadKmz = loadKmz;
window.clearKmz = clearKmz;

function isMobile() {
  return /Android|iPhone|iPad|iPod|Opera Mini|IEMobile|WPDesktop/i.test(navigator.userAgent);
}

function retinaScale() {
  return Math.min(window.devicePixelRatio || 1, 2);
}

function initMap() {
  const mapElement = document.getElementById('map');
  if (!mapElement) return;

  const defaultLatLng = [-2.5489, 118.0149];

  const tileUrl = 'https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png';

  const osmLayer = L.tileLayer(tileUrl, {
    attribution: '© OpenStreetMap',
    maxZoom: 19
  });

  map = L.map('map', {
    center: [0, 118],
    zoom: 5,
    zoomAnimation: false,
    fadeAnimation: false,
    markerZoomAnimation: false,
    maxBounds: [[-20, 88], [10, 148]],
    maxBoundsViscosity: 0.8,
    layers: [osmLayer]
  });

  // === KLIK PETA → MARKER ===
  function placeUnitMarker(latlng) {
    if (marker) map.removeLayer(marker);
    marker = L.marker(latlng, { draggable: true }).addTo(map);
    updateLatLon(latlng);
    setUnitMarker(latlng.lat, latlng.lng);
  }

  map.on('click', function (e) {
    placeUnitMarker(e.latlng);
  });

  // === JIKA ADA GPS TERAKHIR ===
  if (window.lokasiTerakhir && lokasiTerakhir.lat && lokasiTerakhir.lon) {
    const latlng = [lokasiTerakhir.lat, lokasiTerakhir.lon];
    map.setView(latlng, 14);
    marker = L.marker(latlng, { draggable: true }).addTo(map);
    updateUserMarker(lokasiTerakhir.lat, lokasiTerakhir.lon);
  }

  addLocateControl();
}

function addLocateControl() {
  const LocateControl = L.Control.extend({
    options: { position: 'topright' },
    onAdd: function () {
      const btn = L.DomUtil.create('div', 'locate-btn leaflet-bar');
      btn.innerHTML = '<svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="3"/><path d="M12 2v4M12 18v4M2 12h4M18 12h4"/></svg>';
      btn.title = 'Ke lokasi saya';
      L.DomEvent.disableClickPropagation(btn);
      btn.onclick = () => {
        if (!navigator.geolocation) {
          return;
        }
        const last = window.lokasiTerakhir;
        if (last && last.lat && last.lon) {
          map.setView([last.lat, last.lon], 15);
          updateUserMarker(last.lat, last.lon);
        }
        navigator.geolocation.getCurrentPosition(
          pos => {
            const latlng = [pos.coords.latitude, pos.coords.longitude];
             map.setView(latlng, 15);
             updateUserMarker(latlng[0], latlng[1]);
            updateLatLon({ lat: latlng[0], lng: latlng[1] });
            document.getElementById('lokasiInfo').textContent = `GPS: ${latlng[0].toFixed(5)}, ${latlng[1].toFixed(5)}`;
          },
          () => {},
          { enableHighAccuracy: false, timeout: 5000, maximumAge: 10000 }
        );
      };
      return btn;
    }
  });
  new LocateControl().addTo(map);
}

function updateLatLon(latlng) {
  if (!window.lokasiTerakhir) return;

  lokasiTerakhir.lat = latlng.lat;
  lokasiTerakhir.lon = latlng.lng;

  const info = document.getElementById("lokasiInfo");
  if (info) {
    info.textContent = `GPS: ${latlng.lat.toFixed(5)}, ${latlng.lng.toFixed(5)}`;
  }
}

// Jalankan setelah halaman siap
document.addEventListener("DOMContentLoaded", function () {
  initMap();
});
