import React from 'react';
import { initials } from './SocialIcons';

// Avatar renders a rounded-circle representation of the user. The resolution
// order mirrors Discord's: uploaded image first, then the chosen default
// symbol on the accent colour, then the initials fallback. Sizes propagate
// via the `size` prop (px) so the same component backs the corner of a card,
// the menu, and the big header.
export interface AvatarProps {
  name: string;
  imageUrl?: string;
  symbol?: string;
  accentColor?: string;
  size?: number;
  className?: string;
}

const Avatar: React.FC<AvatarProps> = ({
  name,
  imageUrl,
  symbol,
  accentColor,
  size = 64,
  className = '',
}) => {
  const radius = Math.round(size / 2);
  const accent = accentColor && accentColor.trim() !== '' ? accentColor : '#5865F2';
  const style: React.CSSProperties = {
    width: size,
    height: size,
    borderRadius: radius,
    // Ring outlined in the accent color so the avatar reads even when the
    // uploaded image is mostly black; the 2px stroke is sized relative to the
    // smallest avatars we render (32px) without overlapping the image.
    boxShadow: `0 0 0 2px ${accent}33`,
  };

  if (imageUrl) {
    return (
      <img
        src={imageUrl}
        alt={name}
        style={style}
        className={`object-cover ${className}`}
        loading="lazy"
      />
    );
  }

  // No uploaded image — fall back to the symbol (if any) painted on the
  // accent gradient, otherwise the initials.
  const hasSymbol = symbol && symbol.trim() !== '';
  return (
    <div
      aria-label={name}
      role="img"
      style={{
        ...style,
        background: `linear-gradient(135deg, ${accent} 0%, ${accent}cc 100%)`,
      }}
      className={`flex items-center justify-center text-white font-semibold select-none overflow-hidden ${className}`}
    >
      {hasSymbol ? (
        <span style={{ fontSize: size * 0.5, lineHeight: 1 }}>{symbol}</span>
      ) : (
        <span style={{ fontSize: size * 0.38, letterSpacing: '0.5px' }}>{initials(name)}</span>
      )}
    </div>
  );
};

export default Avatar;
