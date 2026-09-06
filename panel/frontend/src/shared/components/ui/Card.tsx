import React from 'react';
import CardMediaLayer from '@/shared/components/ui/CardMediaLayer';
import { useThemeStore } from '@/shared/stores/themeStore';

interface CardProps {
  className?: string;
  // 'default' = base glass card (list/detail surfaces). 'strong' = floating
  // surfaces (modals, dropdowns). 'form' = form/settings sections — same
  // glass surface, but painted from the Theme Studio Form Card tokens
  // (ks-form-card) so the Cards-tab Form Card group restyles them.
  variant?: 'default' | 'strong' | 'form';
  children?: React.ReactNode;
  id?: string;
}

// Card is the baseline surface for every list card / form section /
// one-time disclosure modal. It layers on top of the AuroraBackground so
// the backdrop-blur actually has something to refract; without that
// visual context it would render as a flat sheet.
//
// The default variant uses .glass-card to get the hairline-hover border
// swap; pass `strong` for floating surfaces (modals, dropdowns) where the
// chrome shouldn't change on hover.
//
// A CardMediaLayer is mounted inside every card so that a VIDEO background
// set in the Theme Studio's Card tab (mp4 / gif) can paint — CSS
// background-image can't render a <video>, so the theme store only carries
// color / image / gradient through the --ks-card-bg-layer var and emits the
// video URL on --ks-card-bg-video, which CardMediaLayer turns into a real
// <video> behind the content. The layer no-ops (renders nothing) when no
// video is active, so cards with a color/image/gradient fill are unaffected.
//
// The active card.glass_style from the resolved Theme Studio theme is read
// here so an admin's "Glass style: strong / solid" choice applies to every
// card on the panel without per-component edits. The default 'frosted'
// adds no modifier class — the base .glass-card styling already is frosted.
const Card: React.FC<CardProps> = ({
  className = '',
  variant = 'default',
  children,
  id,
}) => {
  const base = variant === 'strong' ? 'glass-strong' : 'glass-card';
  // Subscribe to the active card.glass_style via the full active theme so
  // the modifier class rerenders when the admin changes it in the studio.
  // For default-theme lookups (used by GlassCard at module mount) .glass_style
  // is always defined on DEFAULT_THEME, so no fallback is needed.
  const glassStyle = useThemeStore((s) => {
    const t = s.active();
    return t.card.glass_style;
  });
  const modifier = !glassStyle || glassStyle === 'frosted'
    ? ''
    : glassStyle === 'solid'
      ? 'ks-card-glass-solid'
      : 'ks-card-glass-strong';
  return (
    <div id={id} className={`ks-card ${base} ${modifier} rounded-xl ${className}`}>
      <CardMediaLayer />
      {children}
    </div>
  );
};

export default Card;
