import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import * as L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import './MapPage.css';
import iconUrl from 'leaflet/dist/images/marker-icon.png';
import iconRetinaUrl from 'leaflet/dist/images/marker-icon-2x.png';
import shadowUrl from 'leaflet/dist/images/marker-shadow.png';
import { ExitFullscreenIcon, FullscreenIcon } from '../components/icons';
import { usePanels } from '../context/PanelsContext';
import { hasGeo, locStr, panelName } from '../lib/format';
import type { Panel } from '../lib/types';

L.Icon.Default.mergeOptions({ iconUrl, iconRetinaUrl, shadowUrl });

function popupContent(panel: Panel): HTMLElement {
  const root = document.createElement('div');
  const title = document.createElement('b');
  title.textContent = panelName(panel);
  root.appendChild(title);
  root.appendChild(document.createElement('br'));
  root.appendChild(document.createTextNode(locStr(panel)));
  if (panel.ip) {
    root.appendChild(document.createElement('br'));
    root.appendChild(document.createTextNode(panel.ip));
  }
  if (panel.version) {
    root.appendChild(document.createElement('br'));
    root.appendChild(document.createTextNode(panel.version));
  }
  return root;
}

export default function MapPage() {
  const { panels } = usePanels();
  const mapElement = useRef<HTMLDivElement | null>(null);
  const wrapElement = useRef<HTMLDivElement | null>(null);
  const mapRef = useRef<L.Map | null>(null);
  const markersRef = useRef<Map<string, L.Marker>>(new Map());
  const fittedRef = useRef(false);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const located = useMemo(() => panels.filter(hasGeo), [panels]);

  useEffect(() => {
    if (!mapElement.current) return;
    const map = L.map(mapElement.current, {
      zoomControl: true,
      attributionControl: false,
    }).setView([20, 0], 2);
    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
      maxZoom: 18,
    }).addTo(map);
    mapRef.current = map;
    const frame = window.requestAnimationFrame(() => map.invalidateSize());
    return () => {
      window.cancelAnimationFrame(frame);
      map.remove();
      mapRef.current = null;
      markersRef.current.clear();
      fittedRef.current = false;
    };
  }, []);

  const fit = useCallback(() => {
    const map = mapRef.current;
    if (!map) return;
    const points = located.map((panel) => [panel.lat, panel.lon] as L.LatLngTuple);
    if (points.length === 1) map.setView(points[0], 5);
    else if (points.length > 1) map.fitBounds(L.latLngBounds(points), { padding: [20, 20] });
  }, [located]);

  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;

    markersRef.current.forEach((marker) => marker.remove());
    markersRef.current.clear();

    const points: L.LatLngTuple[] = [];
    for (const panel of located) {
      const marker = L.marker([panel.lat, panel.lon])
        .addTo(map)
        .bindPopup(popupContent(panel));
      markersRef.current.set(panel.panel_id, marker);
      points.push([panel.lat, panel.lon]);
    }

    if (!fittedRef.current && points.length) {
      fittedRef.current = true;
      if (points.length === 1) map.setView(points[0], 5);
      else map.fitBounds(L.latLngBounds(points), { padding: [20, 20] });
    }
  }, [located]);

  function focusPanel(panel: Panel) {
    const map = mapRef.current;
    if (!map) return;
    map.setView([panel.lat, panel.lon], 6);
    markersRef.current.get(panel.panel_id)?.openPopup();
  }

  return (
    <div className="wrap">
      <div className="mapwrap">
        <div className="maphead">
          <span className="title">Fleet map</span>
          <span className="small">
            {located.length ? `${located.length} located • ${panels.length} total` : 'no geo yet'}
          </span>
          <span className="spacer" />
          <button className="pill" onClick={fit}>
            Fit bounds
          </button>
        </div>
        <div id="stats-map" ref={mapElement} />
      </div>

      <div className="table-wrap" style={{ marginTop: 12 }}>
        <div className="maphead">
          <span className="title">Located panels</span>
          <span className="small">{located.length ? `${located.length} panels` : ''}</span>
        </div>
        <div className="table-scroll" style={{ maxHeight: '28vh' }}>
          <table>
            <thead>
              <tr>
                <th>panel</th>
                <th>ip</th>
                <th>location</th>
                <th>coords</th>
              </tr>
            </thead>
            <tbody>
              {located.map((panel) => (
                <tr
                  key={panel.panel_id}
                  className="rowclick"
                  tabIndex={0}
                  onClick={() => focusPanel(panel)}
                  onKeyDown={(event) => {
                    if (event.key === 'Enter' || event.key === ' ') {
                      event.preventDefault();
                      focusPanel(panel);
                    }
                  }}
                >
                  <td>{panelName(panel)}</td>
                  <td>{panel.ip || '—'}</td>
                  <td>{locStr(panel)}</td>
                  <td>
                    {panel.lat.toFixed(2)},{panel.lon.toFixed(2)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
