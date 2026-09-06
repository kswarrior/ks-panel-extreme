import React, { useEffect, useState } from 'react';
import { useParams } from 'react-router-dom';
import CustomPageView from '@/shared/components/ui/CustomPageView';
import SkeletonCard from '@/shared/components/ui/SkeletonCard';
import { fetchPanelPageBySlug, type PanelPage } from '@/features/settings/api/panelPages';
import { usePanelPagesStore } from '@/features/settings/stores/panelPagesStore';

// PanelPageView renders one admin-authored custom page (Settings > Pages)
// at /pages/:slug. Visibility is enforced server-side (enabled + role
// allow-list); a hidden page answers 404 and lands here.
const PanelPageView: React.FC = () => {
  const { slug = '' } = useParams<{ slug: string }>();
  const loadNav = usePanelPagesStore((s) => s.load);
  const [page, setPage] = useState<PanelPage | null>(null);
  const [loading, setLoading] = useState(true);
  const [missing, setMissing] = useState(false);

  useEffect(() => {
    loadNav();
  }, [loadNav]);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setMissing(false);
    setPage(null);
    (async () => {
      try {
        const p = await fetchPanelPageBySlug(slug);
        if (cancelled) return;
        setPage(p);
        if (typeof document !== 'undefined') document.title = p.name;
      } catch {
        if (!cancelled) setMissing(true);
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [slug]);

  if (loading) {
    return (
      <div>
        <SkeletonCard lines={4} />
      </div>
    );
  }

  if (missing || !page) {
    return (
      <div className="glass-card ks-form-card rounded-xl px-4 py-10 text-center">
        <p className="text-sm text-gray-300 font-medium">Page not found</p>
        <p className="text-xs text-gray-500 mt-1">It may be switched off or hidden from your role.</p>
      </div>
    );
  }

  return (
    <div className="glass-card ks-form-card rounded-xl">
      <CustomPageView
        title={page.name}
        content={{
          type: page.content_type === 'html' ? 'html' : 'markdown',
          html: page.content_type === 'html' ? page.content : undefined,
          markdown: page.content_type === 'markdown' ? page.content : undefined,
        }}
        pageSlug={page.slug}
      />
    </div>
  );
};

export default PanelPageView;
