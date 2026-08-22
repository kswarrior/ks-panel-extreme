// Nodes types - extracted from Nodes.tsx

import type { Node } from '@/shared/types/node';

export interface StateStyle {
  dot: string;
  badge: string;
  label: string;
  icon: 'ok' | 'warn' | 'idle' | 'off';
  tileBg: string;
  accent: string;
  glow: string;
  text: string;
}

export const MONITOR_BARS = 40;

export const STATE_STYLES: Record<Node['state'] & string, StateStyle> = {
  up: {
    dot: 'bg-emerald-400', badge: 'bg-emerald-500/15 text-emerald-200 border-emerald-400/30', label: 'UP', icon: 'ok',
    tileBg: 'from-emerald-500/25 to-emerald-700/10 border-emerald-400/30 text-emerald-300',
    accent: 'from-emerald-400/70', glow: '0 0 0 1px rgba(16,185,129,0.10), 0 18px 40px -12px rgba(16,185,129,0.25)', text: 'text-emerald-300',
  },
  partial: {
    dot: 'bg-amber-400', badge: 'bg-amber-500/15 text-amber-200 border-amber-400/30', label: 'PARTIAL', icon: 'warn',
    tileBg: 'from-amber-500/25 to-amber-700/10 border-amber-400/30 text-amber-300',
    accent: 'from-amber-400/70', glow: '0 0 0 1px rgba(245,158,11,0.10), 0 18px 40px -12px rgba(245,158,11,0.25)', text: 'text-amber-300',
  },
  pending: {
    dot: 'bg-sky-400', badge: 'bg-sky-500/15 text-sky-200 border-sky-400/30', label: 'PENDING', icon: 'idle',
    tileBg: 'from-sky-500/25 to-sky-700/10 border-sky-400/30 text-sky-300',
    accent: 'from-sky-400/70', glow: '0 0 0 1px rgba(14,165,233,0.10), 0 18px 40px -12px rgba(14,165,233,0.25)', text: 'text-sky-300',
  },
  down: {
    dot: 'bg-red-400', badge: 'bg-red-500/15 text-red-200 border-red-400/30', label: 'DOWN', icon: 'off',
    tileBg: 'from-red-500/25 to-red-700/10 border-red-400/30 text-red-300',
    accent: 'from-red-400/70', glow: '0 0 0 1px rgba(239,68,68,0.10), 0 18px 40px -12px rgba(239,68,68,0.28)', text: 'text-red-300',
  },
};

export const DRIVER_ARCS: { key: 'driver_docker' | 'driver_kvm' | 'driver_multipass' | 'driver_lxd'; color: string; label: string }[] = [
  { key: 'driver_docker', color: '#60a5fa', label: 'Docker' },
  { key: 'driver_kvm', color: '#34d399', label: 'KVM' },
  { key: 'driver_multipass', color: '#fbbf24', label: 'Multipass' },
  { key: 'driver_lxd', color: '#f472b6', label: 'LXD' },
];