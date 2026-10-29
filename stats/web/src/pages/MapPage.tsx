import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
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
  const link = document.createElement('a');
  link.className = 'popup-link';
  link.href = `/panels/${encodeURIComponent(panel.panel_id)}`;
  link.textContent = 'Open details →';
  root.appendChild(link);
  return root;
}

export default function MapPage() {
  const { panels } = usePanels();
  const [searchParams] = useSearchParams();
  const focusId = searchParams.get('panel');
  const mapElement = useRef<HTMLDivElement | null>(null);
  const wrapElement = useRef<HTMLDivElement | null>(null);
  const mapRef = useRef<L.Map | null>(null);
  const markersRef = useRef<L.Marker[]>([]);
  const markersByIdRef = useRef<Record<string, L.Marker>>({});
  const fittedRef = useRef(false);
  const focusedIdRef = useRef<string | null>(null);
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
      markersRef.current = [];
      markersByIdRef.current = {};
      fittedRef.current = false;
      focusedIdRef.current = null;
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
    function handleFullscreenChange() {
      setIsFullscreen(document.fullscreenElement === wrapElement.current);
      window.requestAnimationFrame(() => mapRef.current?.invalidateSize());
    }
    document.addEventListener('fullscreenchange', handleFullscreenChange);
    return () => document.removeEventListener('fullscreenchange', handleFullscreenChange);
  }, []);

  const toggleFullscreen = useCallback(async () => {
    const element = wrapElement.current;
    if (!element) return;
    try {
      if (document.fullscreenElement === element) await document.exitFullscreen();
      else await element.requestFullscreen();
    } catch {
      // fullscreen may be unavailable in the current browser context
    }
  }, []);

  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;

    const liveIds = new Set(located.map((panel) => panel.panel_id));
    for (const [id, marker] of Object.entries(markersByIdRef.current)) {
      if (!liveIds.has(id)) {
        marker.remove();
        delete markersByIdRef.current[id];
      }
    }

    const points: L.LatLngTuple[] = [];
    for (const panel of located) {
      const point: L.LatLngTuple = [panel.lat, panel.lon];
      const existing = markersByIdRef.current[panel.panel_id];
      if (existing) {
        existing.setLatLng(point);
        existing.setPopupContent(popupContent(panel));
      } else {
        const marker = L.marker(point)
          .addTo(map)
          .bindPopup(popupContent(panel));
        markersByIdRef.current[panel.panel_id] = marker;
      }
      points.push(point);
    }
    markersRef.current = Object.values(markersByIdRef.current);

    if (!fittedRef.current && points.length) {
      fittedRef.current = true;
      if (points.length === 1) map.setView(points[0], 5);
      else map.fitBounds(L.latLngBounds(points), { padding: [20, 20] });
    }
  }, [located]);

  useEffect(() => {
    if (!focusId) {
      focusedIdRef.current = null;
      return;
    }
    if (focusedIdRef.current === focusId) return;
    const map = mapRef.current;
    const target = located.find((panel) => panel.panel_id === focusId);
    const marker = markersByIdRef.current[focusId];
    if (!map || !target || !marker) return;
    focusedIdRef.current = focusId;
    map.setView([target.lat, target.lon], 8);
    marker.openPopup();
  }, [focusId, located]);

  return (
    <div className="wrap">
      <div className="mapwrap" ref={wrapElement}>
        <div className="maphead">
          <span className="title">Fleet map</span>
          <span className="small">
            {located.length ? `${located.length} located • ${panels.length} total` : 'no geo yet'}
          </span>
          <span className="spacer" />
          <button className="pill" onClick={fit}>
            Fit bounds
          </button>
          <button
            className="iconbtn"
            onClick={toggleFullscreen}
            title={isFullscreen ? 'Exit full screen' : 'Full screen'}
            aria-label={isFullscreen ? 'Exit full screen' : 'Full screen'}
          >
            {isFullscreen ? (
              <ExitFullscreenIcon width={16} height={16} />
            ) : (
              <FullscreenIcon width={16} height={16} />
            )}
          </button>
        </div>
        <div id="stats-map" ref={mapElement} />
      </div>
    </div>
  );
}
