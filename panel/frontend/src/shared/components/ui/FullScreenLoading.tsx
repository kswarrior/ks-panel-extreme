import React from 'react';
import Loading from './Loading';

interface FullScreenLoadingProps {
  type?: 'cycle' | 'horizontal-bar' | 'vertical-bar' | 'dots' | 'pulse' | 'wave' | 'spiral' | 'skeleton';
  color?: string;
  text?: string;
  showHeader?: boolean;
  showSidebar?: boolean;
  background?: 'dark' | 'light' | 'transparent';
  customContent?: React.ReactNode;
  // Skeleton options.
  skeletonType?: 'cards' | 'list' | 'text' | 'avatar' | 'mixed';
  skeletonCount?: number;
  skeletonLines?: number;
  skeletonBaseColor?: string;
  skeletonShimmerColor?: string;
  skeletonSpeed?: 'slow' | 'normal' | 'fast';
  skeletonInterval?: number;
  skeletonRadius?: number;
  // Loading backdrop options (mirrors the card background tab).
  bgType?: 'color' | 'image' | 'video' | 'gradient';
  bgColor?: string;
  bgImage?: string;
  bgVideo?: string;
  bgGradient?: string;
  bgOpacity?: number;
  bgSize?: string;
  bgPosition?: string;
  bgRepeat?: 'repeat' | 'no-repeat';
  bgBlur?: number;
}

const FullScreenLoading: React.FC<FullScreenLoadingProps> = ({
  type = 'cycle',
  color = 'text-blue-500',
  text = 'Loading...',
  showHeader = false,
  showSidebar = false,
  background = 'dark',
  customContent,
  skeletonType,
  skeletonCount,
  skeletonLines,
  skeletonBaseColor,
  skeletonShimmerColor,
  skeletonSpeed,
  skeletonInterval,
  skeletonRadius,
  bgType,
  bgColor,
  bgImage,
  bgVideo,
  bgGradient,
  bgOpacity,
  bgSize,
  bgPosition,
  bgRepeat,
  bgBlur,
}) => {
  const backgroundClasses = {
    dark: 'bg-black/50 backdrop-blur-sm',
    light: 'bg-white/90 backdrop-blur-sm',
    transparent: 'bg-transparent backdrop-blur-sm',
  };

  const renderHeader = () => {
    if (!showHeader) return null;
    
    return (
      <header className="fixed top-0 left-0 right-0 z-40 bg-black/20 backdrop-blur-sm border-b border-white/10">
        <div className="flex items-center justify-between px-6 py-3">
          <div className="flex items-center space-x-3">
            <div className="w-8 h-8 bg-white/10 rounded-lg flex items-center justify-center">
              <span className="text-white font-bold text-lg">K</span>
            </div>
            <span className="text-white font-semibold">KS Panel</span>
          </div>
          <div className="flex items-center space-x-2">
            <Loading type="dots" color="text-white" size="sm" />
          </div>
        </div>
      </header>
    );
  };

  const renderSidebar = () => {
    if (!showSidebar) return null;
    
    return (
      <aside className="fixed left-0 top-0 bottom-0 w-64 z-30 bg-black/20 backdrop-blur-sm border-r border-white/10">
        <div className="p-4">
          <div className="space-y-2">
            {[1, 2, 3, 4, 5].map((i) => (
              <div key={i} className="w-full h-8 bg-white/5 rounded animate-pulse" />
            ))}
          </div>
        </div>
      </aside>
    );
  };

  const renderMainContent = () => {
    if (customContent) {
      return customContent;
    }

    // We render the custom backdrop (image/video/gradient) at the top level
    // below so the Loading component itself only paints the animation on top
    // of it. Passing bgType='color' with a transparent background ensures
    // Loading's own backdrop layer is a no-op and the cycle / skeleton
    // sits directly over the full-bleed image.
    return (
      <div className="flex flex-col items-center justify-center min-h-screen relative z-10">
        <Loading
          type={type}
          color={color}
          size="lg"
          skeletonType={skeletonType}
          skeletonCount={skeletonCount}
          skeletonLines={skeletonLines}
          skeletonBaseColor={skeletonBaseColor}
          skeletonShimmerColor={skeletonShimmerColor}
          skeletonSpeed={skeletonSpeed}
          skeletonInterval={skeletonInterval}
          skeletonRadius={skeletonRadius}
          bgType="color"
          background="transparent"
        />
        {text && (
          <div className="mt-6 text-white text-xl font-medium text-center">
            {text}
         </div>
        )}
     </div>
    );
  };

  // Render the admin's custom loading backdrop as a full-bleed surface so
  // an uploaded image / video / gradient fills the whole screen and the
  // loading animation paints on top of it (cycle-in-place-over-image).
  const renderCustomBackdrop = (): React.ReactNode => {
    const layerOpacity = Math.max(0, Math.min(1, bgOpacity ?? 1));
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
            filter: bgBlur && bgBlur > 0 ? `blur(${bgBlur}px)` : undefined,
          }}
        />
      );
    }
    if (bgType === 'video' && bgVideo) {
      return (
        <div
          className="absolute inset-0 w-full h-full overflow-hidden"
          style={{ opacity: layerOpacity, filter: bgBlur && bgBlur > 0 ? `blur(${bgBlur}px)` : undefined }}
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
            filter: bgBlur && bgBlur > 0 ? `blur(${bgBlur}px)` : undefined,
          }}
        />
      );
    }
    return null;
  };

  return (
    <div className={`ks-loading-host fixed inset-0 ${backgroundClasses[background]} z-50 overflow-hidden`} style={{ backgroundColor: bgColor }}>
      {renderCustomBackdrop()}
      {renderHeader()}
      {renderSidebar()}
      <main className="pt-16 pl-64 min-h-screen">
        {renderMainContent()}
     </main>
   </div>
  );
};

// Specialized loading components
const PageLoading: React.FC<{ text?: string }> = ({ text = 'Loading...' }) => (
  <FullScreenLoading type="cycle" text={text} showHeader={true} showSidebar={true} />
);

const AuthLoading: React.FC<{ text?: string }> = ({ text = 'Authenticating...' }) => (
  <FullScreenLoading type="pulse" text={text} background="transparent" />
);

const DashboardLoading: React.FC<{ text?: string }> = ({ text = 'Loading Dashboard...' }) => (
  <FullScreenLoading type="horizontal-bar" text={text} showHeader={true} showSidebar={true} />
);

const InstanceLoading: React.FC<{ text?: string }> = ({ text = 'Loading Instance...' }) => (
  <FullScreenLoading type="vertical-bar" text={text} showHeader={true} showSidebar={true} />
);

export {
  FullScreenLoading,
  PageLoading,
  AuthLoading,
  DashboardLoading,
  InstanceLoading,
};