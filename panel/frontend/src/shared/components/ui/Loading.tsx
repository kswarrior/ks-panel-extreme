import React from 'react';

// Loading types
export type LoadingType = 'cycle' | 'horizontal-bar' | 'vertical-bar' | 'dots' | 'pulse' | 'wave' | 'spiral' | 'skeleton';
export type SkeletonType = 'cards' | 'list' | 'text' | 'avatar' | 'mixed';

interface LoadingProps {
  type?: LoadingType;
  color?: string;
  size?: 'sm' | 'md' | 'lg';
  text?: string;
  fullScreen?: boolean;
  className?: string;
  // Skeleton-specific options. Ignored unless type === 'skeleton'.
  skeletonType?: SkeletonType;
  skeletonCount?: number;
  skeletonLines?: number;
  skeletonBaseColor?: string;
  skeletonShimmerColor?: string;
  skeletonSpeed?: 'slow' | 'normal' | 'fast';
  skeletonInterval?: number;
  skeletonRadius?: number;
  // Background options (colour / image / video / gradient with opacity + blur).
  bgType?: 'color' | 'image' | 'video' | 'gradient';
  background?: string;
  bgImage?: string;
  bgVideo?: string;
  bgGradient?: string;
  bgOpacity?: number;
  bgSize?: string;
  bgPosition?: string;
  bgRepeat?: 'repeat' | 'no-repeat';
  bgBlur?: number;
}

const Loading: React.FC<LoadingProps> = ({
  type = 'cycle',
  color = 'text-[var(--ks-loading-color,#3b82f6)]',
  size = 'md',
  text,
  fullScreen = false,
  className = '',
  skeletonType = 'cards',
  skeletonCount = 3,
  skeletonLines = 3,
  skeletonBaseColor = 'rgba(255,255,255,0.08)',
  skeletonShimmerColor = 'rgba(255,255,255,0.18)',
  skeletonSpeed = 'normal',
  skeletonInterval = 1200,
  skeletonRadius = 6,
  bgType = 'color',
  background = 'rgba(15, 23, 42, 0.65)',
  bgImage = '',
  bgVideo = '',
  bgGradient = '',
  bgOpacity = 1,
  bgSize = 'cover',
  bgPosition = 'center',
  bgRepeat = 'no-repeat',
  bgBlur = 0,
}) => {
  const sizeClasses = {
    sm: 'w-4 h-4',
    md: 'w-8 h-8',
    lg: 'w-12 h-12',
  };

  const textSizeClasses = {
    sm: 'text-sm',
    md: 'text-base',
    lg: 'text-lg',
  };

  const loadingContent = (
    <div className={`ks-loading-host flex flex-col items-center justify-center ${type === 'skeleton' ? 'w-full' : sizeClasses[size]} ${color} ${className}`}>
      {type === 'cycle' && (
        <div className={`animate-spin rounded-full border-2 border-current border-t-transparent ${sizeClasses[size]}`} />
      )}
      
      {type === 'horizontal-bar' && (
        <div className="flex space-x-1">
          <div className="animate-bounce w-1 h-4 bg-current rounded" style={{ animationDelay: '0ms' }} />
          <div className="animate-bounce w-1 h-6 bg-current rounded" style={{ animationDelay: '150ms' }} />
          <div className="animate-bounce w-1 h-4 bg-current rounded" style={{ animationDelay: '300ms' }} />
        </div>
      )}
      
      {type === 'vertical-bar' && (
        <div className="flex flex-col space-y-1">
          <div className="animate-bounce w-4 h-1 bg-current rounded" style={{ animationDelay: '0ms' }} />
          <div className="animate-bounce w-4 h-6 bg-current rounded" style={{ animationDelay: '150ms' }} />
          <div className="animate-bounce w-4 h-1 bg-current rounded" style={{ animationDelay: '300ms' }} />
        </div>
      )}
      
      {type === 'dots' && (
        <div className="flex space-x-1">
          <div className="animate-pulse w-2 h-2 bg-current rounded-full" style={{ animationDelay: '0ms' }} />
          <div className="animate-pulse w-2 h-2 bg-current rounded-full" style={{ animationDelay: '150ms' }} />
          <div className="animate-pulse w-2 h-2 bg-current rounded-full" style={{ animationDelay: '300ms' }} />
        </div>
      )}
      
      {type === 'pulse' && (
        <div className={`animate-pulse ${sizeClasses[size]} bg-current rounded-full`} />
      )}
      
      {type === 'wave' && (
        <div className="relative">
          <div className="animate-wave w-8 h-8 bg-current rounded-full" />
        </div>
      )}
      
      {type === 'spiral' && (
        <div className={`animate-spin ${sizeClasses[size]} bg-current rounded-full`} style={{ animationDirection: 'reverse' }} />
      )}

      {type === 'skeleton' && (() => {
        // Map the speed preset + interval (ms) to a CSS animation-duration
        // and per-item stagger delay. The interval doubles as both the
        // minimum visible time (so skeleton flashes don't feel jumpy) and
        // the delay between consecutive items lighting up.
        const speedDuration =
          skeletonSpeed === 'slow' ? Math.max(skeletonInterval, 2200) :
          skeletonSpeed === 'fast' ? Math.max(600, Math.floor(skeletonInterval * 0.5)) :
          Math.max(900, skeletonInterval);
        const staggerMs = Math.max(60, Math.floor(skeletonInterval / 8));
        const count = Math.max(1, Math.min(12, skeletonCount));
        const lines = Math.max(1, Math.min(8, skeletonLines));
        const radius = `${Math.max(0, skeletonRadius)}px`;

        // Helper to render a shimmer bar with a configurable width + delay.
        const Bar: React.FC<{ width: string; delayMs: number; h?: string; mt?: string }> = ({ width, delayMs, h = '0.5rem', mt = '' }) => (
          <div
            className={`animate-pulse ${mt}`}
            style={{
              width,
              height: h,
              borderRadius: radius,
              backgroundColor: skeletonShimmerColor,
              animationDuration: `${speedDuration}ms`,
              animationDelay: `${delayMs}ms`,
            }}
          />
        );

        // Render one skeleton item based on the chosen layout variant.
        const renderItem = (idx: number) => {
          const baseDelay = idx * staggerMs;
          const cardStyle: React.CSSProperties = {
            backgroundColor: skeletonBaseColor,
            borderRadius: radius,
            animationDuration: `${speedDuration}ms`,
            animationDelay: `${baseDelay}ms`,
          };

          if (skeletonType === 'list') {
            return (
              <div key={idx} className="flex items-center gap-3 p-3 animate-pulse" style={cardStyle}>
                <div
                  className="animate-pulse shrink-0"
                  style={{
                    width: '2.25rem', height: '2.25rem', borderRadius: '9999px',
                    backgroundColor: skeletonShimmerColor,
                    animationDuration: `${speedDuration}ms`,
                    animationDelay: `${baseDelay}ms`,
                  }}
                />
                <div className="flex-1 space-y-1.5">
                  <Bar width="60%" delayMs={baseDelay + staggerMs} h="0.625rem" />
                  <Bar width="90%" delayMs={baseDelay + staggerMs * 2} h="0.375rem" />
               </div>
             </div>
            );
          }

          if (skeletonType === 'text') {
            return (
              <div key={idx} className="p-3 space-y-2 animate-pulse" style={cardStyle}>
                {Array.from({ length: lines }).map((_, li) => (
                  <Bar
                    key={li}
                    width={`${Math.max(20, 95 - li * 11)}%`}
                    delayMs={baseDelay + li * (staggerMs / 2)}
                    h="0.5rem"
                  />
                ))}
             </div>
            );
          }

          if (skeletonType === 'avatar') {
            return (
              <div key={idx} className="flex flex-col items-center gap-2 p-4 animate-pulse" style={cardStyle}>
                <div
                  className="animate-pulse"
                  style={{
                    width: '3.5rem', height: '3.5rem', borderRadius: '9999px',
                    backgroundColor: skeletonShimmerColor,
                    animationDuration: `${speedDuration}ms`,
                    animationDelay: `${baseDelay}ms`,
                  }}
                />
                <Bar width="60%" delayMs={baseDelay + staggerMs} h="0.5rem" />
                <Bar width="40%" delayMs={baseDelay + staggerMs * 2} h="0.375rem" />
             </div>
            );
          }

          if (skeletonType === 'mixed') {
            // Alternating layout per index so the preview shows the variety.
            return idx % 2 === 0 ? (
              <div key={idx} className="p-3 space-y-2 animate-pulse" style={cardStyle}>
                <Bar width="40%" delayMs={baseDelay} h="0.75rem" />
                <Bar width="90%" delayMs={baseDelay + staggerMs} h="0.4rem" />
                <Bar width="70%" delayMs={baseDelay + staggerMs * 2} h="0.4rem" />
             </div>
            ) : (
              <div key={idx} className="flex items-center gap-3 p-3 animate-pulse" style={cardStyle}>
                <div
                  className="animate-pulse shrink-0"
                  style={{
                    width: '2rem', height: '2rem', borderRadius: '9999px',
                    backgroundColor: skeletonShimmerColor,
                    animationDuration: `${speedDuration}ms`,
                    animationDelay: `${baseDelay}ms`,
                  }}
                />
                <div className="flex-1 space-y-1.5">
                  <Bar width="55%" delayMs={baseDelay + staggerMs} h="0.5rem" />
                  <Bar width="85%" delayMs={baseDelay + staggerMs * 2} h="0.375rem" />
               </div>
             </div>
            );
          }

          // Default 'cards' — a header bar plus several text lines.
          return (
            <div key={idx} className="p-3 animate-pulse" style={cardStyle}>
              <Bar width="33%" delayMs={baseDelay} h="1rem" mt="mb-2" />
              <div className="space-y-1.5">
                {Array.from({ length: lines }).map((_, li) => (
                  <Bar
                    key={li}
                    width={`${100 - li * 12}%`}
                    delayMs={baseDelay + (li + 1) * (staggerMs / 2)}
                    h="0.5rem"
                  />
                ))}
             </div>
           </div>
          );
        };

        // Container grid varies by layout type so the preview reads naturally.
        const containerClass =
          skeletonType === 'list' ? 'flex flex-col gap-2 p-2 w-full max-w-md' :
          skeletonType === 'avatar' ? 'flex flex-row flex-wrap justify-center gap-4 p-2 w-full max-w-md' :
          skeletonType === 'text' ? 'flex flex-col gap-3 p-2 w-full max-w-md' :
          'grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-3 p-2 w-full max-w-md';

        return (
          <div className={containerClass} style={{ color: 'transparent' }}>
            {Array.from({ length: count }).map((_, i) => renderItem(i))}
         </div>
        );
      })()}
    </div>
  );

  // Render the loading backdrop as a single full-bleed surface. For
  // colour/gradient it's a plain div carrying the fill; for image/video it's
  // a media element. Opacity + blur are applied to the media/gradient layer
  // so the base `background` colour stays visible behind a transparent fade.
  const renderBackdrop = (): React.ReactNode => {
    const blurFilter = bgBlur > 0 ? `filter:blur(${bgBlur}px);` : '';
    const layerOpacity = Math.max(0, Math.min(1, bgOpacity));

    if (bgType === 'image' && bgImage) {
      return (
        <div
          className="absolute inset-0 w-full h-full"
          style={{
            opacity: layerOpacity,
            backgroundImage: `url('${bgImage.replace(/'/g, "\\'")}')`,
            backgroundSize: bgSize || 'cover',
            backgroundPosition: bgPosition || 'center',
            backgroundRepeat: bgRepeat || 'no-repeat',
            filter: bgBlur > 0 ? `blur(${bgBlur}px)` : undefined,
          }}
        />
      );
    }
    if (bgType === 'video' && bgVideo) {
      return (
        <div
          className="absolute inset-0 w-full h-full overflow-hidden"
          style={{ opacity: layerOpacity, filter: bgBlur > 0 ? `blur(${bgBlur}px)` : undefined }}
        >
          <video autoPlay muted loop playsInline className="w-full h-full object-cover">
            <source src={bgVideo} />
          </video>
        </div>
      );
    }
    if (bgType === 'gradient' && bgGradient) {
      return (
        <div
          className="absolute inset-0 w-full h-full"
          style={{
            opacity: layerOpacity,
            backgroundImage: bgGradient,
            filter: bgBlur > 0 ? `blur(${bgBlur}px)` : undefined,
          }}
        />
      );
    }
    return null;
  };

  // Compute the base backdrop fill. When the admin picked an image/video/
  // gradient we want the solid `background` colour to show through the
  // opacity scrim, so we always set it. The renderBackdrop() element paints
  // the media on top.
  const baseBackdropStyle: React.CSSProperties = { backgroundColor: background };

  if (fullScreen) {
    return (
      <div
        className="fixed inset-0 backdrop-blur-sm z-50 flex items-center justify-center overflow-hidden"
        style={baseBackdropStyle}
      >
        {renderBackdrop()}
        <div className="relative flex flex-col items-center space-y-4">
          {loadingContent}
          {text && <div className={`${textSizeClasses[size]} text-[var(--ks-loading-text,#ffffff)] text-center`}>{text}</div>}
        </div>
      </div>
    );
  }

  return (
    <div className="relative flex flex-col items-center space-y-2 overflow-hidden" style={baseBackdropStyle}>
      {renderBackdrop()}
      <div className="relative flex flex-col items-center space-y-2">
        {loadingContent}
        {text && <div className={`${textSizeClasses[size]} text-[var(--ks-loading-text,#ffffff)]`}>{text}</div>}
      </div>
    </div>
  );
};

export default Loading;