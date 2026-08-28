// Nodes UI components - extracted from Nodes.tsx

import React from 'react';
import type { Node } from '@/shared/types/node';
import { formatBytes, formatBytesPair, formatPercent, withAlpha } from '../utils/nodesUtils';
import { DRIVER_ARCS } from '../types/nodes';

// HeartbeatIcon
export const HeartbeatIcon: React.FC<{ state: 'up' | 'down' | 'pending' | 'partial' }> = ({ state }) => {
  const alive = state === 'up' || state === 'partial';
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
      strokeLinecap="round"
      strokeLinejoin="round"
      className={`w-5 h-5 ${alive ? 'animate-pulse' : ''}`}
    >
      <line x1="2" y1="17" x2="22" y2="17" opacity={alive ? '0.35' : '0.2'} />
      {alive ? (
        <path d="M2 17 L6 17 L8 11 L10 21 L12 13 L14 17 L22 17" />
      ) : (
        <path d="M2 17 L7 17 L9 17 L11 17 L13 17 L22 17" />
      )}
      {!alive && (
        <line
          x1="5"
          y1="5"
          x2="19"
          y2="19"
          stroke="currentColor"
          strokeWidth="2"
          opacity="0.95"
        />
      )}
     </svg>
  );
};

// DriverRing
export const DriverRing: React.FC<{ node: Node }> = ({ node }) => {
  const r = 11;
  const stroke = 5;
  const c = 2 * Math.PI * r;
  const seg = c / 4;
  const grey = '#374151';
  const driversOk = node.hw_drivers_ok !== false;
  return (
    <div className="relative shrink-0" title={`Drivers: ${DRIVER_ARCS.map((a) => `${a.label} ${node[a.key] ? '✓' : '✗'}`).join(' • ')}${driversOk ? '' : ' ⚠ detection failed'}`}>
      <svg width="30" height="30" viewBox="0 0 30 30" className="-rotate-90">
        <circle cx="15" cy="15" r={r} fill="none" stroke="var(--ks-chart-track, #1f2937)" strokeWidth={stroke} />
        {DRIVER_ARCS.map((a, i) => {
          const on = node[a.key] && driversOk;
          return (
            <circle
              key={a.key}
              cx="15"
              cy="15"
              r={r}
              fill="none"
              stroke={on ? a.color : grey}
              strokeWidth={stroke}
              strokeDasharray={`${seg} ${c - seg}`}
              strokeDashoffset={-i * seg}
            />
          );
        })}
       </svg>
    </div>
  );
};

// ResourceBar
export const ResourceBar: React.FC<{
  label: string;
  pair: string;
  pct: number;
  from: string;
  to: string;
  ok?: boolean;
}> = ({ label, pair, pct, from, to, ok }) => {
  const noData = ok === false;
  const clamped = Math.max(0, Math.min(100, pct || 0));
  const title = noData
    ? `${label}: no data (edge couldn't collect this metric)`
    : `${label} ${pair} (${clamped.toFixed(0)}%)`;
  return (
    <div className="min-w-0" title={title}>
      <div className="flex items-baseline justify-between gap-2 mb-1">
        <span className="text-[10px] uppercase tracking-[0.12em] text-gray-500">{label}</span>
        <span className={`text-[11px] font-mono font-semibold truncate ${noData ? 'text-amber-400/80' : 'text-gray-100'}`}>
          {noData ? '—' : pair}
       </span>
      </div>
      <div className="h-1.5 rounded-full bg-white/[0.06] overflow-hidden">
        {!noData && clamped > 0 && (
          <div
            className="h-full rounded-full transition-[width] duration-700 ease-out"
            style={{ width: `${clamped}%`, background: `linear-gradient(90deg, ${from}, ${to})` }}
          />
        )}
        {noData && (
          <div
            className="h-full w-full"
            style={{
              background:
                'repeating-linear-gradient(45deg, rgba(245,158,11,0.35) 0 4px, transparent 4px 8px)',
            }}
          />
        )}
     </div>
    </div>
  );
};