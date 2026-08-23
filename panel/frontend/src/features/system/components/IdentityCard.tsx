import React from 'react';
import type { LocalHost } from '@/features/system/types/system';

interface IdentityCardProps {
  host: LocalHost;
  title: string;
  subtitle: string;
}

const IdentityCard: React.FC<IdentityCardProps> = ({ host, title, subtitle }) => (
  <div className="ks-card ks-form-card rounded-lg">
    <div className="text-[10px] uppercase tracking-wide text-gray-500">{title}</div>
    <div className="text-base text-white font-medium truncate">{host.hostname || '—'}</div>
    <div className="text-[11px] text-gray-400 font-mono truncate">{subtitle}</div>
  </div>
);

export default IdentityCard;