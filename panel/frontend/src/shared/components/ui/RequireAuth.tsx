import React, { PropsWithChildren } from 'react';
import { Navigate, useLocation } from 'react-router-dom';
import { useAuthStore } from '@/shared/stores/authStore';
import { useThemeStore } from '@/shared/stores/themeStore';
import Loading from '@/shared/components/ui/Loading';

const RequireAuth: React.FC<PropsWithChildren> = ({ children }) => {
  const token = useAuthStore((s) => s.token);
  const initialized = useAuthStore((s) => s.initialized);
  const location = useLocation();
  const active = useThemeStore((s) => s.active);

  if (!initialized) {
    // active() resolves the route's theme; we read its `loading` section so
    // the auth boot splash honours the admin's theme loading config instead
    // of always falling back to the hardcoded default. Selecting `s.active`
    // (the function) and then reading `.loading` on it returns undefined
    // forever (a function has no .loading), which silently made the theme
    // "Loading" studio tab a no-op on this splash.
    return <AuthBootSplash loading={active()?.loading} />;
  }

  if (!token) {
    return <Navigate to="/auth/login" state={{ from: location }} replace />;
  }

  return <>{children}</>;
};

const AuthBootSplash: React.FC<{ loading?: any }> = ({ loading }) => {
  const fallback = {
    type: 'cycle',
    color: '#3b82f6',
    background: 'rgba(0, 0, 0, 0.50)',
    bg_type: 'color',
    bg_image: '',
    bg_video: '',
    bg_gradient: '',
    bg_opacity: 1,
    bg_size: 'cover',
    bg_position: 'center',
    bg_repeat: 'no-repeat',
    bg_blur: 0,
    text_color: '#ffffff',
    show_header: true,
    show_sidebar: true,
    full_screen: true,
    size: 'lg',
    animation_speed: 'normal',
    show_text: true,
    text: 'Loading...',
    skeleton_type: 'cards',
    skeleton_count: 3,
    skeleton_lines: 3,
    skeleton_base_color: 'rgba(255,255,255,0.06)',
    skeleton_shimmer_color: 'rgba(255,255,255,0.18)',
    skeleton_speed: 'normal',
    skeleton_interval: 1200,
    skeleton_radius: 6,
  };

  const cfg = loading || fallback;

  // Compute the custom backdrop layer (image/video/gradient) so it fills
  // the full screen with the cycle/skeleton painted on top.
  const renderBackdrop = (): React.ReactNode => {
    const layerOpacity = Math.max(0, Math.min(1, cfg.bg_opacity ?? 1));
    if (cfg.bg_type === 'image' && cfg.bg_image) {
      return (
        <div
          className="absolute inset-0 w-full h-full"
          style={{
            opacity: layerOpacity,
            backgroundImage: `url('${cfg.bg_image.replace(/'/g, "\\'")}')`,
            backgroundSize: cfg.bg_size || 'cover',
            backgroundPosition: cfg.bg_position || 'center',
            backgroundRepeat: cfg.bg_repeat || 'no-repeat',
            filter: cfg.bg_blur && cfg.bg_blur > 0 ? `blur(${cfg.bg_blur}px)` : undefined,
          }}
        />
      );
    }
    if (cfg.bg_type === 'video' && cfg.bg_video) {
      return (
        <div
          className="absolute inset-0 w-full h-full overflow-hidden"
          style={{ opacity: layerOpacity, filter: cfg.bg_blur && cfg.bg_blur > 0 ? `blur(${cfg.bg_blur}px)` : undefined }}
        >
          <video autoPlay muted loop playsInline className="w-full h-full object-cover">
            <source src={cfg.bg_video} />
        </video>
      </div>
      );
    }
    if (cfg.bg_type === 'gradient' && cfg.bg_gradient) {
      return (
        <div
          className="absolute inset-0 w-full h-full"
          style={{
            opacity: layerOpacity,
            backgroundImage: cfg.bg_gradient,
            filter: cfg.bg_blur && cfg.bg_blur > 0 ? `blur(${cfg.bg_blur}px)` : undefined,
          }}
        />
      );
    }
    return null;
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center overflow-hidden"
      style={{ background: cfg.background }}
    >
      {renderBackdrop()}
      <div className="relative z-10 flex flex-col items-center justify-center space-y-6">
        <div style={{ color: cfg.color }}>
          <Loading
            type={cfg.type}
            color=""
            size={cfg.size}
            skeletonType={cfg.skeleton_type}
            skeletonCount={cfg.skeleton_count}
            skeletonLines={cfg.skeleton_lines}
            skeletonBaseColor={cfg.skeleton_base_color}
            skeletonShimmerColor={cfg.skeleton_shimmer_color}
            skeletonSpeed={cfg.skeleton_speed}
            skeletonInterval={cfg.skeleton_interval}
            skeletonRadius={cfg.skeleton_radius}
            bgType="color"
            background="transparent"
          />
      </div>
        {cfg.show_text && (
          <div className="text-xl font-medium" style={{ color: cfg.text_color }}>
            {cfg.text}
        </div>
        )}
    </div>
  </div>
  );
};

export default RequireAuth;
